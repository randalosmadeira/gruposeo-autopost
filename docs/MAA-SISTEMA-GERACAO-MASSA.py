"""
SISTEMA DE GERAÇÃO EM MASSA - MARKETING JURÍDICO
Análise inteligente de keywords e criação automatizada de conteúdo otimizado
Base: 1.016 keywords segmentadas por intenção, volume e prioridade

Autor: Dr. Rândalos Madeira - RDM Advogados / Grupo SEO Marketing
Versão: 1.0.0
"""

import pandas as pd
import json
from typing import Dict, List, Tuple
from datetime import datetime
import anthropic
import openai
from google import generativeai as genai

# ==================== CONFIGURAÇÃO ====================

class ConfigGeracaoMassa:
    """Configurações para geração em massa"""
    
    # Arquivo Excel
    EXCEL_FILE = "keywords_marketing_juridico_1000__1_.xlsx"
    SHEET_NAME = "Keywords Marketing Jurídico"
    
    # Filtros de seleção
    PRIORIDADES = ["ALTA", "MÉDIA"]  # Ignorar BAIXA inicialmente
    VOLUME_MINIMO = ["Alto", "Médio", "Alta", "Média"]
    
    # Tipos de conteúdo por intenção
    MAPEAMENTO_INTENCAO = {
        "Transacional": "landing_page",  # Alta conversão
        "Comercial": "conteudo_misto",   # Educacional + CTA
        "Informacional": "artigo_blog"   # Educacional
    }
    
    # Estratégias de conversão
    ESTRATEGIAS_PERSUASAO = {
        "landing_page": ["AIDA", "PAS", "FAB", "Scarcity", "Social Proof"],
        "conteudo_misto": ["AIDA", "Problem-Solution", "Authority"],
        "artigo_blog": ["Problem-Solution", "Educational", "Subtle CTA"]
    }
    
    # Segmentação local
    LOCALIZACAO_PADRAO = {
        "cidade": "São Paulo",
        "estado": "SP",
        "regiao": "Grande São Paulo",
        "cep_base": "01311-000",  # Av. Paulista
        "telefone": "(11) 3230-8300"
    }


# ==================== ANALISADOR DE KEYWORDS ====================

class AnalisadorKeywords:
    """Analisa planilha e sugere estratégia de conteúdo"""
    
    def __init__(self, excel_path: str):
        """
        Inicializa analisador
        
        Args:
            excel_path: Caminho para arquivo Excel
        """
        self.df = pd.read_excel(excel_path, sheet_name=0)
        self.config = ConfigGeracaoMassa()
        
        print(f"📊 Planilha carregada: {len(self.df)} keywords")
    
    def filtrar_keywords_prioritarias(self) -> pd.DataFrame:
        """
        Filtra keywords por prioridade e volume
        
        Returns:
            DataFrame com keywords selecionadas
        """
        df_filtrado = self.df[
            (self.df['PRIORIDADE'].isin(self.config.PRIORIDADES)) &
            (self.df['VOLUME EST.'].isin(self.config.VOLUME_MINIMO))
        ].copy()
        
        print(f"🎯 Keywords selecionadas: {len(df_filtrado)}")
        return df_filtrado
    
    def analisar_keyword(self, row: pd.Series) -> Dict:
        """
        Analisa uma keyword e retorna estratégia
        
        Args:
            row: Linha do DataFrame
        
        Returns:
            Dict com análise e recomendações
        """
        keyword = row['PALAVRA-CHAVE']
        intencao = row['INTENÇÃO']
        volume = row['VOLUME EST.']
        dificuldade = row['DIFICULDADE']
        prioridade = row['PRIORIDADE']
        categoria = row['CATEGORIA']
        
        # Determinar tipo de conteúdo
        tipo_conteudo = self.config.MAPEAMENTO_INTENCAO.get(
            intencao,
            "artigo_blog"
        )
        
        # Detectar intenção local
        palavras_locais = ['são paulo', 'sp', 'brasil', 'próximo', 'perto']
        eh_local = any(palavra in keyword.lower() for palavra in palavras_locais)
        
        # Analisar potencial de conversão (score 0-100)
        score_conversao = self._calcular_score_conversao(
            intencao, volume, dificuldade, prioridade
        )
        
        # Estratégias recomendadas
        estrategias = self.config.ESTRATEGIAS_PERSUASAO.get(
            tipo_conteudo,
            ["Educational"]
        )
        
        return {
            "keyword": keyword,
            "categoria": categoria,
            "intencao": intencao,
            "tipo_conteudo": tipo_conteudo,
            "eh_local": eh_local,
            "score_conversao": score_conversao,
            "volume": volume,
            "dificuldade": dificuldade,
            "prioridade": prioridade,
            "estrategias_persuasao": estrategias,
            "comprimento_sugerido": self._sugerir_comprimento(tipo_conteudo),
            "elementos_obrigatorios": self._definir_elementos(tipo_conteudo, eh_local)
        }
    
    def _calcular_score_conversao(
        self,
        intencao: str,
        volume: str,
        dificuldade: str,
        prioridade: str
    ) -> int:
        """Calcula score de potencial de conversão (0-100)"""
        score = 0
        
        # Intenção (40 pontos)
        if intencao == "Transacional":
            score += 40
        elif intencao == "Comercial":
            score += 25
        elif intencao == "Informacional":
            score += 10
        
        # Volume (30 pontos)
        if volume in ["Alto", "Alta"]:
            score += 30
        elif volume in ["Médio", "Média"]:
            score += 20
        elif volume in ["Baixo", "Baixa"]:
            score += 10
        
        # Dificuldade (inverted - menos concorrência = mais score) (15 pontos)
        if dificuldade in ["Baixa", "Baixo"]:
            score += 15
        elif dificuldade in ["Média", "Médio"]:
            score += 10
        elif dificuldade in ["Alta", "Alto"]:
            score += 5
        
        # Prioridade (15 pontos)
        if prioridade == "ALTA":
            score += 15
        elif prioridade == "MÉDIA":
            score += 10
        elif prioridade == "BAIXA":
            score += 5
        
        return min(score, 100)
    
    def _sugerir_comprimento(self, tipo_conteudo: str) -> int:
        """Sugere número de palavras ideal"""
        comprimentos = {
            "landing_page": 1500,    # Landing page detalhada
            "conteudo_misto": 1800,  # Artigo + conversão
            "artigo_blog": 1200      # Artigo educacional
        }
        return comprimentos.get(tipo_conteudo, 1200)
    
    def _definir_elementos(self, tipo_conteudo: str, eh_local: bool) -> List[str]:
        """Define elementos obrigatórios do conteúdo"""
        elementos_base = {
            "landing_page": [
                "Título persuasivo com benefício claro",
                "Subtítulo com proposta de valor",
                "Seção de benefícios (bullet points)",
                "Prova social (cases, depoimentos)",
                "CTA principal acima da dobra",
                "CTA secundário no rodapé",
                "FAQ com objeções comuns",
                "Formulário de contato/lead",
                "Garantia ou diferencial competitivo"
            ],
            "conteudo_misto": [
                "Introdução educacional (problema)",
                "Desenvolvimento técnico (solução)",
                "Seção sobre Grupo SEO Marketing (autoridade)",
                "Benefícios de contratar especialista",
                "CTA suave no meio do texto",
                "CTA forte na conclusão",
                "FAQ",
                "Links para landing pages"
            ],
            "artigo_blog": [
                "Título otimizado SEO",
                "Introdução com gancho",
                "Conteúdo educacional detalhado",
                "Exemplos práticos",
                "Compliance OAB (ética)",
                "CTA suave (consulta/orçamento)",
                "FAQ",
                "Links internos para outros conteúdos"
            ]
        }
        
        elementos = elementos_base.get(tipo_conteudo, [])
        
        # Adicionar elementos locais se necessário
        if eh_local:
            elementos.extend([
                "Menção à localização (São Paulo/SP)",
                "Schema LocalBusiness (structured data)",
                "Mapa/endereço do escritório",
                "Telefone local para contato"
            ])
        
        return elementos
    
    def gerar_briefing_completo(self, num_keywords: int = 50) -> List[Dict]:
        """
        Gera briefing completo para múltiplas keywords
        
        Args:
            num_keywords: Número de keywords a processar
        
        Returns:
            Lista de briefings
        """
        df_filtrado = self.filtrar_keywords_prioritarias()
        
        # Ordenar por score de conversão
        briefings = []
        for idx, row in df_filtrado.head(num_keywords).iterrows():
            analise = self.analisar_keyword(row)
            briefings.append(analise)
        
        # Ordenar por score de conversão (maior primeiro)
        briefings.sort(key=lambda x: x['score_conversao'], reverse=True)
        
        return briefings


# ==================== GERADOR DE CONTEÚDO EM MASSA ====================

class GeradorConteudoMassa:
    """Gera conteúdo em massa baseado em briefings"""
    
    def __init__(self, api_preferencial: str = "gemini"):
        """
        Inicializa gerador
        
        Args:
            api_preferencial: 'gemini', 'openai' ou 'claude'
        """
        self.api_preferencial = api_preferencial
        self.config = ConfigGeracaoMassa()
        
        # Inicializar clientes de API
        if os.getenv("GEMINI_API_KEY"):
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            self.cliente_gemini = genai.GenerativeModel('gemini-1.5-pro')
        
        if os.getenv("OPENAI_API_KEY"):
            openai.api_key = os.getenv("OPENAI_API_KEY")
            self.cliente_openai = openai
        
        if os.getenv("ANTHROPIC_API_KEY"):
            self.cliente_claude = anthropic.Anthropic(
                api_key=os.getenv("ANTHROPIC_API_KEY")
            )
    
    def gerar_conteudo_por_briefing(self, briefing: Dict) -> Dict:
        """
        Gera conteúdo baseado em briefing
        
        Args:
            briefing: Dict com análise da keyword
        
        Returns:
            Dict com conteúdo gerado
        """
        # Construir prompt baseado no tipo de conteúdo
        prompt = self._construir_prompt(briefing)
        
        # Gerar via API
        print(f"📝 Gerando: {briefing['keyword']} ({briefing['tipo_conteudo']})")
        
        if self.api_preferencial == "gemini":
            conteudo = self._gerar_gemini(prompt)
        elif self.api_preferencial == "openai":
            conteudo = self._gerar_openai(prompt)
        else:  # claude
            conteudo = self._gerar_claude(prompt)
        
        # Parsear JSON
        try:
            resultado = json.loads(conteudo)
        except json.JSONDecodeError:
            # Se falhar, tentar extrair JSON do texto
            import re
            json_match = re.search(r'\{.*\}', conteudo, re.DOTALL)
            if json_match:
                resultado = json.loads(json_match.group())
            else:
                raise Exception("Falha ao parsear JSON do conteúdo gerado")
        
        # Adicionar metadados
        resultado.update({
            "keyword_original": briefing['keyword'],
            "tipo_conteudo": briefing['tipo_conteudo'],
            "score_conversao": briefing['score_conversao'],
            "criado_em": datetime.now().isoformat(),
            "api_utilizada": self.api_preferencial
        })
        
        return resultado
    
    def _construir_prompt(self, briefing: Dict) -> str:
        """Constrói prompt especializado por tipo de conteúdo"""
        
        tipo = briefing['tipo_conteudo']
        keyword = briefing['keyword']
        estrategias = ", ".join(briefing['estrategias_persuasao'])
        comprimento = briefing['comprimento_sugerido']
        elementos = briefing['elementos_obrigatorios']
        eh_local = briefing['eh_local']
        
        # Contexto da empresa
        contexto_empresa = """
EMPRESA: Grupo SEO Marketing
- Fundador: Dr. Rândalos Madeira (CEO RDM Advogados Associados)
- Especialização: Marketing Jurídico, Healthcare, Beauty
- Diferenciais:
  * Fundado em 2022 por advogado + ex-técnico de telecomunicações
  * Filosofia "anti-guru" - transparência radical
  * Resultados comprovados em SEO, Google Ads, Redes Sociais
  * Expertise em compliance OAB
  * Soluções tecnológicas: ZicaJuris.ai, Advocacia.AI
- Localização: São Paulo/SP (Av. Paulista + Tatuapé)
- Público-alvo: Advogados, escritórios de advocacia, profissionais da saúde
"""
        
        # Base do prompt (igual para todos)
        prompt_base = f"""
{contexto_empresa}

TAREFA: Criar conteúdo de {tipo.replace('_', ' ')} para keyword "{keyword}"

ESPECIFICAÇÕES:
- Tipo de conteúdo: {tipo}
- Intenção de busca: {briefing['intencao']}
- Volume de busca: {briefing['volume']}
- Score de conversão: {briefing['score_conversao']}/100
- Comprimento: {comprimento} palavras
- Estratégias de persuasão: {estrategias}
- Foco local: {'Sim - São Paulo/SP' if eh_local else 'Não'}

ELEMENTOS OBRIGATÓRIOS:
{chr(10).join(f"✓ {elem}" for elem in elementos)}

COMPLIANCE OAB:
❌ PROIBIDO:
- Promessas de resultado ("100% garantido", "certeza de sucesso")
- Superlativos absolutos ("melhor do Brasil", "número 1")
- Comparações diretas com concorrentes
- Descontos ou promoções ("50% off", "aproveite")
- Tom sensacionalista ou apelativo

✅ PERMITIDO:
- Conteúdo educacional sobre marketing jurídico
- Explicação de estratégias e técnicas
- Apresentação de diferenciais técnicos
- Autoridade e credibilidade (cases sem identificar clientes)
- CTAs suaves ("Solicite uma análise gratuita", "Converse com especialista")

SEO 2026:
- E-E-A-T: Experiência (Dr. Rândalos), Expertise (marketing jurídico), Authority, Trust
- Mobile-first: parágrafos curtos (2-4 linhas)
- Featured Snippets: resposta direta no 1º parágrafo
- LSI Keywords: 5-8 variações da keyword principal
- Schema Markup: {
    'LocalBusiness' if eh_local else 'Article'
}
"""
        
        # Prompts específicos por tipo
        if tipo == "landing_page":
            prompt_especifico = """
ESTRUTURA DA LANDING PAGE:

1. HERO SECTION (Above the Fold)
   - Título H1: Benefício claro + keyword
   - Subtítulo: Proposta de valor única (USP)
   - CTA primário: Botão destaque (cor: laranja #FF6B35)
   - Imagem: Profissional/tecnológica (sugestão para design)

2. SEÇÃO "POR QUE ESCOLHER O GRUPO SEO MARKETING"
   - 3-5 diferenciais em cards
   - Ícones para cada diferencial
   - Dados quantitativos (quando possível)

3. PROVA SOCIAL
   - 2-3 depoimentos (genéricos, sem identificar clientes)
   - Logos de clientes (apenas setores: "Escritórios de SP", "Advogados Criminalistas")
   - Números de impacto: "X+ escritórios atendidos", "Y% aumento médio em leads"

4. COMO FUNCIONA (Processo)
   - Passo 1: Diagnóstico gratuito
   - Passo 2: Estratégia personalizada
   - Passo 3: Implementação + acompanhamento
   - Passo 4: Resultados mensuráveis

5. BENEFÍCIOS DETALHADOS
   - Bullets com ícones ✓
   - Foco em resolver DOR do cliente
   - Evitar termos técnicos excessivos

6. FAQ - OBJEÇÕES COMUNS
   - 8-10 perguntas estratégicas:
     * "É caro?" → Mostrar ROI
     * "É permitido pela OAB?" → Compliance
     * "Quanto tempo para resultados?" → Expectativa realista
     * "Funciona para pequenos escritórios?" → Escalabilidade

7. CTA FINAL (Forte)
   - Oferta clara: "Análise Gratuita de Marketing Jurídico"
   - Formulário: Nome, Email, Telefone, Área de atuação
   - Garantia: "100% compliance OAB" / "Sem compromisso"

8. RODAPÉ
   - Endereços (Paulista + Tatuapé)
   - Telefone / WhatsApp
   - Links: Sobre, Cases, Blog, Contato

COPYWRITING (ESTRATÉGIAS):
- AIDA: Atenção (título), Interesse (diferenciais), Desejo (prova social), Ação (CTA)
- PAS: Problem (dor do advogado), Agitate (consequências), Solve (Grupo SEO como solução)
- FAB: Features (funcionalidades), Advantages (vantagens), Benefits (benefícios reais)
- Gatilhos mentais: Escassez ("Vagas limitadas para análise gratuita"), Autoridade (expertise Dr. Rândalos), Prova social

RETORNAR JSON:
{
    "titulo_h1": "...",
    "subtitulo": "...",
    "hero_cta": "...",
    "diferenciais": [
        {"titulo": "...", "descricao": "...", "icone": "..."}
    ],
    "prova_social": {
        "depoimentos": [...],
        "numeros_impacto": [...]
    },
    "como_funciona": [...],
    "beneficios": [...],
    "faq": [
        {"pergunta": "...", "resposta": "..."}
    ],
    "cta_final": {
        "titulo": "...",
        "subtitulo": "...",
        "botao": "...",
        "garantia": "..."
    },
    "conteudo_html": "<!-- HTML completo da landing page -->",
    "meta_description": "...",
    "slug": "...",
    "palavras_chave": [...],
    "schema_markup": {...}
}
"""
        
        elif tipo == "conteudo_misto":
            prompt_especifico = """
ESTRUTURA DO CONTEÚDO MISTO (Educacional + Conversão):

1. INTRODUÇÃO (150-200 palavras)
   - Gancho: Problema/dor do leitor
   - Estatística ou dado impactante
   - Promise: O que o leitor vai aprender
   - Keyword no 1º parágrafo (naturalidade)

2. DESENVOLVIMENTO EDUCACIONAL (60% do conteúdo)
   - H2: Tópicos principais (3-5 seções)
   - H3: Subtópicos detalhados
   - Conteúdo técnico de qualidade
   - Exemplos práticos
   - Listas e bullets para escaneabilidade
   - Imagens/infográficos sugeridos

3. SEÇÃO "POR QUE CONTRATAR ESPECIALISTA" (20% do conteúdo)
   - Transição suave do educacional
   - H2: "O Desafio de Implementar Sozinho"
   - Apresentação do Grupo SEO Marketing
   - Diferenciais específicos para este tema
   - CTA suave: "Quer ajuda de especialistas? Fale conosco"

4. CONCLUSÃO (10% do conteúdo)
   - Resumo dos pontos principais
   - Próximos passos (acionáveis)
   - CTA mais direto: "Solicite uma Análise Gratuita"

5. FAQ (10% do conteúdo)
   - 5-8 perguntas relacionadas ao tema
   - Respostas completas (50-100 palavras cada)
   - Keyword variations nas perguntas

COPYWRITING:
- Tom: Educacional mas engajante
- Voz: 2ª pessoa ("você", "seu escritório")
- CTAs: Suaves no meio, mais diretos no final
- Gatilhos: Autoridade (expertise), Reciprocidade (conteúdo gratuito)

RETORNAR JSON:
{
    "titulo": "...",
    "meta_description": "...",
    "slug": "...",
    "conteudo_html": "<!-- HTML completo -->",
    "introducao": "...",
    "desenvolvimento": [
        {"titulo_h2": "...", "conteudo": "..."}
    ],
    "secao_especialista": "...",
    "conclusao": "...",
    "faq": [...],
    "palavras_chave": [...],
    "links_internos_sugeridos": [...],
    "ctas": [
        {"posicao": "meio", "texto": "..."},
        {"posicao": "final", "texto": "..."}
    ]
}
"""
        
        else:  # artigo_blog
            prompt_especifico = """
ESTRUTURA DO ARTIGO DE BLOG (Educacional):

1. TÍTULO (H1)
   - Formato: "Como [fazer algo] + [benefício] + [ano]"
   - Exemplos: "Como Captar Clientes Jurídicos Online em 2026: Guia Completo"
   - Keyword no início, mas natural
   - 55-70 caracteres

2. META DESCRIPTION
   - 150-160 caracteres
   - Incluir keyword + benefício
   - CTA suave: "Saiba mais"

3. INTRODUÇÃO (100-150 palavras)
   - Hook: Estatística ou pergunta provocativa
   - Apresentação do problema
   - O que o leitor vai aprender
   - Keyword no 1º parágrafo

4. ÍNDICE (se artigo > 1500 palavras)
   - Links de âncora para H2s
   - Melhora UX e tempo na página

5. DESENVOLVIMENTO (corpo principal)
   - 3-6 seções H2
   - Cada H2 com 2-4 H3s
   - Parágrafos curtos (2-4 linhas)
   - Listas e bullets frequentes
   - Exemplos práticos
   - Citações de fontes (quando relevante)
   - Boxes destacados para dicas importantes

6. CASOS PRÁTICOS / EXEMPLOS
   - 2-3 exemplos reais (sem identificar)
   - "Um escritório de direito tributário em SP..."
   - Foco em resultados mensuráveis

7. COMPLIANCE OAB (se aplicável ao tema)
   - Seção H2: "O Que a OAB Permite"
   - Citação: Provimento 205/2021
   - Tom: Esclarecedor, não intimidador

8. CONCLUSÃO
   - Resumo de 3-5 pontos principais
   - Próximos passos acionáveis
   - CTA educacional: "Quer se aprofundar? Baixe nosso e-book"
   - Link para conteúdo relacionado

9. FAQ
   - 5-8 perguntas comuns
   - Schema FAQ para featured snippets
   - Respostas diretas (40-60 palavras)

10. AUTOR
    - Bio: "Artigo por Grupo SEO Marketing, especialista em..."
    - Link: Sobre nós / Contato

COPYWRITING:
- Tom: Educacional, acessível, sem jargões excessivos
- Voz: 2ª pessoa quando apropriado, 3ª pessoa para explicações técnicas
- CTAs: Suaves, focados em aprofundamento ("Leia mais", "Baixe guia")
- Valor: Conteúdo 100% gratuito e aplicável

SEO:
- LSI keywords: 8-10 variações
- Links internos: 2-3 para outros artigos
- Links externos: 1-2 para fontes autoritativas (OAB, estudos)
- Imagens: Alt text otimizado
- Schema: Article + FAQ

RETORNAR JSON:
{
    "titulo": "...",
    "meta_description": "...",
    "slug": "...",
    "conteudo_html": "<!-- HTML completo -->",
    "indice": [...],
    "introducao": "...",
    "desenvolvimento": [
        {
            "titulo_h2": "...",
            "subtopicos": [
                {"titulo_h3": "...", "conteudo": "..."}
            ]
        }
    ],
    "casos_praticos": [...],
    "conclusao": "...",
    "faq": [...],
    "palavras_chave": [...],
    "lsi_keywords": [...],
    "links_internos": [...],
    "links_externos": [...],
    "autor_bio": "...",
    "schema_markup": {...}
}
"""
        
        return prompt_base + "\n" + prompt_especifico
    
    def _gerar_gemini(self, prompt: str) -> str:
        """Gera via Gemini"""
        response = self.cliente_gemini.generate_content(
            prompt,
            generation_config={
                "temperature": 0.8,
                "top_p": 0.95,
                "max_output_tokens": 8192,
            }
        )
        return response.text
    
    def _gerar_openai(self, prompt: str) -> str:
        """Gera via OpenAI"""
        response = self.cliente_openai.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
            max_tokens=8192
        )
        return response.choices[0].message.content
    
    def _gerar_claude(self, prompt: str) -> str:
        """Gera via Claude"""
        response = self.cliente_claude.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.content[0].text
    
    def gerar_campanha_completa(
        self,
        briefings: List[Dict],
        batch_size: int = 10,
        intervalo_segundos: int = 3
    ) -> List[Dict]:
        """
        Gera campanha completa em lote
        
        Args:
            briefings: Lista de briefings
            batch_size: Quantos gerar por vez
            intervalo_segundos: Pausa entre gerações (rate limiting)
        
        Returns:
            Lista de conteúdos gerados
        """
        import time
        
        total = len(briefings)
        conteudos = []
        
        print(f"\n🚀 INICIANDO CAMPANHA: {total} conteúdos")
        print(f"💰 Custo estimado: R$ {total * 0.05:.2f}\n")
        
        for i, briefing in enumerate(briefings, 1):
            print(f"[{i}/{total}] {briefing['keyword']} (Score: {briefing['score_conversao']})")
            
            try:
                conteudo = self.gerar_conteudo_por_briefing(briefing)
                conteudos.append(conteudo)
                print(f"  ✅ Sucesso! ({briefing['tipo_conteudo']})")
                
            except Exception as e:
                print(f"  ❌ Erro: {e}")
                conteudos.append({
                    "erro": str(e),
                    "briefing": briefing
                })
            
            # Rate limiting
            if i < total:
                time.sleep(intervalo_segundos)
        
        # Estatísticas finais
        sucesso = len([c for c in conteudos if "erro" not in c])
        print(f"\n✅ CAMPANHA CONCLUÍDA:")
        print(f"   Sucessos: {sucesso}/{total}")
        print(f"   Falhas: {total - sucesso}")
        
        # Distribuição por tipo
        tipos = {}
        for c in conteudos:
            if "tipo_conteudo" in c:
                tipo = c["tipo_conteudo"]
                tipos[tipo] = tipos.get(tipo, 0) + 1
        
        print(f"\n📊 DISTRIBUIÇÃO:")
        for tipo, count in tipos.items():
            print(f"   {tipo}: {count}")
        
        return conteudos


# ==================== FUNÇÃO PRINCIPAL ====================

def executar_geracao_massa(
    num_keywords: int = 50,
    api: str = "gemini",
    prioridade_minima: str = "MÉDIA"
):
    """
    Executa pipeline completo de geração em massa
    
    Args:
        num_keywords: Quantas keywords processar
        api: API a usar ('gemini', 'openai', 'claude')
        prioridade_minima: Filtro de prioridade
    
    Returns:
        Lista de conteúdos gerados
    """
    print("="*80)
    print("🚀 SISTEMA DE GERAÇÃO EM MASSA - MARKETING JURÍDICO")
    print("="*80)
    print()
    
    # 1. Analisar keywords
    print("📊 FASE 1: Análise de Keywords")
    print("-"*80)
    
    analisador = AnalisadorKeywords("keywords_marketing_juridico_1000__1_.xlsx")
    briefings = analisador.gerar_briefing_completo(num_keywords)
    
    print(f"\n✅ {len(briefings)} briefings gerados")
    print()
    
    # 2. Mostrar preview dos briefings
    print("📋 TOP 10 KEYWORDS POR SCORE DE CONVERSÃO:")
    print("-"*80)
    for i, b in enumerate(briefings[:10], 1):
        print(f"{i:2d}. {b['keyword']:50s} | Score: {b['score_conversao']:3d} | Tipo: {b['tipo_conteudo']:15s}")
    print()
    
    # 3. Confirmar geração
    resposta = input("Confirmar geração de conteúdo? (s/n): ").lower()
    if resposta != 's':
        print("❌ Geração cancelada")
        return []
    
    # 4. Gerar conteúdos
    print("\n📝 FASE 2: Geração de Conteúdo")
    print("-"*80)
    print()
    
    gerador = GeradorConteudoMassa(api_preferencial=api)
    conteudos = gerador.gerar_campanha_completa(briefings)
    
    # 5. Salvar resultados
    print("\n💾 FASE 3: Salvando Resultados")
    print("-"*80)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    arquivo_saida = f"output/campanha_massa_{timestamp}.json"
    
    with open(arquivo_saida, "w", encoding="utf-8") as f:
        json.dump(conteudos, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Resultados salvos em: {arquivo_saida}")
    
    # 6. Relatório final
    print("\n📊 RELATÓRIO FINAL")
    print("="*80)
    print(f"Total de conteúdos: {len(conteudos)}")
    print(f"Custo total: R$ {len(conteudos) * 0.05:.2f}")
    print(f"API utilizada: {api.upper()}")
    print()
    
    return conteudos


# ==================== EXEMPLOS DE USO ====================

if __name__ == "__main__":
    import os
    
    print("\n🎯 MODOS DE EXECUÇÃO:\n")
    print("1. Gerar 10 conteúdos (teste)")
    print("2. Gerar 50 conteúdos (campanha média)")
    print("3. Gerar 100 conteúdos (campanha completa)")
    print("4. Personalizado")
    print()
    
    escolha = input("Escolha uma opção (1-4): ")
    
    if escolha == "1":
        executar_geracao_massa(num_keywords=10, api="gemini")
    elif escolha == "2":
        executar_geracao_massa(num_keywords=50, api="gemini")
    elif escolha == "3":
        executar_geracao_massa(num_keywords=100, api="claude")
    elif escolha == "4":
        num = int(input("Número de keywords: "))
        api = input("API (gemini/openai/claude): ")
        executar_geracao_massa(num_keywords=num, api=api)
    else:
        print("❌ Opção inválida")
