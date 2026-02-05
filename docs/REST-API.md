# REST API - Documentação

Este projeto expõe uma REST API completa via Edge Functions para gerenciar artigos, integrar com WordPress e usar serviços de IA.

## Base URL

```
https://munojeshxsnwgfkztndb.supabase.co/functions/v1
```

---

## 1. WordPress API (`/wordpress-api`)

Proxy para a REST API do WordPress, evitando problemas de CORS.

### Ações Disponíveis

| Ação | Método | Descrição |
|------|--------|-----------|
| `health` | POST | Verifica status da API |
| `get-posts` | POST | Lista posts do WordPress |
| `get-post` | POST | Obtém um post específico |
| `create-post` | POST | Cria novo post |
| `update-post` | POST | Atualiza post existente |
| `delete-post` | POST | Remove post |
| `get-categories` | POST | Lista categorias |
| `create-category` | POST | Cria categoria |
| `get-tags` | POST | Lista tags |
| `create-tag` | POST | Cria tag |
| `get-media` | POST | Lista mídia |
| `upload-media` | POST | Faz upload de imagem |
| `get-users` | POST | Lista usuários |
| `get-current-user` | POST | Usuário autenticado |
| `update-yoast-meta` | POST | Atualiza meta Yoast SEO |
| `update-rankmath-meta` | POST | Atualiza meta Rank Math |

### Exemplo: Criar Post

```bash
curl -X POST \
  "https://...supabase.co/functions/v1/wordpress-api?action=create-post" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "projectId": "uuid-do-projeto",
    "title": "Meu Novo Post",
    "content": "<p>Conteúdo do post</p>",
    "excerpt": "Resumo do post",
    "status": "draft"
  }'
```

### Exemplo: Upload de Imagem

```bash
curl -X POST \
  "https://...supabase.co/functions/v1/wordpress-api?action=upload-media" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "projectId": "uuid-do-projeto",
    "imageData": "data:image/png;base64,iVBORw0KGgo...",
    "filename": "featured-image.png",
    "mimeType": "image/png"
  }'
```

---

## 2. Articles API (`/articles-api`)

CRUD completo para gerenciar artigos do sistema.

### Ações Disponíveis

| Ação | Método | Descrição |
|------|--------|-----------|
| `list` | GET/POST | Lista artigos com paginação e filtros |
| `get` | GET | Obtém artigo por ID |
| `create` | POST | Cria novo artigo |
| `update` | POST | Atualiza artigo |
| `delete` | POST/DELETE | Remove artigo |
| `bulk-delete` | POST | Remove múltiplos artigos |
| `bulk-update-status` | POST | Atualiza status em lote |
| `stats` | GET | Estatísticas dos artigos |

### Exemplo: Listar Artigos

```bash
curl -X GET \
  "https://...supabase.co/functions/v1/articles-api?action=list&page=1&perPage=20&status=ready" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "apikey: YOUR_ANON_KEY"
```

### Exemplo: Criar Artigo

```bash
curl -X POST \
  "https://...supabase.co/functions/v1/articles-api?action=create" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "title": "Como Otimizar SEO em 2026",
    "keyword": "otimizar seo",
    "secondaryKeywords": ["seo 2026", "google ranking"],
    "type": "blog",
    "projectId": "uuid-do-projeto"
  }'
```

### Exemplo: Estatísticas

```bash
curl -X GET \
  "https://...supabase.co/functions/v1/articles-api?action=stats" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "apikey: YOUR_ANON_KEY"
```

Resposta:
```json
{
  "success": true,
  "data": {
    "total": 45,
    "byStatus": { "draft": 10, "ready": 30, "published": 5 },
    "byType": { "blog": 40, "review": 5 },
    "totalWords": 125000,
    "thisMonth": 12
  }
}
```

---

## 3. AI API (`/ai-api`)

Serviços de IA para geração de conteúdo.

### Ações Disponíveis

| Ação | Método | Descrição |
|------|--------|-----------|
| `health` | POST | Status da API e chaves configuradas |
| `list-models` | POST | Lista modelos disponíveis |
| `generate-text` | POST | Geração de texto livre |
| `generate-title` | POST | Gera títulos SEO |
| `generate-meta` | POST | Gera meta descrição |
| `generate-outline` | POST | Gera estrutura de artigo |
| `generate-image` | POST | Gera imagem via Gemini |

### Exemplo: Gerar Títulos

```bash
curl -X POST \
  "https://...supabase.co/functions/v1/ai-api" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "action": "generate-title",
    "prompt": "marketing digital para pequenas empresas"
  }'
```

Resposta:
```json
{
  "success": true,
  "titles": [
    "Marketing Digital para PMEs: 10 Estratégias que Funcionam",
    "Guia Completo: Como Pequenas Empresas Dominam o Digital",
    "Marketing Digital Acessível: Dicas para Empreendedores",
    "5 Táticas de Marketing Digital que Toda PME Precisa Conhecer",
    "Do Zero ao Sucesso: Marketing Digital para Pequenos Negócios"
  ],
  "model": "google/gemini-2.5-flash"
}
```

### Exemplo: Gerar Estrutura de Artigo

```bash
curl -X POST \
  "https://...supabase.co/functions/v1/ai-api" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "action": "generate-outline",
    "prompt": "como criar um e-commerce de sucesso"
  }'
```

### Exemplo: Gerar Imagem

```bash
curl -X POST \
  "https://...supabase.co/functions/v1/ai-api" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{
    "action": "generate-image",
    "imagePrompt": "Ilustração moderna de e-commerce, estilo minimalista, cores vibrantes"
  }'
```

---

## 4. Webhooks (`/webhooks`)

Endpoints para receber notificações de serviços externos.

### Fontes Suportadas

| Source | Events | Descrição |
|--------|--------|-----------|
| `wordpress` | `post_published`, `post_deleted`, `post_updated` | Notificações do WordPress |
| `ai-service` | `generation_complete`, `generation_failed` | Callbacks de geração de IA |
| `news-agent` | `news_found`, `agent_error` | Eventos dos agentes de notícias |
| `test` | qualquer | Webhook de teste |

### Autenticação

Todos os webhooks requerem o header `x-webhook-secret` com o segredo configurado.

### Exemplo: Webhook WordPress

Configure no WordPress (via plugin como WP Webhooks):

```
URL: https://...supabase.co/functions/v1/webhooks?source=wordpress&event=post_published
Method: POST
Headers: x-webhook-secret: seu-segredo
```

Payload esperado:
```json
{
  "post_id": 123,
  "post_url": "https://meusite.com/meu-post",
  "post_title": "Título do Post",
  "site_url": "https://meusite.com"
}
```

### Exemplo: Teste

```bash
curl -X POST \
  "https://...supabase.co/functions/v1/webhooks?source=test&event=ping" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: default-secret" \
  -d '{"message": "Hello!"}'
```

---

## Códigos de Status

| Código | Significado |
|--------|-------------|
| 200 | Sucesso |
| 400 | Requisição inválida (parâmetros faltando) |
| 401 | Não autorizado |
| 404 | Recurso não encontrado |
| 500 | Erro interno |

## Formato de Resposta

Todas as respostas seguem o formato:

```json
{
  "success": true|false,
  "data": { ... },      // quando success=true
  "error": "mensagem",  // quando success=false
  "hint": "dica"        // opcional, ajuda a resolver o erro
}
```
