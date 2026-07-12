import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateFrontloading,
  buildDynamicSchema,
  buildGeo2026Block,
  detectLegalSubArea,
  type LegalSubArea,
} from "./geo-aeo-2026.ts";
import {
  LEGAL_HIGH_COMPLEXITY_SUBAREAS,
  resolveLegalHighComplexitySubArea,
  mapSegmentToSector,
} from "./sector-config.ts";

// ============================================================
// validateFrontloading
// ============================================================

Deno.test("validateFrontloading — valid §1 with legal base and jurisdiction passes", () => {
  const html = `<p class="lead-answer" data-geo="frontload">A audiência de custódia é realizada em até 24 horas após a prisão em flagrante, conforme art. 310 do CPP e Resolução CNJ 213/2015. Em São Paulo, ocorre no DIPO com defensor obrigatório, garantindo o controle judicial imediato da legalidade da prisão.</p>`;
  const r = validateFrontloading(html);
  assert(r.passes, `expected pass, got: ${r.reason}`);
  assert(r.wordCount >= 40 && r.wordCount <= 80, `word count ${r.wordCount} out of range`);
  assert(r.hasLegalBase);
  assert(r.hasJurisdiction);
});

Deno.test("validateFrontloading — too short §1 fails", () => {
  const html = `<p class="lead-answer">Curto demais.</p>`;
  const r = validateFrontloading(html);
  assertEquals(r.passes, false);
  assert(r.wordCount < 40);
  assertStringIncludes(r.reason || "", "Frontload inválido");
});

Deno.test("validateFrontloading — missing legal base fails", () => {
  const html = `<p>Este texto fala sobre um tema muito interessante que impacta diariamente milhares de brasileiros em todo território nacional. Vamos explorar juntos as principais nuances deste assunto complexo e relevante para a sociedade em São Paulo hoje mesmo agora.</p>`;
  const r = validateFrontloading(html);
  assertEquals(r.hasLegalBase, false);
  assertEquals(r.passes, false);
});

Deno.test("validateFrontloading — detects legal base via lei/tribunal patterns", () => {
  const cases = [
    "conforme art. 5º da CF e a Lei 12.850/2013 aplicável em São Paulo com decisão do STJ em 2024 sobre a matéria em análise pelo tribunal competente para julgar essas demandas empresariais",
    "a Súmula 479 do STJ define a responsabilidade objetiva dos bancos por fraudes em operações no Brasil e vem sendo aplicada pelos tribunais estaduais desde 2012 em contratos de consumo em geral",
  ];
  for (const text of cases) {
    const r = validateFrontloading(`<p>${text}</p>`);
    assert(r.hasLegalBase, `should detect legal base in: ${text}`);
  }
});

Deno.test("validateFrontloading — falls back to first <p> when no lead-answer class", () => {
  const html = `<p>A Lei 8.137/1990 tipifica crimes contra a ordem tributária no Brasil e exige dolo específico para configuração do delito conforme entendimento consolidado do STF em São Paulo e nos tribunais federais brasileiros para autuações do fisco.</p><p>Outro parágrafo.</p>`;
  const r = validateFrontloading(html);
  assert(r.hasLegalBase);
  assert(r.hasJurisdiction);
});

// Regra ouro AEO 2026: 1ª frase (resposta direta) ≤30 palavras
Deno.test("validateFrontloading — 1ª frase >30 palavras falha (regra ouro AEO 2026)", () => {
  const longFirst = `<p class="lead-answer">A audiência de custódia consiste em um procedimento presencial obrigatório realizado em até vinte e quatro horas depois da prisão em flagrante ou preventiva em qualquer estado brasileiro conforme entendimento consolidado. A base legal aplicável é o art. 310 do CPP e a Resolução CNJ 213 de 2015 em São Paulo capital.</p>`;
  const r = validateFrontloading(longFirst);
  assertEquals(r.hasDirectAnswer, false);
  assertEquals(r.passes, false);
  assertStringIncludes(r.reason || "", "1ª frase");
});

Deno.test("validateFrontloading — 1ª frase ≤30 palavras + base legal + tamanho OK passa", () => {
  const html = `<p class="lead-answer">A audiência de custódia ocorre em até 24 horas após a prisão em flagrante (art. 310 do CPP). Em São Paulo, é realizada no DIPO com defensor obrigatório, garantindo o controle judicial imediato da legalidade da prisão perante o juízo competente.</p>`;
  const r = validateFrontloading(html);
  assert(r.hasDirectAnswer, `first sentence=${r.firstSentenceWordCount} words`);
  assert(r.passes, `expected pass, got: ${r.reason}`);
});



// ============================================================
// buildDynamicSchema — consistency per sub-area
// ============================================================

Deno.test("buildDynamicSchema — always emits LegalService + TechArticle + FAQPage + Legislation", () => {
  const schema = buildDynamicSchema({});
  assertStringIncludes(schema, '"@type": "LegalService"');
  assertStringIncludes(schema, '"@type": "TechArticle"');
  assertStringIncludes(schema, '"@type": "FAQPage"');
  assertStringIncludes(schema, '"@type": "Legislation"');
  assertStringIncludes(schema, '"@type": "Attorney"');
});

Deno.test("buildDynamicSchema — includes LocalBusiness only when isLocalUrgency=true", () => {
  const off = buildDynamicSchema({ isLocalUrgency: false });
  assert(!off.includes('"LocalBusiness"'), "LocalBusiness must not appear when not urgent");

  const on = buildDynamicSchema({
    isLocalUrgency: true,
    officeGeo: { lat: -23.5, lng: -46.6 },
    officePhone: "+55 11 99999-9999",
  });
  assertStringIncludes(on, '"LocalBusiness"');
  assertStringIncludes(on, 'openingHoursSpecification');
  assertStringIncludes(on, 'GeoCoordinates');
  assertStringIncludes(on, '-23.5');
});

Deno.test("buildGeo2026Block — includes YMYL block matching sub-area", () => {
  const areas: LegalSubArea[] = [
    "criminal_empresarial",
    "ordem_economica_tributaria",
    "fraudes_icms",
    "assessoria_isp",
    "audiencia_custodia",
  ];
  for (const subArea of areas) {
    const block = buildGeo2026Block({ subArea });
    assertStringIncludes(block, `Sub-área detectada: **${subArea}**`);
    // Every block emits the full schema set
    assertStringIncludes(block, "LegalService");
    assertStringIncludes(block, "TechArticle");
    assertStringIncludes(block, "FAQPage");
    assertStringIncludes(block, "Legislation");
  }
});

Deno.test("buildGeo2026Block — audiencia_custodia forces LocalBusiness in schema", () => {
  const block = buildGeo2026Block({ subArea: "audiencia_custodia", isLocalUrgency: true });
  assertStringIncludes(block, "LocalBusiness");
  assertStringIncludes(block, "openingHoursSpecification");
});

// ============================================================
// Sub-area detection consistency
// ============================================================

Deno.test("detectLegalSubArea — maps keywords to expected sub-areas", () => {
  assertEquals(detectLegalSubArea("audiência de custódia em SP"), "audiencia_custodia");
  assertEquals(detectLegalSubArea("penal empresarial e colarinho branco"), "criminal_empresarial");
  assertEquals(detectLegalSubArea("fraude ICMS SEFAZ"), "fraudes_icms");
  assertEquals(detectLegalSubArea("provedor de internet e LGPD"), "assessoria_isp");
  assertEquals(detectLegalSubArea("tópico completamente aleatório"), "generico");
});

// ============================================================
// legal-high-complexity sector mapping
// ============================================================

Deno.test("resolveLegalHighComplexitySubArea — routes Penal / Tributário / ISPs correctly", () => {
  assertEquals(resolveLegalHighComplexitySubArea("defesa penal empresarial"), "criminal_empresarial");
  assertEquals(resolveLegalHighComplexitySubArea("crime tributário e sonegação"), "ordem_economica_tributaria");
  assertEquals(resolveLegalHighComplexitySubArea("autuação ICMS SEFAZ"), "fraudes_icms");
  assertEquals(resolveLegalHighComplexitySubArea("provedor ISP marco civil"), "assessoria_isp");
  assertEquals(resolveLegalHighComplexitySubArea("audiência de custódia flagrante"), "audiencia_custodia");
  assertEquals(resolveLegalHighComplexitySubArea("assunto totalmente desconhecido"), null);
});

Deno.test("mapSegmentToSector — accepts legal-high-complexity aliases", () => {
  assertEquals(mapSegmentToSector("legal-high-complexity"), "legal-high-complexity");
  assertEquals(mapSegmentToSector("legal_high_complexity"), "legal-high-complexity");
  assertEquals(mapSegmentToSector("legal"), "legal");
});

Deno.test("LEGAL_HIGH_COMPLEXITY_SUBAREAS — all entries declare consistent schema pack", () => {
  for (const [area, cfg] of Object.entries(LEGAL_HIGH_COMPLEXITY_SUBAREAS)) {
    assertStringIncludes(cfg.schema, "LegalService");
    assertStringIncludes(cfg.schema, "Attorney");
    assertStringIncludes(cfg.schema, "TechArticle");
    assertStringIncludes(cfg.schema, "FAQPage");
    assertStringIncludes(cfg.schema, "Legislation");
    if (area === "audiencia_custodia") {
      assertStringIncludes(cfg.schema, "LocalBusiness");
    }
    assert(cfg.keywords.length > 0, `${area} must declare keywords`);
    assert(cfg.label.length > 0, `${area} must declare a label`);
  }
});
