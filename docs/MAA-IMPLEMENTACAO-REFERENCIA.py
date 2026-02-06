"""
SISTEMA MAA - Implementação Técnica do Assistente IA
Integração com APIs: Gemini, OpenAI (GPT-4), Claude (Anthropic)
Autor: Dr. Rândalos Madeira - RDM Advogados Associados
Versão: 3.0.0
"""

import os
import json
import requests
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import anthropic
import openai
from google import generativeai as genai

# ==================== CONFIGURAÇÃO ====================

class ConfigMAA:
    """Configurações centralizadas do sistema MAA"""
    
    # APIs de IA
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
    
    # WordPress Sites
    WORDPRESS_SITES = {
        "rdm_advogados": {
            "url": "https://rdmadvogados.com.br",
            "token": os.getenv("WP_RDM_TOKEN"),
            "categorias": {
                "criminal": 5,
                "consumidor": 7,
                "trabalhista": 9,
                "telecomunicacoes": 11
            }
        },
        "grupo_seo": {
            "url": "https://gruposeomt.com.br",
            "token": os.getenv("WP_GRUPO_TOKEN"),
            "categorias": {
                "marketing": 3,
                "seo": 5,
                "conteudo": 7
            }
        }
    }
    
    # Precificação MAA
    CUSTO_ARTIGO = 0.05  # R$ 0,05 por artigo
    CUSTO_IMAGEM = 0.22  # R$ 0,22 por imagem
    
    # SEO
    FLESCH_READING_EASE_MIN = 60
    TAMANHO_MINIMO_ARTIGO = 800  # palavras
    TAMANHO_MAXIMO_ARTIGO = 2500  # palavras


# ==================== PROMPT TEMPLATES ====================

SYSTEM_PROMPT_BASE = """
Você é o Assistente MAA Pro, especializado em criação de conteúdo jurídico e jornalístico.

CLIENTE: Dr. Rândalos Madeira - RDM Advogados Associados
- Especialidades: Criminal, Consumidor, Trabalhista, Telecomunicações
- Background: Advogado + ex-técnico telecomunicações (Telefônica, Ericsson)
- Posicionamento: "Anti-guru", transparência, sem promessas vazias

COMPLIANCE OAB (Resolução 02/2015):
✅ Permitido: Conteúdo educacional, análise técnica, orientações gerais
❌ Proibido: Garantias de resultado, captação indevida, mercantilização

SEO 2026:
- E-E-A-T (Experience, Expertise, Authority, Trust)
- Parágrafos curtos (mobile-first)
- Flesch Reading Ease > 60
- Featured Snippets optimization

ESTRUTURA:
1. Título otimizado (55-60 chars)
2. Meta description (155-160 chars)
3. Introdução (100-150 palavras)
4. Desenvolvimento com H2/H3
5. Conclusão + CTA suave
6. FAQ (5-8 perguntas)
"""

# ==================== ASSISTENTE PRINCIPAL ====================

class AssistenteMAA:
    """Classe principal do assistente IA MAA"""
    
    def __init__(self, api_preferencial: str = "gemini"):
        """
        Inicializa o assistente
        
        Args:
            api_preferencial: 'gemini', 'openai' ou 'claude'
        """
        self.api_preferencial = api_preferencial
        self.config = ConfigMAA()
        
        # Inicializar clientes de API
        if self.config.GEMINI_API_KEY:
            genai.configure(api_key=self.config.GEMINI_API_KEY)
            self.cliente_gemini = genai.GenerativeModel('gemini-1.5-pro')
        
        if self.config.OPENAI_API_KEY:
            openai.api_key = self.config.OPENAI_API_KEY
            self.cliente_openai = openai
        
        if self.config.ANTHROPIC_API_KEY:
            self.cliente_claude = anthropic.Anthropic(
                api_key=self.config.ANTHROPIC_API_KEY
            )
    
    def criar_artigo(
        self,
        tema: str,
        palavra_chave: str,
        tamanho: int = 1200,
        tom: str = "acessível",
        incluir_faq: bool = True,
        categoria: str = "consumidor"
    ) -> Dict:
        """
        Cria um artigo completo otimizado para SEO
        
        Args:
            tema: Assunto do artigo
            palavra_chave: Keyword principal
            tamanho: Número de palavras (800-2500)
            tom: 'formal', 'acessível' ou 'técnico'
            incluir_faq: Se deve incluir seção de FAQ
            categoria: Categoria jurídica do conteúdo
        
        Returns:
            Dict com artigo estruturado
        """
        
        # Validações
        if tamanho < 800 or tamanho > 2500:
            raise ValueError("Tamanho deve estar entre 800 e 2500 palavras")
        
        # Montar prompt
        prompt_usuario = f"""
Crie um artigo completo sobre:

TEMA: {tema}
PALAVRA-CHAVE: {palavra_chave}
TAMANHO: {tamanho} palavras
TOM: {tom}
CATEGORIA: {categoria}
INCLUIR FAQ: {'Sim' if incluir_faq else 'Não'}

RETORNE em formato JSON:
{{
    "titulo": "Título otimizado (55-60 chars)",
    "meta_description": "Meta description (155-160 chars)",
    "slug": "url-amigavel",
    "conteudo_html": "HTML completo do artigo",
    "palavras_chave": ["keyword1", "keyword2", ...],
    "imagens_sugeridas": [
        {{"posicao": "destaque", "alt": "descrição"}},
        {{"posicao": "meio", "alt": "descrição"}}
    ],
    "categorias": ["categoria1", "categoria2"],
    "tags": ["tag1", "tag2", ...],
    "score_seo": 85,
    "score_compliance": 100,
    "score_legibilidade": 70
}}

DIRETRIZES:
- Parágrafos com máx 4 linhas
- Sem garantias de resultado
- CTA suave: "Consulte um advogado especializado"
- Citar fontes jurídicas (leis, CDC, etc)
- Linguagem clara (Flesch > 60)
"""
        
        # Gerar via API escolhida
        if self.api_preferencial == "gemini":
            resultado = self._gerar_gemini(prompt_usuario)
        elif self.api_preferencial == "openai":
            resultado = self._gerar_openai(prompt_usuario)
        elif self.api_preferencial == "claude":
            resultado = self._gerar_claude(prompt_usuario)
        else:
            raise ValueError(f"API inválida: {self.api_preferencial}")
        
        # Parsear JSON
        artigo = json.loads(resultado)
        
        # Adicionar metadados do sistema
        artigo["criado_em"] = datetime.now().isoformat()
        artigo["api_utilizada"] = self.api_preferencial
        artigo["custo_geracao"] = self.config.CUSTO_ARTIGO
        
        return artigo
    
    def repostar_noticia(
        self,
        url_fonte: str,
        angulo_analise: str,
        palavra_chave: Optional[str] = None
    ) -> Dict:
        """
        Reescreve notícia jornalística com compliance de direitos autorais
        
        Args:
            url_fonte: URL da notícia original
            angulo_analise: Perspectiva jurídica/técnica a adicionar
            palavra_chave: Keyword para otimização (opcional)
        
        Returns:
            Dict com artigo reescrito
        """
        
        # Buscar conteúdo original
        try:
            response = requests.get(url_fonte, timeout=10)
            conteudo_original = self._extrair_texto_html(response.text)
        except Exception as e:
            raise Exception(f"Erro ao buscar fonte: {e}")
        
        # Detectar veículo (para creditar)
        veiculo = self._detectar_veiculo(url_fonte)
        
        prompt_usuario = f"""
TAREFA: Repostagem jornalística com compliance Lei 9.610/98

FONTE ORIGINAL:
URL: {url_fonte}
Veículo: {veiculo}
Conteúdo: {conteudo_original[:2000]}... (trecho)

ÂNGULO DE ANÁLISE:
{angulo_analise}

PALAVRA-CHAVE (se fornecida): {palavra_chave or "não especificada"}

INSTRUÇÕES CRÍTICAS:
1. Reescrever 100% com estrutura TOTALMENTE diferente
2. NÃO copiar parágrafos ou frases longas
3. Adicionar análise jurídica/técnica (40%+ do conteúdo)
4. Especialidade Dr. Rândalos: telecomunicações (ex-técnico)
5. Creditar fonte no rodapé:
   "Fonte: {veiculo} - {url_fonte}"

RETORNE JSON:
{{
    "titulo": "...",
    "meta_description": "...",
    "conteudo_html": "...",
    "creditos_rodape": "Fonte: ...",
    "originalidade_score": 95,
    "diferenciacao_estrutural": "sim/não",
    "valor_agregado": "descrição do que foi adicionado"
}}

Se originalidade < 90%, reescreva novamente até atingir 90%+.
"""
        
        # Gerar via API
        if self.api_preferencial == "gemini":
            resultado = self._gerar_gemini(prompt_usuario)
        elif self.api_preferencial == "openai":
            resultado = self._gerar_openai(prompt_usuario)
        else:  # claude
            resultado = self._gerar_claude(prompt_usuario)
        
        artigo = json.loads(resultado)
        
        # Validar originalidade
        if artigo.get("originalidade_score", 0) < 90:
            raise Exception(
                f"Originalidade insuficiente ({artigo['originalidade_score']}%). "
                "Risco de violação de direitos autorais."
            )
        
        artigo["tipo"] = "repostagem"
        artigo["fonte_original"] = url_fonte
        artigo["criado_em"] = datetime.now().isoformat()
        
        return artigo
    
    def criar_artigos_massa(
        self,
        template: Dict,
        variacoes: List[Dict],
        max_simultaneous: int = 5
    ) -> List[Dict]:
        """
        Cria múltiplos artigos a partir de template
        
        Args:
            template: Estrutura base do artigo
            variacoes: Lista de dicts com dados variáveis
            max_simultaneous: Max de artigos simultâneos
        
        Returns:
            Lista de artigos gerados
        """
        
        artigos = []
        total = len(variacoes)
        
        print(f"📝 Gerando {total} artigos em lote...")
        print(f"💰 Custo estimado: R$ {total * self.config.CUSTO_ARTIGO:.2f}")
        
        for i, variacao in enumerate(variacoes, 1):
            print(f"[{i}/{total}] Gerando artigo: {variacao.get('titulo_base', '')}")
            
            # Mesclar template com variação
            dados_artigo = {**template, **variacao}
            
            # Criar artigo individual
            try:
                artigo = self.criar_artigo(
                    tema=dados_artigo["tema"],
                    palavra_chave=dados_artigo["palavra_chave"],
                    tamanho=dados_artigo.get("tamanho", 1200),
                    tom=dados_artigo.get("tom", "acessível"),
                    incluir_faq=dados_artigo.get("incluir_faq", True),
                    categoria=dados_artigo.get("categoria", "geral")
                )
                
                artigos.append(artigo)
                print(f"  ✅ Sucesso!")
                
            except Exception as e:
                print(f"  ❌ Erro: {e}")
                artigos.append({"erro": str(e), "variacao": variacao})
        
        print(f"\n✅ Campanha concluída: {len(artigos)} artigos gerados")
        return artigos
    
    def publicar_wordpress(
        self,
        artigo: Dict,
        site: str = "rdm_advogados",
        status: str = "draft",
        data_agendamento: Optional[str] = None
    ) -> Dict:
        """
        Publica artigo no WordPress via REST API
        
        Args:
            artigo: Dict com conteúdo do artigo
            site: Chave do site em WORDPRESS_SITES
            status: 'draft', 'publish' ou 'future'
            data_agendamento: ISO datetime para publicação futura
        
        Returns:
            Dict com post_id e URL
        """
        
        if site not in self.config.WORDPRESS_SITES:
            raise ValueError(f"Site '{site}' não configurado")
        
        wp_config = self.config.WORDPRESS_SITES[site]
        
        # Preparar payload
        payload = {
            "title": artigo["titulo"],
            "content": artigo["conteudo_html"],
            "excerpt": artigo["meta_description"],
            "status": status,
            "slug": artigo["slug"],
            "categories": self._mapear_categorias(
                artigo.get("categorias", []),
                wp_config["categorias"]
            ),
            "tags": artigo.get("tags", []),
            "meta": {
                "yoast_wpseo_title": artigo["titulo"],
                "yoast_wpseo_metadesc": artigo["meta_description"],
                "yoast_wpseo_focuskw": artigo["palavras_chave"][0] if artigo.get("palavras_chave") else ""
            }
        }
        
        # Agendamento
        if data_agendamento and status == "future":
            payload["date"] = data_agendamento
        
        # POST para WordPress
        try:
            response = requests.post(
                f"{wp_config['url']}/wp-json/wp/v2/posts",
                headers={
                    "Authorization": f"Bearer {wp_config['token']}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=30
            )
            
            response.raise_for_status()
            resultado = response.json()
            
            return {
                "sucesso": True,
                "post_id": resultado["id"],
                "url": resultado["link"],
                "status": resultado["status"]
            }
            
        except requests.exceptions.RequestException as e:
            return {
                "sucesso": False,
                "erro": str(e)
            }
    
    def validar_compliance_oab(self, texto: str) -> Tuple[bool, List[str]]:
        """
        Valida se conteúdo está em compliance com Código de Ética OAB
        
        Args:
            texto: Conteúdo a validar
        
        Returns:
            (is_compliant, lista_de_problemas)
        """
        
        problemas = []
        
        # Palavras/frases proibidas
        proibidas = [
            "garantido", "100% de sucesso", "melhor advogado",
            "resultado garantido", "certeza de ganhar",
            "promoção", "desconto", "preço mais baixo",
            "advogado mais barato"
        ]
        
        texto_lower = texto.lower()
        
        for termo in proibidas:
            if termo in texto_lower:
                problemas.append(
                    f"Termo proibido detectado: '{termo}' "
                    "(viola Código de Ética OAB)"
                )
        
        # Verificar tom mercantilista
        termos_mercantilistas = ["compre", "adquira", "aproveite"]
        count_mercantil = sum(1 for t in termos_mercantilistas if t in texto_lower)
        
        if count_mercantil > 2:
            problemas.append(
                "Tom excessivamente mercantilista detectado "
                "(pode violar Art. 5º, Res. 02/2015 OAB)"
            )
        
        # Verificar se há fontes jurídicas citadas
        fontes_juridicas = ["cdc", "lei", "código", "jurisprudência", "stj", "stf"]
        tem_fonte = any(f in texto_lower for f in fontes_juridicas)
        
        if not tem_fonte and len(texto) > 500:
            problemas.append(
                "Recomendado: Citar fontes jurídicas para credibilidade"
            )
        
        is_compliant = len(problemas) == 0
        
        return is_compliant, problemas
    
    def calcular_metricas_seo(self, artigo: Dict) -> Dict[str, int]:
        """
        Calcula score SEO do artigo (0-100)
        
        Args:
            artigo: Dict com dados do artigo
        
        Returns:
            Dict com scores detalhados
        """
        
        score = 0
        detalhes = {}
        
        # Título (15 pontos)
        titulo = artigo.get("titulo", "")
        kw = artigo.get("palavras_chave", [""])[0].lower()
        
        if 50 <= len(titulo) <= 70:
            score += 5
            detalhes["titulo_tamanho"] = 5
        if kw in titulo.lower():
            score += 10
            detalhes["titulo_kw"] = 10
        
        # Meta description (10 pontos)
        meta = artigo.get("meta_description", "")
        if 145 <= len(meta) <= 165:
            score += 5
            detalhes["meta_tamanho"] = 5
        if kw in meta.lower():
            score += 5
            detalhes["meta_kw"] = 5
        
        # Conteúdo
        html = artigo.get("conteudo_html", "")
        
        # H1 único (5 pontos)
        if html.count("<h1>") == 1:
            score += 5
            detalhes["h1_unico"] = 5
        
        # H2s (15 pontos)
        num_h2 = html.count("<h2>")
        if 3 <= num_h2 <= 6:
            score += 15
            detalhes["h2_otimo"] = 15
        elif num_h2 > 0:
            score += 7
            detalhes["h2_ok"] = 7
        
        # Parágrafos curtos (10 pontos)
        # (simplificado - contando <p> tags)
        num_paragrafos = html.count("<p>")
        if num_paragrafos >= 10:
            score += 10
            detalhes["paragrafos"] = 10
        
        # Imagens com alt (10 pontos)
        num_imgs = html.count("<img")
        num_alts = html.count("alt=")
        if num_imgs > 0 and num_imgs == num_alts:
            score += 10
            detalhes["imagens_alt"] = 10
        
        # Links internos (10 pontos)
        if artigo.get("links_internos"):
            score += 10
            detalhes["links_internos"] = 10
        
        # Links externos (10 pontos)
        if artigo.get("links_externos"):
            score += 10
            detalhes["links_externos"] = 10
        
        # FAQ (10 pontos)
        if "<h2>FAQ" in html or "Perguntas Frequentes" in html:
            score += 10
            detalhes["faq"] = 10
        
        # Legibilidade (15 pontos)
        flesch = artigo.get("score_legibilidade", 0)
        if flesch >= 70:
            score += 15
            detalhes["legibilidade"] = 15
        elif flesch >= 60:
            score += 10
            detalhes["legibilidade"] = 10
        
        return {
            "score_total": score,
            "detalhes": detalhes,
            "nivel": self._classificar_score(score)
        }
    
    # ==================== MÉTODOS AUXILIARES ====================
    
    def _gerar_gemini(self, prompt: str) -> str:
        """Gera conteúdo via Gemini API"""
        response = self.cliente_gemini.generate_content(
            [SYSTEM_PROMPT_BASE, prompt],
            generation_config={
                "temperature": 0.7,
                "top_p": 0.95,
                "max_output_tokens": 8192,
            }
        )
        return response.text
    
    def _gerar_openai(self, prompt: str) -> str:
        """Gera conteúdo via OpenAI API"""
        response = self.cliente_openai.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_BASE},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=8192
        )
        return response.choices[0].message.content
    
    def _gerar_claude(self, prompt: str) -> str:
        """Gera conteúdo via Claude API"""
        response = self.cliente_claude.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=8192,
            system=SYSTEM_PROMPT_BASE,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        return response.content[0].text
    
    def _extrair_texto_html(self, html: str) -> str:
        """Extrai texto limpo de HTML"""
        # Implementação simplificada
        # Em produção, usar BeautifulSoup
        import re
        texto = re.sub('<[^<]+?>', '', html)
        return texto[:5000]  # Limitar tamanho
    
    def _detectar_veiculo(self, url: str) -> str:
        """Detecta veículo jornalístico pela URL"""
        veiculos = {
            "g1.globo.com": "G1",
            "folha.uol.com.br": "Folha de S.Paulo",
            "estadao.com.br": "O Estado de S. Paulo",
            "valor.globo.com": "Valor Econômico",
            "tele.sintese.com.br": "Tele.Síntese",
            "teletime.com.br": "Teletime"
        }
        
        for dominio, nome in veiculos.items():
            if dominio in url:
                return nome
        
        return url.split('/')[2]  # Retorna domínio
    
    def _mapear_categorias(
        self,
        categorias_artigo: List[str],
        categorias_wp: Dict[str, int]
    ) -> List[int]:
        """Mapeia categorias do artigo para IDs do WordPress"""
        ids = []
        for cat in categorias_artigo:
            cat_lower = cat.lower()
            for nome_wp, id_wp in categorias_wp.items():
                if nome_wp in cat_lower or cat_lower in nome_wp:
                    ids.append(id_wp)
                    break
        return ids or [1]  # Default: Uncategorized
    
    def _classificar_score(self, score: int) -> str:
        """Classifica score SEO em níveis"""
        if score >= 90:
            return "Excelente"
        elif score >= 80:
            return "Muito Bom"
        elif score >= 70:
            return "Bom"
        elif score >= 60:
            return "Regular"
        else:
            return "Necessita Melhorias"


# ==================== EXEMPLOS DE USO ====================

def exemplo_artigo_simples():
    """Exemplo: Criar artigo único"""
    
    assistente = AssistenteMAA(api_preferencial="gemini")
    
    artigo = assistente.criar_artigo(
        tema="Direitos do Consumidor em Compras Online",
        palavra_chave="direito arrependimento compras online",
        tamanho=1500,
        tom="acessível",
        incluir_faq=True,
        categoria="consumidor"
    )
    
    print("✅ Artigo gerado:")
    print(f"Título: {artigo['titulo']}")
    print(f"Score SEO: {artigo['score_seo']}")
    
    # Publicar no WordPress
    resultado_pub = assistente.publicar_wordpress(
        artigo,
        site="rdm_advogados",
        status="draft"
    )
    
    if resultado_pub["sucesso"]:
        print(f"✅ Publicado: {resultado_pub['url']}")
    else:
        print(f"❌ Erro: {resultado_pub['erro']}")


def exemplo_repostagem():
    """Exemplo: Repostar notícia jornalística"""
    
    assistente = AssistenteMAA(api_preferencial="claude")
    
    artigo = assistente.repostar_noticia(
        url_fonte="https://www.telesintese.com.br/nova-regulamentacao-sva-scm/",
        angulo_analise="""
        Adicionar análise sob perspectiva de ISPs pequeno/médio porte:
        - Impacto operacional da migração SVA → SCM
        - Checklist de adequação técnica
        - Riscos de não conformidade (multas Anatel)
        - Experiência prática Dr. Rândalos (ex-técnico Telefônica)
        """,
        palavra_chave="migração sva scm anatel"
    )
    
    print(f"✅ Repostagem criada: {artigo['titulo']}")
    print(f"Originalidade: {artigo['originalidade_score']}%")


def exemplo_artigos_massa():
    """Exemplo: Campanha de 20 artigos (advogado criminal por região)"""
    
    assistente = AssistenteMAA(api_preferencial="openai")
    
    # Template base
    template = {
        "tamanho": 1200,
        "tom": "acessível",
        "incluir_faq": True,
        "categoria": "criminal"
    }
    
    # Variações (20 regiões de SP)
    variacoes = [
        {
            "tema": f"Advogado Criminal {regiao} - Defesa Imediata 24h",
            "palavra_chave": f"advogado criminal {regiao.lower()}",
            "regiao": regiao,
            "delegacia": dp
        }
        for regiao, dp in [
            ("Itaim Paulista", "50° DP"),
            ("Vila Mariana", "16° DP"),
            ("Pinheiros", "14° DP"),
            # ... adicionar 17 regiões
        ]
    ]
    
    artigos = assistente.criar_artigos_massa(template, variacoes)
    
    print(f"\n📊 Campanha concluída:")
    print(f"Total: {len(artigos)} artigos")
    print(f"Custo: R$ {len(artigos) * 0.05:.2f}")


def exemplo_validacao_compliance():
    """Exemplo: Validar compliance OAB"""
    
    assistente = AssistenteMAA()
    
    # Texto com problemas
    texto_ruim = """
    Somos o melhor escritório de SP com 100% de garantia de sucesso!
    Aproveite nossa promoção: R$ 500 de desconto!
    """
    
    compliant, problemas = assistente.validar_compliance_oab(texto_ruim)
    
    if not compliant:
        print("❌ Conteúdo NÃO está em compliance:")
        for p in problemas:
            print(f"  - {p}")


if __name__ == "__main__":
    print("🚀 Sistema MAA - Assistente IA")
    print("="*50)
    
    # Executar exemplos
    # exemplo_artigo_simples()
    # exemplo_repostagem()
    # exemplo_artigos_massa()
    # exemplo_validacao_compliance()
    
    print("\n✅ Pronto para uso!")
