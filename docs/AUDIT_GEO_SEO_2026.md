# Auditoria Técnica GEO/SEO/AEO 2026 — ContentFactory

**Data:** 2026-07-12 · **Escopo:** Todo o pipeline de geração (edge functions + orquestradores + prompts) · **Nicho prioritário:** RDM Advogados (jurídico de alta complexidade — YMYL).

---

## 1. Sumário Executivo

Em 2026 o eixo do SEO deslocou-se para **GEO (Generative Engine Optimization)** e **AEO (Answer Engine Optimization)**. As métricas que importam agora:

| Métrica clássica (2022-2024) | Métrica GEO/AEO 2026 |
| --- | --- |
| Posição orgânica no Google | **Taxa de citação** por ChatGPT/Gemini/Claude/Perplexity |
| CTR na SERP | **Zero-click share** (65-69% das buscas terminam em AI Overview) |
| Densidade de keyword | **Frontloading** (40-60 palavras resolutivas no §1) |
| Backlinks | **Menções em fóruns + Schema.org + vídeo + autoridade de marca** |
| Keyword research | **Intent mapping conversacional** (dor → desejo → decisão) |

**Diagnóstico:** a plataforma tem base sólida (behavioral-directives, brand-seo-geo, verniz-orchestrator) mas está **calibrada para SEO clássico + GEO parcial**. Faltam quatro blocos operacionais para o padrão 2026: (a) validador de frontloading, (b) AEO Answer Blocks estruturados por H2, (c) bloco de citação a cada 200 palavras com fonte+credencial+data, (d) Schema.org dinâmico por tipo de conteúdo com combinações YMYL (LegalService+Attorney+TechArticle+FaqPage+Legislation+LocalBusiness).

---

## 2. Inventário do que existe hoje

### 2.1 Diretrizes de IA ativas
- `_shared/behavioral-directives.ts` — Diretrizes v1 (Anti-Sycophancy, Extreme Ownership, CoT, Google Compliance). **Boas mas de 2024.** Não menciona GEO, AEO, Zero-Click, Frontloading, AI Overviews, SynthID.
- `_shared/verniz-orchestrator.ts` — Detecção de nicho + gatilho emocional + PoV (633 linhas). **Sólido.**
- `_shared/brand-seo-geo.ts` — Prompts por marca (RDM, Elas Tracy, Grupo SEO). **RDM está desatualizado para YMYL 2026.**
- `_shared/seo-prompt-builder.ts` — Builder principal (1035 linhas). **Muito grande.** Já cobre E-E-A-T e Topic Clusters, mas não tem AEO Answer Blocks nem Schema dinâmico multi-tipo.
- `_shared/sector-config.ts` — 9 setores. Falta variante `legal-high-complexity` para RDM.
- `_shared/ai-orchestrator.ts` — Roteador multi-provider. OK, só precisa expor slot para novo bloco.

### 2.2 Funções obsoletas / candidatas a limpeza
| Arquivo | Status | Ação sugerida |
| --- | --- | --- |
| `supabase/functions/painel-migracao/*` + `migrate-sql` + `execute-migration-remote` | Uso pontual (migração VPS concluída) | Manter congelado, mover para pasta `/legacy/` em fase 2 |

| `emotional-triggers-config.ts` | Ativo | Adicionar gatilho "Segurança Institucional" (YMYL) |
| Rotas duplicadas: `ArticleGenerator` + `ArticleGeneratorV2` | Duplicada | Deprecar V1 quando V2 estabilizar |

### 2.3 Gaps críticos 2026
1. **Frontloading não validado** — o prompt pede §1 resolutivo mas não há checker pós-geração.
2. **AEO Answer Blocks** — H2 já é pergunta natural (em alguns setores), mas falta o formato canônico `<p class="aeo-answer">resposta 2 frases</p>` que os AI Overviews extraem.
3. **Bloco de citação a cada 200 palavras** — regra existe no texto, mas sem enforcement estrutural (`<cite data-source="…" data-credential="…" data-date="…">`).
4. **Schema dinâmico** — hoje FAQPage é hardcoded. Falta combinar `LegalService + Attorney + Legislation + LocalBusiness + HowTo` conforme tipo de conteúdo.
5. **Trust markers (SynthID-like)** — nenhuma meta-tag de proveniência (`author`, `dateModified`, `reviewedBy`, `ClaimReview`).
6. **YMYL específico para nicho jurídico de alta complexidade** — o setor `legal` genérico não cobre Penal Empresarial, ICMS, ISPs, Custódia.

---

## 3. Novas diretrizes 2026 a injetar

### 3.1 Google / AI Overviews (Gemini 3.5 Flash)
- Zero-click: assumir que 65-69% dos leitores nunca clicam. Cada §1 deve **entregar valor sem CTA**.
- Multi-modal search: a caixa de busca aceita imagem/vídeo/arquivo → priorizar `ImageObject`, `VideoObject`, `Dataset` no Schema.
- Gemini Spark (agente 24/7): otimizar para consultas conversacionais longas — H2 como pergunta completa, não fragmento.

### 3.2 OpenAI / ChatGPT Search
- Citações diretas: cada artigo precisa de **âncora de citação** (URL canônica + `og:type=article` + `article:author` + `article:published_time`).
- GPT-5.5 prioriza `<blockquote cite="URL">` como sinal de credibilidade.

### 3.3 Anthropic / Claude
- Análise de documentos longos: pillar pages com **sumário estrutural inicial** (`<nav aria-label="Sumário">`) são melhor sintetizadas.
- Preferência por dados tabulares → toda comparação em `<table>` com `<caption>`.

### 3.4 Persona / Intent 2026
- Mapear cada artigo para **DOR → DESEJO → PROVA → DECISÃO** (não mais só keyword).
- Incluir `<meta name="audience-intent" content="pain|desire|proof|decision">`.

### 3.5 YMYL Jurídico Alta Complexidade (RDM-specific)
Sub-áreas: Advocacia Criminal · Assessoria Empresarial · Consumidor · Fraudes Bancárias · Fraudes ICMS · Lei de Execuções Criminais · Lavagem de Dinheiro · Crimes contra Ordem Econômica/Tributária · Estelionato · Audiência de Custódia · ISPs.

Regras não-negociáveis:
- Frontloading **obrigatório** com resposta técnica objetiva (não emocional).
- **Zero promessa de resultado** (OAB 205/2021).
- Toda tese citada precisa de: **artigo de lei + tribunal + ano da jurisprudência**.
- Schema combinado: `LegalService` + `Attorney` (Rândalos Madeira) + `TechArticle` + `FaqPage` + `Legislation` + `LocalBusiness` (para páginas de plantão).
- Para Custódia: `LocalBusiness.openingHours=Mo-Su 00:00-23:59` + `telephone` no fold acima.

---

## 4. Plano de implementação (esta rodada)

| Fase | Entregável | Arquivo |
| --- | --- | --- |
| 1 | **Este relatório** | `docs/AUDIT_GEO_SEO_2026.md` |
| 2 | Módulo GEO/AEO 2026 (frontloading + AEO Answer + citation blocks + schema dinâmico) — **RDM only** | `supabase/functions/_shared/geo-aeo-2026.ts` |
| 3 | Diretrizes comportamentais atualizadas para 2026 | `supabase/functions/_shared/behavioral-directives.ts` |
| 4 | Wiring no prompt RDM | `supabase/functions/_shared/brand-seo-geo.ts` (`buildRDMPrompt`) |

Fases futuras (após validação):
- Expor as sub-áreas YMYL como variantes no `sector-config.ts`.
- Portar validador de frontloading para `generate-article/index.ts` (regenerar se §1 não atende 40-60 palavras resolutivas).
- Atualizar `_types/bulk-generation.ts` para incluir intent-mapping (pain/desire/proof/decision).
- Modelos IA: aguardar chaves Gemini 3.5 Flash + GPT-5.5 do usuário (não usar Lovable AI conforme instrução).

---

## 5. Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Regressão em Elas Tracy / Grupo SEO | Mudanças isoladas em bloco RDM-only. Outros brand builders intocados. |
| Prompt fica gigante e degrada modelo | Novo bloco é modular e só é injetado quando `brand='rdm'`. |
| Compliance OAB | Regras 205/2021 mantidas literalmente no novo bloco. |
| Schema JSON-LD inválido | Templates validados contra schema.org spec (Legal, Legislation, LocalBusiness). |
