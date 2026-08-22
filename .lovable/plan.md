# Plano de Implementação - Integração Dr. Madeira 1470 & IndexNow

Este plano consolida a integração da persona eleitoral Dr. Madeira 1470 (Unidade ELEITORAL) e a configuração do protocolo IndexNow para indexação acelerada em 2026.

## Alterações Fiscais e Visuais

- Atualizar o texto da página inicial conforme solicitado pelo usuário.
- Garantir que a paleta de cores Bordô/Vinho/Preto seja aplicada consistentemente.

## Backend (Edge Functions & Shared)

- **behavioral-directives.ts**: Refinar as diretrizes para separar claramente o tom "Sem Verniz" do Dr. Madeira (coloquial/popular) da unidade ADV (técnico/sóbrio).
- **generate-article**: Injetar dinamicamente os 60 templates de títulos estratégicos e os conteúdos dos arquivos `.md` fornecidos como exemplos de few-shot.
- **indexnow-notify**: Validar o envio em lote de URLs após a geração bem-sucedida.

## Frontend (Páginas & Componentes)

- **SettingsPage**: Adicionar aba "IndexNow" em "Integrações" para configurar Host, API Key e ver logs de submissão.
- **ElectoralCampaign**: Melhorar o seletor de cidades de SP com base na lista técnica fornecida (Zonas da Capital, Guarulhos, etc.).
- **FirstSentencePreview**: Ajustar os targets de contagem de palavras para refletir a diferença entre artigos Pilares (1500-2200) e Satélites (900-1400).

## Detalhes Técnicos

- Implementação de um `system_prompt` dinâmico que lê o estado da variável `FASE` (Campanha) para permitir o pedido de votos.
- Bloqueio rigoroso de iconografia judicial (martelo/balança) via auditoria de saída da IA.
- Configuração do Host `drmadeira1470.com.br` como padrão para IndexNow.

---
**Deseja prosseguir com a implementação destas melhorias?**
