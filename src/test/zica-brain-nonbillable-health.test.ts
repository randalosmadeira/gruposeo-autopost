import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/zica-brain-tick/index.ts"),
  "utf8",
);

describe("zica brain provider health", () => {
  it("does not call paid model endpoints during automatic health checks", () => {
    const start = source.indexOf("async function providerHealth");
    const end = source.indexOf("async function auditArticle", start);
    const providerHealth = source.slice(start, end);

    expect(providerHealth).not.toContain("api.openai.com/v1/responses");
    expect(providerHealth).not.toContain("api.anthropic.com/v1/messages");
    expect(providerHealth).toContain('billable_probe: false');
    expect(providerHealth).toContain('mode: "non_billable_configuration_check"');
  });
});

describe("RSS automation service authentication", () => {
  it("accepts current Supabase secret keys without decoding them as JWTs", () => {
    const rss = readFileSync(
      resolve(process.cwd(), "supabase/functions/auto-process-rss/index.ts"),
      "utf8",
    );

    expect(rss).toContain('Deno.env.get("SUPABASE_SECRET_KEY")');
    expect(rss).toContain("if (token !== serviceKey)");
    expect(rss).not.toContain("function jwtRole");
  });
});

describe("supporter avatar candidate selection", () => {
  it("caps vision inputs before contacting a paid provider", () => {
    const avatar = readFileSync(
      resolve(process.cwd(), "supabase/functions/generate-supporter-avatar/index.ts"),
      "utf8",
    );
    expect(avatar).toContain(".slice(0, 5)");
    expect(avatar).toContain("candidatePreviewUrl(item.candidate, 768)");
    expect(avatar).toContain("vision_shortlist_size: shortlist.length");
  });
});

describe("provider-reported token ledger", () => {
  it("records real usage for every orchestrated model call", () => {
    const orchestrator = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/ai-orchestrator.ts"),
      "utf8",
    );
    const resolver = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/byok-resolver.ts"),
      "utf8",
    );
    expect(orchestrator).toContain("setUsageSink");
    expect(orchestrator).toContain("prompt_tokens");
    expect(orchestrator).toContain("input_tokens");
    expect(resolver).toContain('source: "provider_reported_usage"');
  });
});
