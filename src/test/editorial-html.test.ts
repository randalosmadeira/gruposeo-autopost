import { describe, expect, it } from "vitest";
import { normalizeEditorialHtml } from "../../supabase/functions/_shared/editorial-html";

describe("editorial HTML quality gate", () => {
  it("converts raw Markdown into semantic WordPress HTML", () => {
    const source = `# Título duplicado\n\n## Direitos do consumidor\n\nO prazo é **importante** para o consumidor.\n\n- Primeiro requisito\n- Segundo requisito`;
    const result = normalizeEditorialHtml(source);

    expect(result.pass).toBe(true);
    expect(result.html).not.toMatch(/<h1\b/i);
    expect(result.html).not.toMatch(/(^|\n)\s*#{1,6}\s+/);
    expect(result.html).not.toContain("**importante**");
    expect(result.html).toContain("<strong>importante</strong>");
    expect(result.metrics.h2Count).toBeGreaterThanOrEqual(2);
    expect(result.metrics.listCount).toBe(1);
  });

  it("demotes body H1 and removes unsafe markup", () => {
    const source = `<h1>Não pode ser H1</h1><p>Texto <strong>válido</strong>.</p><script>alert('x')</script>`;
    const result = normalizeEditorialHtml(source);

    expect(result.pass).toBe(true);
    expect(result.html).toContain("<h2>Não pode ser H1</h2>");
    expect(result.html).not.toContain("<h1");
    expect(result.html).not.toContain("<script");
  });

  it("adds the editorial answer capsule to the first paragraph", () => {
    const result = normalizeEditorialHtml("Primeiro parágrafo direto.\n\nSegundo parágrafo explicativo.");
    expect(result.html).toContain('class="zica-answer-capsule"');
  });

  it("blocks raw JSON masquerading as article content", () => {
    const result = normalizeEditorialHtml('{"title":"erro","content":"não publicar"}');
    expect(result.pass).toBe(false);
    expect(result.fatalIssues).toContain("raw_json_document");
  });

  it("flags long articles without headings and semantic emphasis", () => {
    const words = Array.from({ length: 720 }, (_, index) => `palavra${index}`).join(" ");
    const result = normalizeEditorialHtml(words);
    expect(result.issues).toContain("long_content_without_h2");
    expect(result.issues).toContain("long_content_without_semantic_emphasis");
  });
});
