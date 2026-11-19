# NEXUS Editorial 1.0 — implantação inicial

Autorização: o proprietário aprovou a evolução editorial e, em 28/10/2026, determinou usar PowerShell/SSH na VPS compartilhada em razão do bloqueio financeiro do GitHub Actions. A instalação usa a conta e o diretório próprios do Zica Posts. Não depende de runner pago e não sincroniza ou altera chaves de IA.

## Implementado

- Política compartilhada em geração individual, massa (via generate-article) e reescrita de notícias: precisão, contribuição própria, benefício, objeções, próxima ação e urgência apenas com suporte.
- O pipeline opcional recebe fontes, identidade, briefing e template em todas as etapas; falhas de revisão deixam de aprovar silenciosamente a etapa anterior. Provedor/modelo registrados são os efetivamente retornados.
- Formulário de fontes e conversão, transporte ao backend e salvamento no rascunho. Troca de projeto limpa o briefing para impedir mistura acidental.
- Faixas de extensão alinhadas entre interface e serviços.
- Revisão humana da versão na visualização do artigo. Recibo assinado no servidor sobre conteúdo normalizado, título, metadados, fontes, oferta, projeto e organização. O publicador verifica a versão antes e depois de seu preparo editorial.
- Conteúdos novos produzidos por esses caminhos são marcados como exigindo aprovação. O acervo anterior não recebe alteração em massa. A política de permissão da organização continua sendo exigida; o recibo não substitui autorização.
- Reescrita sem corpo de fonte é recusada antes da chamada de IA. URL sozinha não comprova leitura. Templates explícitos dos agentes existentes são preservados; ausência de template usa padrão genérico, sem impor advocacia a todos os nichos.
- Legibilidade fixa de 80 removida da resposta de notícias. Preparação interna para IA é rotulada como tal, sem alegar citações externas.
- Indicadores paginam todos os registros autorizados em vez de se limitar à primeira página. “Artigos publicados” não representa tráfego observado.
- Normalização de URLs com parâmetros preservada em revisões sucessivas.

## Como usar

1. No gerador, abra **NEXUS · Fontes e conversão**. Preencha os dados reais da oferta e os trechos de apoio quando houver.
2. Gere e salve o artigo. Abra **Revisão editorial** ou visualize o artigo na lista.
3. Carregue a versão, confira fatos, benefícios, urgência e destino; somente então aprove. Essa ação não chama IA nem publica.
4. Publique pelo fluxo habitual. Alterações materiais exigem nova aprovação. Reparos automáticos materiais feitos pelo publicador são salvos e devolvidos para revisão antes do envio ao WordPress.

## Validação

- Suíte completa: 59 arquivos / 413 testes passaram; teste adicional de estabilidade de normalização e regressões editoriais: 29 testes direcionados passaram.
- TypeScript da interface e Deno das quatro funções passaram. Build de produção concluído. Regras do repositório e lint dos componentes novos passaram.
- Não foi gerado artigo pago, aprovada uma peça real ou executada publicação WordPress como teste.

## Instalação direta

As funções são instaladas pelo conector Supabase mantendo `verify_jwt=true`, conforme a configuração efetivamente encontrada em produção. A interface é ativada por `scripts/Deploy-NexusFrontend.ps1`, com chave SSH por referência, verificação do arquivo, cópia da versão anterior e troca atômica do apontamento. Não é necessário reiniciar nginx, containers ou outros sistemas.

Backups das funções anteriores são guardados na máquina de trabalho e na VPS. O backup do frontend e o caminho anterior são registrados pelo script. Reversão do frontend: restaurar atomicamente o link `current` para o caminho salvo. Reversão das funções: reinstalar cada pacote integral da versão anterior, preservando sua configuração JWT. Não reverter dados editoriais em massa.

## Escopo que continua pendente

Esta é a base editorial do upgrade, não a conclusão de todos os adaptadores da proposta. Ainda exigem implementação/homologação própria: conectores de Search Console/Analytics e redes sociais, pesquisa SERP e concorrência automatizada com provedor autorizado, coleta externa de menções/citações em IA, ativação de clusters, orçamento por organização e normalização completa das credenciais. Instalar a skill ou esta política não cria essas conexões.

O diagnóstico das filas antigas não autoriza reprocessamento de todo o acervo. Permanece fora desta implantação qualquer limpeza em massa, rotação de segredos, migração destrutiva e alteração nos outros produtos da VPS.
