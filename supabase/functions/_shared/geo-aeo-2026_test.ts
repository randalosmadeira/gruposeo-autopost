import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateFrontloading,
  buildDynamicSchema,
  buildGeo2026Block,
  detectLegalSubArea,
} from "./geo-aeo-2026.ts";

Deno.test("validateFrontloading — valid passes", () => {
  const html = `<p>A audiência de custódia ocorre em 24h conforme art. 310 do CPP em SP. Este é um texto longo o suficiente para atingir o limite de quarenta palavras exigido pela regra de frontloading do ano de dois mil e vinte e seis no Brasil.</p>`;
  const r = validateFrontloading(html);
  assert(r.passes);
});

Deno.test("buildDynamicSchema — always emits Person + WebSite + TechArticle + FAQPage + sameAs + LegalService", () => {
  const schema = buildDynamicSchema({});
  assertStringIncludes(schema, "Person");
  assertStringIncludes(schema, "WebSite");
  assertStringIncludes(schema, "TechArticle");
  assertStringIncludes(schema, "FAQPage");
  assertStringIncludes(schema, "sameAs");
  assertStringIncludes(schema, "LegalService");
});

Deno.test("buildDynamicSchema — includes LocalBusiness only when isLocalUrgency=true", () => {
  const off = buildDynamicSchema({ isLocalUrgency: false });
  assert(!off.includes("LocalBusiness"));

  const on = buildDynamicSchema({ isLocalUrgency: true });
  assertStringIncludes(on, "LocalBusiness");
});

Deno.test("detectLegalSubArea — maps keywords", () => {
  assertEquals(detectLegalSubArea("audiência de custódia"), "audiencia_custodia");
});
