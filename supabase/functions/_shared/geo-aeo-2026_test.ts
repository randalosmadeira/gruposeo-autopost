import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateFrontloading,
  buildDynamicSchema,
  buildGeo2026Block,
  detectLegalSubArea,
  type LegalSubArea,
} from "./geo-aeo-2026.ts";

Deno.test("validateFrontloading — valid §1 with legal base and jurisdiction passes", () => {
  const html = `<p class="lead-answer" data-geo="frontload">A audiência de custódia é realizada em até 24 horas após a prisão em flagrante, conforme art. 310 do CPP e Resolução CNJ 213/2015. Em São Paulo, ocorre no DIPO com defensor obrigatório, garantindo o controle judicial imediato da legalidade da prisão.</p>`;
  const r = validateFrontloading(html);
  assert(r.passes, `expected pass, got: ${r.reason}`);
  assert(r.wordCount >= 40 && r.wordCount <= 80, `word count ${r.wordCount} out of range`);
  assert(r.hasLegalBase);
});

Deno.test("buildDynamicSchema — always emits Person + WebSite + TechArticle + FAQPage + sameAs + LegalService", () => {
  const schema = buildDynamicSchema({});
  assertStringIncludes(schema, '"@type": "Person"');
  assertStringIncludes(schema, '"@type": "WebSite"');
  assertStringIncludes(schema, '"@type": "TechArticle"');
  assertStringIncludes(schema, '"@type": "FAQPage"');
  assertStringIncludes(schema, "sameAs");
  assertStringIncludes(schema, "LegalService");
});

Deno.test("buildDynamicSchema — includes LocalBusiness only when isLocalUrgency=true", () => {
  const off = buildDynamicSchema({ isLocalUrgency: false });
  assert(!off.includes('"LocalBusiness"'), "LocalBusiness must not appear when not urgent");

  const on = buildDynamicSchema({
    isLocalUrgency: true,
    officePhone: "+55 11 99999-9999",
  });
  assertStringIncludes(on, '"LocalBusiness"');
  assertStringIncludes(on, 'openingHoursSpecification');
});

Deno.test("detectLegalSubArea — maps keywords to expected sub-areas", () => {
  assertEquals(detectLegalSubArea("audiência de custódia em SP"), "audiencia_custodia");
  assertEquals(detectLegalSubArea("penal empresarial e colarinho branco"), "criminal_empresarial");
  assertEquals(detectLegalSubArea("tópico completamente aleatório"), "generico");
});
