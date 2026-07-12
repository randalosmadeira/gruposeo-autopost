import { useMemo } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FirstSentencePreviewProps {
  content: string | null | undefined;
}

/**
 * Extracts the first sentence of the article (prefers the `.lead-answer`
 * paragraph, falls back to first <p>) and counts its words.
 *
 * Applies the GEO 2026 AEO golden rule: 1st sentence must be ≤30 words so
 * ChatGPT/Gemini can quote it as a snippet.
 */
export function extractFirstSentence(html: string): string {
  if (!html) return "";
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, "");
  // Prefer lead-answer paragraph
  const leadMatch = cleaned.match(/<p[^>]*class=["'][^"']*lead-answer[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  const firstP = leadMatch
    ? leadMatch[1]
    : (cleaned.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? cleaned);
  const text = firstP.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const idx = text.search(/[.!?…](\s|$)/);
  return idx >= 0 ? text.slice(0, idx + 1).trim() : text;
}

export function countWords(sentence: string): number {
  if (!sentence) return 0;
  return sentence.split(/\s+/).filter(Boolean).length;
}

export function FirstSentencePreview({ content }: FirstSentencePreviewProps) {
  const { sentence, words, ok, hasLead } = useMemo(() => {
    const html = content || "";
    const s = extractFirstSentence(html);
    const w = countWords(s);
    return {
      sentence: s,
      words: w,
      ok: w > 0 && w <= 30,
      hasLead: /class=["'][^"']*lead-answer/.test(html),
    };
  }, [content]);

  if (!sentence) return null;

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs flex items-start gap-2 ${
        ok
          ? "border-emerald-500/40 bg-emerald-500/5"
          : words > 30
          ? "border-destructive/40 bg-destructive/5"
          : "border-muted"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">Regra AEO 2026 · 1ª frase</span>
          <Badge variant={ok ? "default" : "destructive"} className="text-[10px] h-5">
            {words} {words === 1 ? "palavra" : "palavras"} / 30
          </Badge>
          {hasLead ? (
            <Badge variant="outline" className="text-[10px] h-5">lead-answer</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] h-5">sem lead-answer</Badge>
          )}
          <span className={ok ? "text-emerald-700" : "text-destructive"}>
            {ok
              ? "cumprindo a regra ≤30 palavras"
              : words > 30
              ? `${words - 30} palavra(s) acima do limite`
              : "—"}
          </span>
        </div>
        <p className="mt-1 text-muted-foreground line-clamp-2 italic">"{sentence}"</p>
      </div>
    </div>
  );
}
