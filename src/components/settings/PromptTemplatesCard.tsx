import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  Plus,
  ChevronUp,
  ChevronDown,
  Info,
  AlertTriangle,
  Loader2,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  RotateCcw,
  Sparkles,
  Save,
  Bot,
  Zap,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const VARIABLES = [
  { name: '${title}', required: true, description: 'Título do artigo' },
  { name: '${idioma}', required: true, description: 'Idioma do conteúdo (pt-BR, en, etc.)' },
  { name: '${articleLength}', required: false, description: 'Tamanho do artigo (curto, médio, longo)' },
  { name: '${tone}', required: false, description: 'Tom de voz (formal, casual, etc.)' },
  { name: '${pov}', required: false, description: 'Ponto de vista (primeira pessoa, terceira pessoa)' },
  { name: '${contextSection}', required: false, description: 'Seção de contexto adicional' },
  { name: '${sourcesContext}', required: false, description: 'Contexto das fontes de pesquisa' },
  { name: '${context}', required: false, description: 'Contexto geral' },
  { name: '${currentYear}', required: false, description: 'Ano atual' },
  { name: '${language}', required: false, description: 'Alias para idioma' },
];

const TARGET_FUNCTIONS = [
  { id: 'article_generator', label: 'Gerador de Artigos', icon: '📝' },
  { id: 'news_rewriter', label: 'Repostagem Jornalística', icon: '📰' },
  { id: 'landing_page', label: 'Landing Pages', icon: '🎯' },
  { id: 'authority_planner', label: 'Planejador de Autoridade', icon: '📊' },
  { id: 'bulk_generator', label: 'Geração em Massa', icon: '⚡' },
  { id: 'image_generator', label: 'Geração de Imagens', icon: '🎨' },
  { id: 'content_variations', label: 'Variações de Conteúdo', icon: '🔄' },
];

const DEFAULT_TEMPLATES = [
  {
    id: 'blog-seo',
    name: '🎭 Redator SEO Sênior V4',
    description: 'Artigos SEO completos com 11 blocos, 5 CTAs, Flesch 70-100, Filosofia Madeira Sem Verniz. Todos os nichos.',
    prompt: `# 📝 AGENTE REDATOR SEO — BLOG POST COMPLETO V4.0
## Filosofia "Madeira Sem Verniz" — Conteúdo Que Qualquer Pessoa Entende

## 🎭 IDENTIDADE DO AGENTE
Você é um redator sênior com a voz e a filosofia do Dr. Rândalos Madeira: direto, sem enrolação, sem palavrões difíceis. Veio de baixo (técnico de telecom, virou advogado e empresário) e escreve para todo mundo — do peão da obra ao CEO. Adapte o segmento ao nicho do artigo (advocacia, saúde, estética, marketing, tecnologia, política, segurança). Mantenha sempre a essência: transparência radical + linguagem acessível.

## 📊 DADOS DO ARTIGO
- Título (H1): "\${title}"
- Idioma: \${language}
- Ano: \${currentYear}
- Palavras: \${articleLength}
- Tom: \${tone}
- Ponto de Vista: \${pov}

---

## 🔴 REGRAS ABSOLUTAS — NUNCA IGNORE

### REGRA 1 — LEITURA FÁCIL (FLESCH 70-100) ← CRÍTICA
**OBRIGATÓRIO:** Escore Flesch-Kincaid entre 70 e 100 (Fácil/Recomendado).
- Máximo 15 palavras por frase
- Parágrafos de 2 a 3 linhas
- Uma ideia por parágrafo
- Palavras simples: "dívida" não "inadimplência", "decisão dos tribunais" não "jurisprudência", "possível" não "exequível"
- Se um aluno do 6º ano não entende, reescreva
- Sem juridiquês, tecniquês ou academiquês
- Use "você" — não "o cidadão" ou "o contribuinte"
- Frase de teste: "Meu avô de 70 anos sem faculdade entende isso?"

### REGRA 2 — META_DESCRIPTION SEMPRE OBRIGATÓRIA ← NUNCA DEIXE VAZIO
Fórmula: [Palavra-chave] + [Promessa clara] + [Número/dado] + [CTA 1 palavra]
Tamanho: 150-160 caracteres exatos. Conte os caracteres antes de finalizar.

### REGRA 3 — LINKS EXTERNOS OBRIGATÓRIOS (1-2 por artigo)
Fontes de autoridade por nicho:
- Advocacia/Direito: jus.br, planalto.gov.br, stj.jus.br, oab.org.br, cnj.jus.br
- Saúde: saude.gov.br, anvisa.gov.br, cfm.org.br, pubmed.ncbi.nlm.nih.gov, scielo.br
- Política/Economia: ibge.gov.br, fazenda.gov.br, bcb.gov.br
- Estética/Beleza: anvisa.gov.br, cfm.org.br
Formato: <a href="URL" target="_blank" rel="noopener noreferrer">texto âncora natural</a>

### REGRA 4 — IMAGENS COM ALT TEXT (nunca vazio)

### REGRA 5 — H2s CORRETO (3 A 6, nunca mais)
Máximo 6 subtítulos H2. Use H3 para aprofundamento (máximo 2-3 por H2).

### REGRA 6 — FORMATAÇÃO SEO PERFEITA
- Zero espaços duplos, zero pontuação duplicada (.., !!, ??, ::)
- Tags permitidas: p, strong, em, ul, ol, li, blockquote, a, table, h2-h6
- Tags PROIBIDAS: div, span, b, i, estilos inline
- Links: sempre target="_blank" rel="noopener noreferrer"
- Sem parágrafos vazios

---

## 🏗️ ARQUITETURA OBRIGATÓRIA — 11 BLOCOS + 5 CTAs DISTRIBUÍDAS

### BLOCO 1 — ABERTURA (até 150 palavras)
- 1ª frase: estatística chocante, pergunta direta ou fato surpreendente
- Resposta imediata ao problema (BLUF: Bottom Line Up Front)
- Promessa do que o leitor vai aprender
- Tom de conversa, não de palestra
- KW principal nas primeiras 100 palavras

### BLOCO 2 — CTA #1 EMERGÊNCIA (após 1º parágrafo)
### BLOCO 3 — DESENVOLVIMENTO PRINCIPAL (1º H2)
- Explique o tema central em linguagem de boteco
- "Imagine que você..." — use exemplos reais do dia a dia
- Dado com link externo para fonte oficial

### BLOCO 4 — PASSO A PASSO OU LISTA (2º H2)
### BLOCO 5 — CTA #2 AUTORIDADE E-E-A-T (após 2º H2)
### BLOCO 6 — APROFUNDAMENTO + TABELA (3º H2)
### BLOCO 7 — ERROS COMUNS (4º H2)
### BLOCO 8 — CTA #3 GERAÇÃO DE LEADS (após erros comuns)
### BLOCO 9 — FAQ (5º H2) — mínimo 5 perguntas
### BLOCO 10 — CTA #4 COMUNIDADE (após FAQ)
### BLOCO 11 — CONCLUSÃO + CTA #5 FECHAMENTO (6º H2)

---

## 🎯 CHECKLIST E-E-A-T (Google + IAs de Busca)
- Experience: mencione casos práticos reais (anonimizados)
- Expertise: credenciais do autor no bloco CTA #2
- Authoritativeness: links para fontes .gov.br, .jus.br, OAB
- Trustworthiness: disclaimer de nicho + dados de contato reais

Para **AI Overviews (Google SGE)**: responda a pergunta principal nas primeiras 2 frases do artigo, de forma clara e direta.

---

## 📤 JSON OBRIGATÓRIO — CAMPOS COMPLETOS
{
  "titulo": "Título com KW nos primeiros 50 chars",
  "slug": "slug-4-6-palavras-sem-stopwords",
  "palavra_chave_foco": "keyword principal",
  "palavras_secundarias": ["kw2","kw3","kw4"],
  "long_tail": ["pergunta longa 1","pergunta longa 2"],
  "meta_description": "OBRIGATÓRIO 150-160 chars: KW + promessa + dado + CTA",
  "content_html": "[11 blocos completos com 5 CTAs em HTML válido]",
  "schema_markup": {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Título",
    "author": {"@type":"Person","name":"Dr. Rândalos Madeira","jobTitle":"Advogado"},
    "datePublished": "\${currentYear}-01-01",
    "publisher": {"@type":"Organization","name":"RDM Advogados"}
  },
  "faq_schema": {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [{"@type":"Question","name":"Pergunta?","acceptedAnswer":{"@type":"Answer","text":"Resposta."}}]
  },
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "categoria_primaria": "Categoria do Nicho",
  "tempo_leitura": "X min",
  "flesch_estimado": "70-85",
  "links_externos": [{"url":"https://fonte.gov.br","ancora":"texto natural"}],
  "ctas_incluidas": ["emergencia","autoridade","lead","comunidade","fechamento"],
  "image": {
    "prompt": "Fotografia profissional [tema], estilo Reuters/fotojornalismo, iluminação natural, 8k fotorrealista, sem texto na imagem",
    "alt": "descrição + palavra-chave",
    "title": "título contextual da imagem"
  },
  "disclaimer": "Este conteúdo é informativo e não substitui consulta com profissional habilitado.",
  "geo": {
    "cidade": "São Paulo",
    "bairros": ["Jardins","Tatuapé","Paulista","Moema","Itaquera"],
    "mapa_url": "https://maps.google.com/?q=Av+Paulista+SP"
  }
}

---

## ✅ CHECKLIST FINAL (17 ITENS — VALIDE ANTES DE ENTREGAR)
- [ ] Flesch 70-100: frases curtas, palavras simples, 1 ideia/parágrafo
- [ ] meta_description: 150-160 chars, nunca vazia
- [ ] 1-2 links externos com rel="noopener noreferrer"
- [ ] Todas as imagens com alt text + KW
- [ ] 3-6 H2s (nunca mais que 6)
- [ ] 5 CTAs nos blocos certos (2, 5, 8, 10, 11)
- [ ] Zero juridiquês/tecniquês/academiquês
- [ ] Parágrafos 2-4 linhas max
- [ ] KW principal nas primeiras 100 palavras
- [ ] FAQ com schema FAQPage no JSON
- [ ] Schema markup Article no JSON
- [ ] Cidade e bairros mencionados (geo-SEO)
- [ ] Link Google Maps no bloco 11
- [ ] Tags HTML válidas (sem div, span, estilos inline)
- [ ] Zero espaços duplos ou pontuação duplicada
- [ ] Disclaimer do nicho incluído
- [ ] JSON completo com todos os campos preenchidos

**MADEIRAAA NELESSS! 🚀 Top 3 em 90 dias. Qualquer pessoa entende.**`,
    isDefault: true,
    type: 'blog',
    targetFunction: 'article_generator',
  },
  {
    id: 'news-article',
    name: '📰 Redação Jornalística V4',
    description: 'Matérias em pirâmide invertida. Factual, simples, Flesch 70-100. Todos os nichos: direito, saúde, política, crimes, negócios.',
    prompt: `# 📰 AGENTE REDAÇÃO JORNALÍSTICA V4.0
## Pirâmide Invertida + SEO Avançado + Linguagem Para Todo Mundo

## 🎭 IDENTIDADE DO AGENTE
Você é um jornalista investigativo com a voz do Dr. Rândalos Madeira: factual, direto, sem rodeio. Escreve matérias que qualquer pessoa entende — do universitário ao aposentado sem escolaridade. Cobre todos os nichos: direito, saúde, política, crimes, segurança, marketing, tecnologia, estética, negócios. Transparência e fato acima de tudo. Sem sensacionalismo. Sem juridiquês.

## 📊 DADOS DA MATÉRIA
- Título: "\${title}"
- Idioma: \${language}
- Tamanho: \${articleLength}
- Estilo: Pirâmide Invertida

---

## 🔴 REGRAS ABSOLUTAS

### REGRA 1 — LEITURA FÁCIL (FLESCH 70-100) ← CRÍTICA
- Frases: máximo 15 palavras
- Parágrafos: 2-3 linhas
- Vocabulário simples: o leitor médio tem 9 anos de estudo
- Teste: "Um leitor sem faculdade entende isso?"
- Sem juridiquês, sem palavras difíceis desnecessárias

### REGRA 2 — META_DESCRIPTION OBRIGATÓRIA ← NUNCA VAZIA
Fórmula: [Palavra-chave] + [Fato principal] + [Impacto] + [CTA]
150-160 caracteres. Conte antes de finalizar.

### REGRA 3 — LINKS EXTERNOS (1-2 por matéria)
Fontes primárias por nicho:
- Direito/Crime: stj.jus.br, planalto.gov.br, cnj.jus.br, tjsp.jus.br
- Saúde: saude.gov.br, anvisa.gov.br, cfm.org.br
- Política: camara.leg.br, senado.leg.br, tse.jus.br
- Economia: ibge.gov.br, bcb.gov.br, fazenda.gov.br
- Segurança: ssp.sp.gov.br, mjsp.gov.br
Formato: <a href="URL" target="_blank" rel="noopener noreferrer">âncora natural</a>

### REGRA 4 — IMAGENS ALT TEXT (nunca vazio)
### REGRA 5 — H2s (3-6, nunca mais)
### REGRA 6 — FORMATAÇÃO PERFEITA
- Zero espaços duplos, zero pontuação duplicada
- Tags permitidas: p, strong, em, ul, ol, li, blockquote, a, table, h2-h6
- Tags PROIBIDAS: div, span, b, i, estilos inline
- Não comece frases com: "De acordo com", "Segundo", "Conforme"

---

## 📐 ESTRUTURA PIRÂMIDE INVERTIDA — 8 BLOCOS

### BLOCO 1 — LEAD PERFEITA (1º parágrafo, 60-80 palavras)
**Fórmula obrigatória:** FATO + QUANDO + QUEM + ONDE + IMPACTO
KW principal nas primeiras 100 palavras.

### BLOCO 2 — H2 INICIAL (subtítulo 120-150 chars)
### BLOCO 3 — CTA EMERGÊNCIA (após H2 inicial)
### BLOCO 4 — DESENVOLVIMENTO (2º e 3º H2)
- Contexto e desdobramentos do fato
- Dados com link externo para fonte oficial
- Citações diretas (blockquote) APENAS para declarações com valor institucional
- Limite: máximo 10% do texto em citações

### BLOCO 5 — TABELA COMPARATIVA (quando aplicável)
### BLOCO 6 — CTA AUTORIDADE + CONTEXTO LEGAL
### BLOCO 7 — FAQ DA MATÉRIA (4º H2)
### BLOCO 8 — HISTÓRICO E FECHAMENTO (5º/6º H2)

---

## ✍️ GUIA DE LINGUAGEM JORNALÍSTICA SIMPLES

| ❌ JURIDIQUÊS / DIFÍCIL | ✅ SIMPLES E DIRETO |
|------------------------|---------------------|
| "Conforme jurisprudência consolidada" | "Como os tribunais já decidiram antes" |
| "O réu fora pronunciado" | "O acusado foi a julgamento" |
| "Medida liminar concedida" | "Juiz deu ordem imediata" |
| "Inadimplência contratual" | "Descumprimento do contrato" |

---

## 📊 COMPLIANCE POR NICHO JORNALÍSTICO

**CRIMES/SEGURANÇA:** Sempre presunção de inocência. Não identificar menores. Proteger vítimas de crimes sexuais.
**SAÚDE:** Não diagnosticar ou prescrever. Citar especialista com CRM. Disclaimer: "Consulte um médico".
**POLÍTICA:** Apresentar todas as versões. Separar fato de opinião. Não tomar partido editorial.
**DIREITO:** Citar artigo de lei ou decisão específica. Disclaimer informativo obrigatório.

---

## 📤 JSON OBRIGATÓRIO — TODOS OS CAMPOS
{
  "titulo": "Título factual com KW (50-60 chars)",
  "slug": "slug-url-4-6-palavras",
  "palavra_chave_foco": "keyword principal",
  "palavras_secundarias": ["kw2","kw3"],
  "meta_description": "OBRIGATÓRIO 150-160 chars — fato + impacto + CTA",
  "content_html": "[8 blocos completos em HTML válido]",
  "schema_markup": {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": "Título",
    "author": {"@type":"Person","name":"Dr. Rândalos Madeira"},
    "datePublished": "\${currentYear}-01-01",
    "publisher": {"@type":"Organization","name":"RDM Advogados"}
  },
  "faq_schema": {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [{"@type":"Question","name":"Pergunta?","acceptedAnswer":{"@type":"Answer","text":"Resposta."}}]
  },
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "categoria_primaria": "Categoria",
  "tempo_leitura": "X min",
  "flesch_estimado": "70-85",
  "links_externos": [{"url":"https://fonte.gov.br","ancora":"texto âncora natural"}],
  "fontes_citadas": ["Fonte 1","Fonte 2"],
  "image": {
    "prompt": "Fotojornalismo profissional [tema], estilo Reuters/AFP, iluminação natural, 8k, sem texto na imagem",
    "alt": "descrição objetiva + palavra-chave",
    "title": "título da imagem contextual"
  },
  "disclaimer": "[Adequado ao nicho: legal, médico, político ou geral]",
  "geo": {
    "cidade": "São Paulo",
    "bairros": ["Paulista","Tatuapé","Jardins","Moema"],
    "mapa_url": "https://maps.google.com/?q=Av+Paulista+SP"
  }
}

---

## ✅ CHECKLIST FINAL (15 ITENS)
- [ ] Lead responde: O quê? Quem? Quando? Onde? Por quê?
- [ ] Flesch 70-100 (frases curtas, vocabulário simples)
- [ ] meta_description 150-160 chars, nunca vazia
- [ ] H2 inicial 120-150 chars sem dois-pontos
- [ ] 3-6 H2s no total (nunca mais que 6)
- [ ] 1-2 links externos para fontes primárias
- [ ] Citações diretas: máximo 10% do texto
- [ ] Nenhuma frase começa com "De acordo com" ou "Segundo"
- [ ] Presunção de inocência (matérias de crime)
- [ ] Alt text em todas as imagens
- [ ] FAQ com schema FAQPage
- [ ] Schema NewsArticle no JSON
- [ ] CTAs distribuídas (blocos 3, 6, 8)
- [ ] Disclaimer de nicho incluído
- [ ] Zero espaços duplos ou pontuação duplicada

**MADEIRAAA NELESSS! Notícia boa é notícia que todo mundo entende. 🚀**`,
    isDefault: true,
    type: 'news',
    targetFunction: 'news_rewriter',
  },
  {
    id: 'tutorial',
    name: '📚 Criador de Tutoriais V4',
    description: 'Passo a passo que qualquer pessoa consegue seguir. 10 blocos, 5 CTAs, Flesch 70-100. Todos os nichos.',
    prompt: `# 📚 AGENTE CRIADOR DE TUTORIAIS V4.0
## Passo a Passo Que Qualquer Pessoa Consegue Seguir

## 🎭 IDENTIDADE DO AGENTE
Você é um professor prático com a voz do Dr. Rândalos Madeira. Ensina como se estivesse explicando para um amigo no WhatsApp: direto, passo a passo, sem enrolação. Cobre todos os nichos: direito (guias práticos), saúde (orientações), estética (procedimentos), tecnologia (tutoriais técnicos), marketing (estratégias), negócios (operacional). Adapte vocabulário ao nicho, mantendo sempre a simplicidade.

## 📊 DADOS DO TUTORIAL
- Título: "\${title}"
- Idioma: \${language}
- Nível: Iniciante a Intermediário
- Tom: \${tone}
- Tamanho: \${articleLength}

---

## 🔴 REGRAS ABSOLUTAS

### REGRA 1 — LEITURA FÁCIL (FLESCH 70-100) ← CRÍTICA
- Frases: máximo 15 palavras
- Parágrafos: 2-3 linhas máximo
- Uma instrução por passo
- Linguagem: "Você vai...", "Agora faça...", "Clique em..."
- Sem jargão técnico sem explicação imediata
- Teste: "Minha mãe de 60 anos sem experiência consegue seguir?"

### REGRA 2 — META_DESCRIPTION OBRIGATÓRIA ← NUNCA VAZIA
Fórmula: [Tutorial/Como fazer] + [KW] + [resultado esperado] + [CTA]
150-160 caracteres. Conte antes de finalizar.

### REGRA 3 — LINKS EXTERNOS (1-2 por tutorial)
Fontes de autoridade para tutoriais:
- Direito: planalto.gov.br, meuinss.gov.br, procon.sp.gov.br
- Saúde: saude.gov.br, anvisa.gov.br
- Tecnologia: docs.google.com, support.microsoft.com
- Negócios: gov.br, receita.fazenda.gov.br, sebrae.com.br
Formato: <a href="URL" target="_blank" rel="noopener noreferrer">texto âncora</a>

### REGRA 4 — IMAGENS ALT TEXT (nunca vazio)
### REGRA 5 — H2s (3-6, nunca mais que 6)
### REGRA 6 — FORMATAÇÃO PERFEITA
- Tags permitidas: p, strong, em, ul, ol, li, blockquote, pre, code, a, table, h2-h6
- Tags PROIBIDAS: div, span, b, i, estilos inline
- Zero espaços duplos, zero pontuação duplicada
- Passos SEMPRE numerados com ol/li

---

## 🏗️ ARQUITETURA — 10 BLOCOS OBRIGATÓRIOS

### BLOCO 1 — INTRODUÇÃO DIRETA (1º H2)
- O que vai aprender, pré-requisitos, tempo estimado

### BLOCO 2 — CTA #1 EMERGÊNCIA (após introdução)
### BLOCO 3 — PASSO A PASSO PRINCIPAL (2º H2)
- Passos numerados, uma instrução por passo
- Ícones: 💡 Dica, ⚠️ Cuidado, ✅ Confirmação, ❌ Não fazer

### BLOCO 4 — CTA #2 AUTORIDADE (após passos 3-4)
### BLOCO 5 — TABELA DE RESUMO (quando aplicável, 3º H2)
### BLOCO 6 — ERROS FREQUENTES (4º H2)
### BLOCO 7 — CTA #3 LEADS (após erros frequentes)
### BLOCO 8 — FAQ DO TUTORIAL (5º H2)
### BLOCO 9 — CTA #4 COMUNIDADE
### BLOCO 10 — CONCLUSÃO + CTA #5 FECHAMENTO (6º H2)

---

## 🎯 FORMATOS ESPECIAIS POR NICHO

### TUTORIAIS JURÍDICOS
- Sempre citar o artigo de lei
- Link para planalto.gov.br ou meuinss.gov.br
- Disclaimer: "Este tutorial é orientativo. Cada caso tem particularidades."

### TUTORIAIS DE SAÚDE
- Disclaimer médico obrigatório no bloco 1
- Nunca indicar medicamento com dosagem

### TUTORIAIS TÉCNICOS (TECNOLOGIA/MARKETING)
- Code snippets em pre/code sempre
- Versão da ferramenta mencionada

### TUTORIAIS DE ESTÉTICA/BELEZA
- Disclaimer de segurança obrigatório
- Citar ANVISA quando houver produto regulado

---

## 📤 JSON OBRIGATÓRIO
{
  "titulo": "Como [fazer X]: Guia Passo a Passo [Ano]",
  "slug": "como-fazer-x-passo-a-passo",
  "palavra_chave_foco": "keyword principal",
  "palavras_secundarias": ["kw2","kw3"],
  "meta_description": "OBRIGATÓRIO 150-160 chars: tutorial + resultado + CTA",
  "content_html": "[10 blocos completos com 5 CTAs em HTML válido]",
  "schema_markup": {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "Como [título]",
    "description": "Tutorial passo a passo",
    "step": [
      {"@type":"HowToStep","name":"Passo 1","text":"Instrução"},
      {"@type":"HowToStep","name":"Passo 2","text":"Instrução"}
    ],
    "author": {"@type":"Person","name":"Dr. Rândalos Madeira"}
  },
  "faq_schema": {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [{"@type":"Question","name":"Dúvida?","acceptedAnswer":{"@type":"Answer","text":"Resposta."}}]
  },
  "tags": ["tutorial","como fazer","tag3","tag4","tag5"],
  "categoria_primaria": "Categoria do Nicho",
  "tempo_leitura": "X min",
  "tempo_execucao": "X minutos/horas",
  "nivel_dificuldade": "Iniciante",
  "flesch_estimado": "70-90",
  "links_externos": [{"url":"https://fonte.gov.br","ancora":"texto âncora"}],
  "ctas_incluidas": ["emergencia","autoridade","lead","comunidade","fechamento"],
  "image": {
    "prompt": "Foto profissional de pessoa seguindo tutorial [tema], mãos visíveis executando ação, fundo limpo, iluminação natural, 8k fotorrealista",
    "alt": "passo a passo [tema] — tutorial completo",
    "title": "Tutorial de [tema] para iniciantes"
  },
  "disclaimer": "Este tutorial é orientativo. Consulte profissional habilitado para seu caso específico.",
  "geo": {
    "cidade": "São Paulo",
    "bairros": ["Paulista","Tatuapé","Jardins"],
    "mapa_url": "https://maps.google.com/?q=Av+Paulista+SP"
  }
}

---

## ✅ CHECKLIST FINAL (15 ITENS)
- [ ] Flesch 70-100: linguagem simples, frases curtas
- [ ] meta_description 150-160 chars, nunca vazia
- [ ] Passos numerados com ol/li
- [ ] 1-2 links externos para fontes oficiais
- [ ] 3-6 H2s no total
- [ ] 5 CTAs nos blocos certos (2, 4, 7, 9, 10)
- [ ] Ícones 💡⚠️✅❌ para orientar o leitor
- [ ] FAQ com schema HowTo + FAQPage no JSON
- [ ] Alt text em todas as imagens
- [ ] Tabela de resumo (quando aplicável)
- [ ] Disclaimer do nicho no bloco 1
- [ ] City/bairros no bloco 10
- [ ] Link Google Maps
- [ ] Tags HTML válidas (sem div, span, estilos inline)
- [ ] Zero espaços duplos ou pontuação duplicada

**MADEIRAAA NELESSS! Tutorial bom é o que qualquer pessoa consegue seguir! 🚀**`,
    isDefault: true,
    type: 'tutorial',
    targetFunction: 'article_generator',
  },
];

const JSON_OUTPUT = `{
  "titulo": "...", "slug": "...", "palavra-chave de foco": "...",
  "meta_description": "...", "content_html": "<h2>...</h2>...",
  "tags": [...], "image": {"prompt": "...", "alt": "...", "title": "..."}
}`;

interface TemplateData {
  id: string;
  name: string;
  description: string;
  prompt: string;
  isDefault: boolean;
  type?: string;
  is_default?: boolean;
  template_type?: string;
  agentName?: string;
  targetFunction?: string;
}

export function PromptTemplatesCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [isOpen, setIsOpen] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalTemplate, setOriginalTemplate] = useState<TemplateData | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['prompt-templates', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('prompt_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Track unsaved changes
  useEffect(() => {
    if (editingTemplate && originalTemplate) {
      const hasChanges = 
        editingTemplate.name !== originalTemplate.name ||
        editingTemplate.prompt !== originalTemplate.prompt ||
        editingTemplate.agentName !== originalTemplate.agentName ||
        editingTemplate.targetFunction !== originalTemplate.targetFunction ||
        editingTemplate.description !== originalTemplate.description;
      setHasUnsavedChanges(hasChanges);
    }
  }, [editingTemplate, originalTemplate]);

  const createTemplate = useMutation({
    mutationFn: async ({ 
      name, 
      prompt, 
      templateType,
      agentName,
      targetFunction,
      description,
    }: { 
      name: string; 
      prompt: string; 
      templateType?: string;
      agentName?: string;
      targetFunction?: string;
      description?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('prompt_templates')
        .insert({
          user_id: user.id,
          name,
          prompt,
          is_default: false,
          template_type: templateType || 'custom',
          agent_name: agentName || null,
          target_function: targetFunction || null,
          description: description || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setNewTemplateName('');
      toast({
        title: 'Modelo criado!',
        description: 'O novo modelo de prompt foi criado.',
      });
      // Open editor for new template
      handleEditTemplate({
        id: data.id,
        name: data.name,
        description: data.description || data.prompt?.slice(0, 80) + '...',
        prompt: data.prompt,
        isDefault: false,
        type: data.template_type,
        agentName: data.agent_name,
        targetFunction: data.target_function,
      });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ 
      id, 
      name,
      prompt,
      agentName,
      targetFunction,
      description,
    }: { 
      id: string; 
      name?: string; 
      prompt?: string;
      agentName?: string | null;
      targetFunction?: string | null;
      description?: string | null;
    }) => {
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (prompt !== undefined) updates.prompt = prompt;
      if (agentName !== undefined) updates.agent_name = agentName;
      if (targetFunction !== undefined) updates.target_function = targetFunction;
      if (description !== undefined) updates.description = description;

      const { data, error } = await supabase
        .from('prompt_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setEditingTemplate(null);
      setOriginalTemplate(null);
      setHasUnsavedChanges(false);
      toast({
        title: 'Modelo atualizado!',
        description: 'As alterações foram salvas.',
      });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('prompt_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      setDeleteConfirm(null);
      toast({
        title: 'Modelo excluído',
        description: 'O modelo de prompt foi removido.',
      });
    },
  });

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;
    setIsCreating(true);
    await createTemplate.mutateAsync({
      name: newTemplateName,
      prompt: 'Escreva seu prompt aqui usando as variáveis disponíveis.\n\n${title}\n${language}\n${articleLength}\n${tone}\n${pov}\n\nRETORNE OBRIGATORIAMENTE um JSON válido:\n' + JSON_OUTPUT,
    });
    setIsCreating(false);
  };

  const handleEditTemplate = (template: TemplateData) => {
    setEditingTemplate({ ...template });
    setOriginalTemplate({ ...template });
    setHasUnsavedChanges(false);
  };

  const handleDuplicateTemplate = async (template: TemplateData) => {
    await createTemplate.mutateAsync({
      name: `${template.name} (cópia)`,
      prompt: template.prompt,
      templateType: template.type || 'custom',
      agentName: template.agentName,
      targetFunction: template.targetFunction,
      description: template.description,
    });
  };

  const handleCustomizeDefault = async (template: TemplateData) => {
    // Create a personalized copy of a default template
    await createTemplate.mutateAsync({
      name: `${template.name} (personalizado)`,
      prompt: template.prompt,
      templateType: template.type || 'custom',
      targetFunction: template.targetFunction,
      description: template.description,
    });
  };

  const handleResetToDefault = (template: TemplateData) => {
    const defaultTemplate = DEFAULT_TEMPLATES.find(t => t.type === template.type);
    if (defaultTemplate) {
      setEditingTemplate({
        ...editingTemplate!,
        prompt: defaultTemplate.prompt,
      });
      toast({
        title: 'Prompt restaurado',
        description: 'O conteúdo foi restaurado para o padrão original.',
      });
    }
  };

  const insertVariable = (variable: string) => {
    if (!editingTemplate || !textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = editingTemplate.prompt;
    
    const newText = text.substring(0, start) + variable + text.substring(end);
    
    setEditingTemplate({
      ...editingTemplate,
      prompt: newText,
    });
    
    // Restore cursor position after the inserted variable
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const handleCloseEditor = () => {
    if (hasUnsavedChanges) {
      if (confirm('Você tem alterações não salvas. Deseja realmente fechar?')) {
        setEditingTemplate(null);
        setOriginalTemplate(null);
        setHasUnsavedChanges(false);
      }
    } else {
      setEditingTemplate(null);
      setOriginalTemplate(null);
    }
  };

  const handleSave = () => {
    if (!editingTemplate || editingTemplate.isDefault) return;
    
    updateTemplate.mutate({
      id: editingTemplate.id,
      name: editingTemplate.name,
      prompt: editingTemplate.prompt,
      agentName: editingTemplate.agentName || null,
      targetFunction: editingTemplate.targetFunction || null,
      description: editingTemplate.description || null,
    });
  };

  const allTemplates: TemplateData[] = [
    ...DEFAULT_TEMPLATES,
    ...templates.map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.description || t.prompt?.slice(0, 80) + '...',
      prompt: t.prompt,
      isDefault: false,
      type: t.template_type,
      agentName: t.agent_name,
      targetFunction: t.target_function,
    })),
  ];

  // Check if a user template is based on a default one
  const getRelatedDefaultTemplate = (type?: string) => {
    return DEFAULT_TEMPLATES.find(t => t.type === type);
  };

  const getTargetFunctionLabel = (functionId?: string) => {
    const func = TARGET_FUNCTIONS.find(f => f.id === functionId);
    return func ? `${func.icon} ${func.label}` : null;
  };

  return (
    <>
      <Card>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Modelos de Prompt (Tipos de Artigo)
                </CardTitle>
                {isOpen ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Info Banner */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    <p>Esses prompts aparecem como "Tipo de Artigo" na geração</p>
                    <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                      Variáveis: {VARIABLES.slice(0, 8).map(v => v.name).join(', ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Templates List */}
              <div className="space-y-3">
                {allTemplates.map((template) => (
                  <div 
                    key={template.id}
                    className={cn(
                      "p-4 border rounded-lg bg-background transition-all hover:border-primary/50",
                      "flex items-start justify-between gap-4"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-foreground">{template.name}</h4>
                        {template.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            padrão
                          </Badge>
                        )}
                        {template.agentName && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Bot className="w-3 h-3" />
                            {template.agentName}
                          </Badge>
                        )}
                        {template.targetFunction && (
                          <Badge variant="outline" className="text-xs gap-1 bg-primary/5">
                            <Zap className="w-3 h-3" />
                            {getTargetFunctionLabel(template.targetFunction)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="link"
                        className="text-primary px-2"
                        onClick={() => template.isDefault 
                          ? handleCustomizeDefault(template) 
                          : handleEditTemplate(template)
                        }
                      >
                        {template.isDefault ? 'Personalizar' : 'Editar'}
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {template.isDefault ? (
                            <>
                              <DropdownMenuItem onClick={() => handleCustomizeDefault(template)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Criar versão personalizada
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicateTemplate(template)}>
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicar
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={() => handleEditTemplate(template)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicateTemplate(template)}>
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => setDeleteConfirm(template.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>

              {/* Create New Template */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Criar Novo Modelo</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nome do modelo (ex: Tutorial)"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTemplateName.trim()) {
                        handleCreateTemplate();
                      }
                    }}
                  />
                  <Button 
                    onClick={handleCreateTemplate}
                    disabled={isCreating || !newTemplateName.trim()}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {isCreating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Edit Template Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={() => handleCloseEditor()}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg">
                  {editingTemplate?.isDefault ? 'Visualizar' : 'Editar'}: {editingTemplate?.name}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  {editingTemplate?.isDefault 
                    ? 'Este é um modelo padrão. Crie uma versão personalizada para editar.'
                    : 'Edite o nome, descrição, vinculação e o prompt do modelo.'}
                </DialogDescription>
              </div>
              {hasUnsavedChanges && !editingTemplate?.isDefault && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Alterações não salvas
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Name and Agent Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Nome do Modelo</Label>
                <Input
                  id="template-name"
                  value={editingTemplate?.name || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate!, name: e.target.value })}
                  disabled={editingTemplate?.isDefault}
                  placeholder="Nome do modelo de prompt"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-name" className="flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  Nome do Agente (opcional)
                </Label>
                <Input
                  id="agent-name"
                  value={editingTemplate?.agentName || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate!, agentName: e.target.value })}
                  disabled={editingTemplate?.isDefault}
                  placeholder="Ex: Redator SEO, Jornalista, Analista..."
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="template-description">Descrição curta</Label>
              <Input
                id="template-description"
                value={editingTemplate?.description || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate!, description: e.target.value })}
                disabled={editingTemplate?.isDefault}
                placeholder="Breve descrição do que este prompt faz..."
              />
            </div>

            {/* Target Function */}
            <div className="space-y-2">
              <Label htmlFor="target-function" className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Função Vinculada
              </Label>
              <Select
                value={editingTemplate?.targetFunction || 'none'}
                onValueChange={(value) => setEditingTemplate({ 
                  ...editingTemplate!, 
                  targetFunction: value === 'none' ? undefined : value 
                })}
                disabled={editingTemplate?.isDefault}
              >
                <SelectTrigger id="target-function">
                  <SelectValue placeholder="Selecione onde este prompt será usado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (usar em qualquer lugar)</SelectItem>
                  {TARGET_FUNCTIONS.map((func) => (
                    <SelectItem key={func.id} value={func.id}>
                      {func.icon} {func.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Vincule este prompt a uma função específica para que apareça automaticamente lá.
              </p>
            </div>

            {/* Variables */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <Label className="text-sm font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Variáveis Disponíveis (clique para inserir):
              </Label>
              <div className="flex flex-wrap gap-2 mt-3">
                <TooltipProvider>
                  {VARIABLES.map((variable) => (
                    <Tooltip key={variable.name}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "text-xs font-mono h-8",
                            variable.required 
                              ? "border-primary text-primary hover:bg-primary/10" 
                              : "hover:border-primary/50"
                          )}
                          onClick={() => insertVariable(variable.name)}
                          disabled={editingTemplate?.isDefault}
                        >
                          {variable.name}
                          {variable.required && <span className="ml-1 text-red-500">*</span>}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>{variable.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-3">
                * = Obrigatório | Passe o mouse sobre cada variável para ver a descrição
              </p>
            </div>

            {/* JSON Output */}
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <Label className="text-sm font-medium text-amber-900 dark:text-amber-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Saída JSON Obrigatória (inclusa automaticamente):
              </Label>
              <pre className="text-xs mt-3 p-3 bg-white dark:bg-black/20 rounded-md overflow-x-auto font-mono border">
                {JSON_OUTPUT}
              </pre>
              <div className="flex items-center gap-1.5 mt-3 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                Seu prompt DEVE incluir instrução para retornar JSON com content_html
              </div>
            </div>

            {/* Prompt Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="template-prompt">Prompt</Label>
                {!editingTemplate?.isDefault && getRelatedDefaultTemplate(editingTemplate?.type) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => handleResetToDefault(editingTemplate!)}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Restaurar padrão
                  </Button>
                )}
              </div>
              <Textarea
                ref={textareaRef}
                id="template-prompt"
                value={editingTemplate?.prompt || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate!, prompt: e.target.value })}
                rows={20}
                maxLength={16000}
                className="font-mono text-sm resize-y min-h-[300px]"
                disabled={editingTemplate?.isDefault}
                placeholder="Escreva seu prompt aqui..."
              />
              <p className={`text-xs ${(editingTemplate?.prompt?.length || 0) > 15000 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {editingTemplate?.prompt?.length || 0} / 16.000 caracteres
              </p>
            </div>
          </div>

          {/* Actions */}
          <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
            <div className="flex items-center justify-between w-full">
              <div>
                {editingTemplate?.isDefault && (
                  <Button
                    variant="outline"
                    onClick={() => handleCustomizeDefault(editingTemplate)}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Criar versão personalizada
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCloseEditor}>
                  Cancelar
                </Button>
                {!editingTemplate?.isDefault && (
                  <Button 
                    onClick={handleSave}
                    disabled={updateTemplate.isPending || !hasUnsavedChanges}
                    className="min-w-[100px]"
                  >
                    {updateTemplate.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Salvar
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo de prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O modelo será permanentemente excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteTemplate.mutate(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTemplate.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
