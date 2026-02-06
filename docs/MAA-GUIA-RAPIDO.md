# 🚀 MAA - Guia Rápido de Configuração

## 📋 Índice
1. [Instalação](#instalação)
2. [Configuração de APIs](#configuração-de-apis)
3. [Integração WordPress](#integração-wordpress)
4. [Uso Básico](#uso-básico)
5. [Casos de Uso Práticos](#casos-de-uso-práticos)
6. [Troubleshooting](#troubleshooting)

---

## 🔧 Instalação

### Requisitos
- Python 3.9+
- Acesso a pelo menos uma das APIs: Gemini, OpenAI ou Claude
- WordPress com REST API habilitada
- Plugin Yoast SEO (recomendado)

### Passo 1: Instalar Dependências

```bash
pip install --break-system-packages anthropic
pip install --break-system-packages openai
pip install --break-system-packages google-generativeai
pip install --break-system-packages requests
pip install --break-system-packages beautifulsoup4
pip install --break-system-packages textstat  # Para cálculo Flesch Reading Ease
```

### Passo 2: Estrutura de Arquivos

```
maa-system/
├── assistente_maa_implementacao.py   # Código principal
├── assistente_maa_prompt.md          # Documentação do prompt
├── .env                               # Variáveis de ambiente (NÃO commitar!)
├── templates/                         # Templates de artigos
├── output/                            # Artigos gerados
└── logs/                              # Logs do sistema
```

---

## 🔑 Configuração de APIs

### Variáveis de Ambiente

Crie arquivo `.env` na raiz do projeto:

```bash
# APIs de IA
GEMINI_API_KEY=AIzaSy...
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...

# WordPress - RDM Advogados
WP_RDM_URL=https://rdmadvogados.com.br
WP_RDM_TOKEN=Bearer eyJ0eXAi...

# WordPress - Grupo SEO
WP_GRUPO_URL=https://gruposeomt.com.br
WP_GRUPO_TOKEN=Bearer eyJ0eXAi...

# Configurações Opcionais
MAA_API_PREFERENCIAL=gemini  # gemini | openai | claude
MAA_CUSTO_ARTIGO=0.05
MAA_CUSTO_IMAGEM=0.22
```

### Obter Tokens de API

#### 1. Google Gemini
```
1. Acesse: https://makersuite.google.com/app/apikey
2. Clique em "Get API Key"
3. Copie a chave e adicione em GEMINI_API_KEY
```

#### 2. OpenAI (ChatGPT)
```
1. Acesse: https://platform.openai.com/api-keys
2. Clique em "Create new secret key"
3. Nome: "MAA Production"
4. Copie e adicione em OPENAI_API_KEY
```

#### 3. Claude (Anthropic)
```
1. Acesse: https://console.anthropic.com/settings/keys
2. Clique em "Create Key"
3. Selecione: "Workspace API Key"
4. Copie e adicione em ANTHROPIC_API_KEY
```

### Obter Token WordPress

```bash
# Via Plugin JWT Authentication
1. Instale plugin: JWT Authentication for WP-API
2. Configure .htaccess:
   RewriteRule ^index\.php$ - [L]
   RewriteCond %{HTTP:Authorization} ^(.*)
   RewriteRule ^(.*) - [E=HTTP_AUTHORIZATION:%1]

3. Gere token via POST:
   curl -X POST https://seusite.com.br/wp-json/jwt-auth/v1/token \
     -d "username=admin&password=sua_senha"

4. Copie o token retornado
```

---

## 🔌 Integração WordPress

### Configurar Categorias

No arquivo `assistente_maa_implementacao.py`, edite:

```python
WORDPRESS_SITES = {
    "rdm_advogados": {
        "url": "https://rdmadvogados.com.br",
        "token": os.getenv("WP_RDM_TOKEN"),
        "categorias": {
            "criminal": 5,        # ← Altere para IDs reais
            "consumidor": 7,
            "trabalhista": 9,
            "telecomunicacoes": 11
        }
    }
}
```

**Como encontrar IDs de categorias:**
```bash
curl https://seusite.com.br/wp-json/wp/v2/categories
```

### Testar Conexão WordPress

```python
from assistente_maa_implementacao import AssistenteMAA

assistente = AssistenteMAA()

# Teste simples
resultado = assistente.publicar_wordpress(
    artigo={
        "titulo": "Teste MAA",
        "conteudo_html": "<p>Teste de integração</p>",
        "meta_description": "Teste",
        "slug": "teste-maa",
        "categorias": ["geral"],
        "tags": ["teste"]
    },
    site="rdm_advogados",
    status="draft"
)

print(resultado)
# Deve retornar: {"sucesso": True, "post_id": 123, ...}
```

---

## 💻 Uso Básico

### 1. Criar Artigo Simples

```python
from assistente_maa_implementacao import AssistenteMAA

# Inicializar assistente (API preferencial: Gemini)
assistente = AssistenteMAA(api_preferencial="gemini")

# Gerar artigo
artigo = assistente.criar_artigo(
    tema="Direito do Consumidor em Golpes de PIX",
    palavra_chave="golpe pix como recuperar dinheiro",
    tamanho=1200,
    tom="acessível",
    incluir_faq=True,
    categoria="consumidor"
)

# Visualizar resultado
print(f"✅ Título: {artigo['titulo']}")
print(f"📊 Score SEO: {artigo['score_seo']}/100")
print(f"💰 Custo: R$ {artigo['custo_geracao']}")

# Salvar em arquivo
import json
with open("output/artigo_golpe_pix.json", "w", encoding="utf-8") as f:
    json.dump(artigo, f, indent=2, ensure_ascii=False)

# Publicar no WordPress
resultado = assistente.publicar_wordpress(
    artigo,
    site="rdm_advogados",
    status="draft"  # ou "publish" para publicar imediatamente
)

if resultado["sucesso"]:
    print(f"🌐 Publicado: {resultado['url']}")
```

### 2. Repostar Notícia

```python
assistente = AssistenteMAA(api_preferencial="claude")

artigo = assistente.repostar_noticia(
    url_fonte="https://g1.globo.com/tecnologia/noticia/2026/02/nova-lei-telecom.ghtml",
    angulo_analise="""
    Analisar impacto para ISPs sob perspectiva jurídica:
    - Obrigações legais (prazos, penalidades)
    - Checklist de adequação técnica
    - Experiência prática (Dr. Rândalos - ex-técnico Ericsson)
    """,
    palavra_chave="nova lei telecomunicações 2026"
)

# Validar compliance
compliant, problemas = assistente.validar_compliance_oab(
    artigo["conteudo_html"]
)

if compliant:
    assistente.publicar_wordpress(artigo, site="rdm_advogados")
else:
    print("❌ Problemas de compliance:")
    for p in problemas:
        print(f"  - {p}")
```

### 3. Campanha de Artigos em Massa

```python
assistente = AssistenteMAA(api_preferencial="openai")

# Template base
template = {
    "tamanho": 1000,
    "tom": "acessível",
    "incluir_faq": True,
    "categoria": "criminal"
}

# Variações (exemplo: 5 delegacias de SP)
variacoes = [
    {
        "tema": "Advogado Criminal Itaim Paulista - 50° DP - Defesa 24h",
        "palavra_chave": "advogado criminal itaim paulista",
        "dados_especificos": {
            "delegacia": "50° DP",
            "endereco": "Av. Marechal Tito, 3012",
            "telefone": "(11) 2977-8150"
        }
    },
    {
        "tema": "Advogado Criminal Vila Mariana - 16° DP - Defesa 24h",
        "palavra_chave": "advogado criminal vila mariana",
        "dados_especificos": {
            "delegacia": "16° DP",
            "endereco": "Rua Domingos de Morais, 2564",
            "telefone": "(11) 5084-2116"
        }
    },
    # ... adicionar mais 3 regiões
]

# Gerar lote
artigos = assistente.criar_artigos_massa(template, variacoes)

# Publicar todos em modo "draft" para revisão
for artigo in artigos:
    if "erro" not in artigo:
        assistente.publicar_wordpress(
            artigo,
            site="rdm_advogados",
            status="draft"
        )

print(f"✅ {len(artigos)} artigos criados e salvos como rascunho")
```

---

## 📚 Casos de Uso Práticos

### Caso 1: Série "Guia do Consumidor"

```python
# Objetivo: 8 artigos sobre direitos do consumidor
# Estratégia: Pillar + Cluster Content

assistente = AssistenteMAA(api_preferencial="gemini")

# 1. Pillar Page (artigo principal)
pillar = assistente.criar_artigo(
    tema="Guia Completo dos Direitos do Consumidor no Brasil",
    palavra_chave="direitos do consumidor",
    tamanho=2000,
    tom="acessível",
    incluir_faq=True,
    categoria="consumidor"
)

assistente.publicar_wordpress(pillar, site="rdm_advogados", status="publish")
pillar_url = pillar["url"]

# 2. Cluster Content (artigos satélites)
topicos = [
    "Direito de Arrependimento em Compras Online",
    "Como Cancelar Serviços de Assinatura",
    "Golpes em Compras: Como se Proteger",
    "Produto com Defeito: Garantia Legal vs Contratual",
    "Como Reclamar no Procon e Juizado Especial",
    "Negativação Indevida: Seus Direitos",
    "Cláusulas Abusivas em Contratos: O Que Evitar"
]

for topico in topicos:
    artigo = assistente.criar_artigo(
        tema=topico,
        palavra_chave=topico.lower(),
        tamanho=1200,
        tom="acessível",
        incluir_faq=True,
        categoria="consumidor"
    )
    
    # Adicionar link para pillar page
    artigo["conteudo_html"] += f'''
    <p><strong>Leia também:</strong> 
    <a href="{pillar_url}">Guia Completo dos Direitos do Consumidor</a></p>
    '''
    
    assistente.publicar_wordpress(
        artigo,
        site="rdm_advogados",
        status="publish"
    )
    
    print(f"✅ Publicado: {topico}")
```

### Caso 2: Monitoramento Jornalístico (Telecomunicações)

```python
import feedparser
import time

assistente = AssistenteMAA(api_preferencial="claude")

# Feeds RSS de fontes especializadas
feeds = [
    "https://www.telesintese.com.br/feed/",
    "https://teletime.com.br/feed/",
]

palavras_gatilho = ["sva", "scm", "anatel", "isp", "provedor"]

def monitorar_noticias():
    """Monitora feeds e reposta automaticamente"""
    
    print("🔍 Monitorando feeds...")
    
    for feed_url in feeds:
        feed = feedparser.parse(feed_url)
        
        for entry in feed.entries[:5]:  # Últimas 5 notícias
            titulo = entry.title.lower()
            
            # Verificar se contém palavra-gatilho
            if any(palavra in titulo for palavra in palavras_gatilho):
                print(f"📰 Notícia relevante: {entry.title}")
                
                try:
                    artigo = assistente.repostar_noticia(
                        url_fonte=entry.link,
                        angulo_analise="""
                        Adicionar perspectiva jurídica para ISPs:
                        - Impacto operacional
                        - Obrigações legais
                        - Prazos de adequação
                        """,
                        palavra_chave="telecomunicações isp regulamentação"
                    )
                    
                    # Salvar como rascunho para revisão manual
                    assistente.publicar_wordpress(
                        artigo,
                        site="rdm_advogados",
                        status="draft"
                    )
                    
                    print(f"  ✅ Repostagem criada (draft)")
                    
                except Exception as e:
                    print(f"  ❌ Erro: {e}")
                
                time.sleep(5)  # Rate limiting

# Executar
monitorar_noticias()
```

### Caso 3: Análise SEO de Concorrência

```python
from assistente_maa_implementacao import AssistenteMAA

assistente = AssistenteMAA()

# Analisar artigos de concorrentes
concorrentes = [
    "https://concorrente1.com.br/artigo-advogado-criminal",
    "https://concorrente2.com.br/defesa-criminal-sp",
]

for url in concorrentes:
    print(f"\n📊 Analisando: {url}")
    
    # (Em produção, usar scraping + análise de SEO)
    # Aqui, exemplo simplificado
    
    # Identificar gaps de conteúdo
    artigo_concorrente = {
        "titulo": "Advogado Criminal SP - Defesa Imediata",
        "tamanho_palavras": 800,
        "tem_faq": False,
        "tem_dados_estatisticos": False,
        "score_seo": 65
    }
    
    # Criar versão melhorada
    if artigo_concorrente["score_seo"] < 80:
        print("💡 Oportunidade: Criar versão superior")
        
        melhorias = []
        if not artigo_concorrente["tem_faq"]:
            melhorias.append("Incluir FAQ")
        if not artigo_concorrente["tem_dados_estatisticos"]:
            melhorias.append("Adicionar estatísticas")
        if artigo_concorrente["tamanho_palavras"] < 1000:
            melhorias.append("Expandir para 1500+ palavras")
        
        print(f"✅ Melhorias sugeridas: {', '.join(melhorias)}")
        
        # Gerar versão otimizada
        artigo_melhorado = assistente.criar_artigo(
            tema="Advogado Criminal em São Paulo - Guia Completo",
            palavra_chave="advogado criminal sp",
            tamanho=1500,
            tom="acessível",
            incluir_faq=True,
            categoria="criminal"
        )
        
        print(f"📈 Score melhorado: {artigo_melhorado['score_seo']}/100")
```

---

## 🛠️ Troubleshooting

### Problema 1: Erro de Autenticação WordPress

**Sintoma:**
```
{"code": "rest_forbidden", "message": "Sorry, you are not allowed"}
```

**Soluções:**
1. Verificar token no `.env`:
   ```bash
   echo $WP_RDM_TOKEN
   ```

2. Regenerar token:
   ```bash
   curl -X POST https://rdmadvogados.com.br/wp-json/jwt-auth/v1/token \
     -d "username=admin&password=SUA_SENHA"
   ```

3. Verificar .htaccess do WordPress:
   ```apache
   RewriteCond %{HTTP:Authorization} ^(.*)
   RewriteRule ^(.*) - [E=HTTP_AUTHORIZATION:%1]
   ```

### Problema 2: API de IA não responde

**Sintoma:**
```
Error: API key not valid
```

**Soluções:**
1. Verificar chave no `.env`:
   ```python
   import os
   from dotenv import load_dotenv
   load_dotenv()
   print(os.getenv("GEMINI_API_KEY")[:10])  # Primeiros 10 chars
   ```

2. Testar API diretamente:
   ```bash
   # Gemini
   curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=SUA_CHAVE" \
     -H 'Content-Type: application/json' \
     -d '{"contents":[{"parts":[{"text":"Teste"}]}]}'
   ```

3. Verificar limites de uso:
   - Gemini: https://makersuite.google.com/app/apikey
   - OpenAI: https://platform.openai.com/usage
   - Claude: https://console.anthropic.com/settings/limits

### Problema 3: Conteúdo não está otimizado para SEO

**Sintoma:**
```
score_seo: 45/100
```

**Diagnóstico:**
```python
metricas = assistente.calcular_metricas_seo(artigo)
print(metricas["detalhes"])
# Ex: {"titulo_tamanho": 0, "h2_ok": 7, "paragrafos": 0}
```

**Soluções:**
- `titulo_tamanho: 0` → Ajustar prompt para gerar títulos entre 55-60 chars
- `h2_ok: 7` → Aumentar número de H2s (ideal: 3-6)
- `paragrafos: 0` → Parágrafos muito longos, quebrar em 2-4 linhas

### Problema 4: Violação de Compliance OAB

**Sintoma:**
```
❌ Termo proibido detectado: 'garantido'
```

**Solução:**
```python
# Antes de publicar, sempre validar
compliant, problemas = assistente.validar_compliance_oab(
    artigo["conteudo_html"]
)

if not compliant:
    # Reescrever automaticamente
    prompt_correcao = f"""
    CONTEÚDO ORIGINAL:
    {artigo['conteudo_html']}
    
    PROBLEMAS DETECTADOS:
    {chr(10).join(f"- {p}" for p in problemas)}
    
    Reescreva removendo termos proibidos, mantendo tom educacional.
    """
    
    conteudo_corrigido = assistente._gerar_gemini(prompt_correcao)
    artigo["conteudo_html"] = conteudo_corrigido
```

---

## 📊 Monitoramento de Performance

### Criar Dashboard de Métricas

```python
import json
from datetime import datetime, timedelta

def gerar_relatorio_mensal():
    """Gera relatório de artigos do mês"""
    
    # Carregar histórico de artigos
    with open("logs/historico_artigos.json", "r") as f:
        historico = json.load(f)
    
    mes_atual = datetime.now().replace(day=1)
    artigos_mes = [
        a for a in historico
        if datetime.fromisoformat(a["criado_em"]) >= mes_atual
    ]
    
    # Métricas
    total_artigos = len(artigos_mes)
    custo_total = total_artigos * 0.05
    
    seo_scores = [a["score_seo"] for a in artigos_mes]
    seo_medio = sum(seo_scores) / len(seo_scores) if seo_scores else 0
    
    compliance_scores = [a["score_compliance"] for a in artigos_mes]
    compliance_medio = sum(compliance_scores) / len(compliance_scores) if compliance_scores else 0
    
    # Distribuição por categoria
    categorias = {}
    for artigo in artigos_mes:
        cat = artigo.get("categoria", "geral")
        categorias[cat] = categorias.get(cat, 0) + 1
    
    # Relatório
    print("=" * 50)
    print(f"📊 RELATÓRIO MENSAL - {mes_atual.strftime('%B %Y')}")
    print("=" * 50)
    print(f"\n📝 Total de artigos: {total_artigos}")
    print(f"💰 Custo total: R$ {custo_total:.2f}")
    print(f"📈 SEO médio: {seo_medio:.1f}/100")
    print(f"✅ Compliance médio: {compliance_medio:.1f}/100")
    print(f"\n📁 Distribuição por categoria:")
    for cat, count in sorted(categorias.items(), key=lambda x: x[1], reverse=True):
        print(f"  - {cat}: {count} artigos")
    
    # Economia vs. plataformas tradicionais
    economia_min = total_artigos * 8.20
    economia_max = total_artigos * 49.50
    print(f"\n💵 Economia vs. plataformas: R$ {economia_min:.2f} ~ R$ {economia_max:.2f}")

# Executar
gerar_relatorio_mensal()
```

---

## 🔄 Automação com Cron

### Configurar Tarefas Agendadas

```bash
# Abrir crontab
crontab -e

# Adicionar tarefas:

# Monitorar feeds jornalísticos (3x/dia: 8h, 14h, 20h)
0 8,14,20 * * * /usr/bin/python3 /home/rdm/maa-system/monitorar_feeds.py

# Gerar relatório mensal (dia 1, 9h)
0 9 1 * * /usr/bin/python3 /home/rdm/maa-system/gerar_relatorio.py

# Backup semanal (domingo, 2h)
0 2 * * 0 /home/rdm/maa-system/backup.sh
```

### Script de Backup

```bash
#!/bin/bash
# backup.sh

DATA=$(date +%Y%m%d)
BACKUP_DIR="/home/rdm/maa-backups"

# Criar diretório
mkdir -p $BACKUP_DIR

# Backup de artigos gerados
tar -czf $BACKUP_DIR/artigos_$DATA.tar.gz /home/rdm/maa-system/output/

# Backup de logs
tar -czf $BACKUP_DIR/logs_$DATA.tar.gz /home/rdm/maa-system/logs/

# Limpar backups antigos (>30 dias)
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "✅ Backup concluído: $DATA"
```

---

## 📞 Suporte

**Sistema:** MAA (Meus Artigos Automáticos)  
**Desenvolvedor:** Dr. Rândalos Madeira  
**Email:** contato@rdmadvogados.com.br  
**Website:** https://rdmadvogados.com.br  

**Documentação completa:** `assistente_maa_prompt.md`  
**Código-fonte:** `assistente_maa_implementacao.py`  

---

## 🎯 Próximos Passos

1. ✅ Configurar APIs e WordPress
2. ✅ Testar criação de artigo simples
3. ✅ Validar compliance OAB
4. ⬜ Criar primeira campanha de 10 artigos
5. ⬜ Configurar monitoramento de feeds jornalísticos
6. ⬜ Implementar automação com cron
7. ⬜ Analisar métricas mensais e otimizar

**Sucesso! 🚀**
