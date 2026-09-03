import { describe, expect, it } from "vitest";
import {
  buildEditorialDecisionPrompt,
  fallbackEditorialDecision,
  normalizeArticleLength,
  normalizeEditorialDecision,
  wordBandFor,
} from "../../supabase/functions/_shared/editorial-autonomy";

const baseInput = {
  sourceUrl: "https://example.com/noticia",
  sourceName: "Fonte de teste",
  sourceContent: "Conteúdo informativo sobre mudanças no mercado brasileiro.",
  projectName: "Portal de teste",
  projectNiche: "geral",
};

describe("AI editorial autonomy for repost queues", () => {
  it("normalizes legacy length aliases and preserves the configured word bands", () => {
    expect(normalizeArticleLength("extra-long")).toBe("very-long");
    expect(normalizeArticleLength("auto")).toBe("medium");
    expect(wordBandFor("short")).toMatchObject({ min: 1200, max: 1800 });
    expect(wordBandFor("medium")).toMatchObject({ min: 2400, max: 3600 });
    expect(wordBandFor("long")).toMatchObject({ min: 3600, max: 5200 });
    expect(wordBandFor("extra-long")).toMatchObject({ min: 5200, max: 7000 });
  });

  it("detects legal content and selects a legal analysis fallback", () => {
    const decision = fallbackEditorialDecision({
      ...baseInput,
      sourceContent: "O STJ publicou acórdão sobre recurso e interpretação de lei federal.",
    });

    expect(decision.niche).toBe("advocacia");
    expect(decision.analysisAngleId).toBe("analise_juridica");
    expect(decision.articleLength).toBe("long");
  });

  it("blocks humor, sarcasm, satire and celebration in sensitive stories", () => {
    const decision = normalizeEditorialDecision({
      niche: "geral",
      analysisAngleId: "impacto_brasil",
      analysisAngle: "Impacto social",
      articleLength: "medium",
      emotionalTrigger: "sarcasm",
      emotionalIntensity: "high",
      keyword: "prisão",
      tone: "humorístico",
      riskLevel: "high",
      requiresHumanReview: false,
      confidence: 90,
      reasoningSummary: "Teste",
      diversityNotes: [],
      promptAddendum: "Teste",
    }, {
      ...baseInput,
      sourceContent: "Criança vítima de violência grave durante investigação criminal e prisão do suspeito.",
    });

    expect(decision.emotionalTrigger).toBe("serious");
    expect(decision.requiresHumanReview).toBe(true);
  });

  it("injects queue position and recent decisions into the policy prompt", () => {
    const prompt = buildEditorialDecisionPrompt({
      ...baseInput,
      batchContext: {
        scheduleId: "schedule-123",
        sourceType: "rss",
        queuePosition: 3,
        queueSize: 10,
        feedName: "RSS Jurídico",
        recentDecisions: [
          {
            niche: "advocacia",
            analysisAngleId: "analise_juridica",
            emotionalTrigger: "serious",
            articleLength: "long",
            keyword: "direito do consumidor",
          },
        ],
      },
    });

    expect(prompt).toContain("schedule-123");
    expect(prompt).toContain('"queuePosition":3');
    expect(prompt).toContain('"queueSize":10');
    expect(prompt).toContain("direito do consumidor");
    expect(prompt).toContain("Evitar repetição mecânica");
  });

  it("keeps a safe fallback when the AI returns unsupported values", () => {
    const decision = normalizeEditorialDecision({
      niche: "categoria-inexistente",
      analysisAngleId: "angulo-inexistente",
      articleLength: "gigante",
      emotionalTrigger: "gatilho-inexistente",
      confidence: 500,
    }, baseInput);

    expect(["geral", "advocacia", "saude", "beleza", "tecnologia", "marketing"]).toContain(decision.niche);
    expect(decision.articleLength).toBe("medium");
    expect(decision.confidence).toBe(100);
  });
});
