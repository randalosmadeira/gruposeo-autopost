# NEXUS Intelligence — preparação sem execução paga

Decisão do proprietário em 28/10/2026: preparar as seis frentes sem executar serviços pagos; avaliação editorial autônoma por IA, considerando nicho, segmento, público, etapa do funil, posicionamento, vendas e conversão. Não exigir aprovação humana em cada artigo. A opção manual continua disponível, sem ser o modo do novo programa.

## Estado e escopo

O programa novo começa com `execution_enabled=false`, orçamento zero e revisão `autonomous`. Não houve chamada paga de SERP, avaliação, observação ou geração para homologação. O bloqueio é aplicado no servidor antes de acessar o provedor e antes de reservar custo. Credenciais, modelo, preços/limites e autorização positiva precisam estar configurados antes de uma futura execução.

Isso não desliga nem migra silenciosamente os fluxos legados da plataforma. O controle monetário desta etapa abrange `nexus_operations`. O resolvedor legado de IA ainda usa sua política anterior; governança universal de todo o consumo exige migrar os demais consumidores e reconciliar o faturamento. A reserva debita um teto configurado conservadoramente, não comprova o custo da fatura do provedor. Falha ambígua mantém a reserva como `uncertain`, sem reexecução automática.

## Implementação das seis frentes

1. **SERP e concorrentes:** adaptador Serper, pergunta/localidade/idioma preservados, resultados orgânicos e posição observada dentro da amostra. Ausência é `null`, nunca posição zero. Contrato preparado e testado com fixtures; falta homologação autenticada do provedor. Sem chave Serper da organização, não executa.
2. **Menções e citações em IA:** adaptador OpenAI Responses com busca e anotações nativas de citação. Pergunta, repetição, idioma, localidade, resposta, modelo e data são preservados. Plano padrão tem duas repetições. Separar consultas com marca das de descoberta. Menção é correspondência literal de variante; recomendação e posição não são inferidas. Falhas são reportadas na cobertura e excluídas do denominador. A API não equivale à interface ChatGPT nem a todas as plataformas. Não há coleta externa real nesta etapa.
3. **Clusters e links:** agrupamento inicial por termos em até 200 artigos publicados do próprio projeto, até oito grupos, com membros registrados. O agrupamento lexical não é análise semântica por IA. Sugestões de links com expressão literal no corpo, destinos HTTPS do mesmo host, allowlist administrativa, DNS público e redirecionamentos restritos. Lote inicial: 20 fontes e 10 destinos. Aplicação somente em rascunhos/não publicados, com nova revisão exigida; nunca em artigos já publicados. DNS/HEAD é verificação pontual, não garantia permanente de disponibilidade. Subdomínios diferentes exigem autorização própria.
4. **Custos e credenciais:** metadados por organização e valores no Vault; sem chave global alternativa no novo módulo. Configuração requer proprietário/administrador. Chave armazenada permanece `stored_unverified`, sem validação paga implícita. Execução preparada para Serper e OpenAI; armazenamento de Anthropic/Gemini não significa adaptador de execução instalado para eles. Orçamento, reservas e operações são protegidos contra escrita direta pelo navegador; funções privilegiadas ficam no schema privado, com wrappers service-only.
5. **Filas antigas:** diagnóstico encontrou 312 gerações e 103 verificações de provedor em `dead_letter`, cinco auditorias heurísticas antigas em processamento e 311 artigos em geração. Duas auditorias obsoletas foram canceladas após comprovação de auditorias concluídas no dia; três foram reenfileiradas como auditorias não generativas, com backup e limite explícito. Artigos antigos não foram regenerados, nem tarefas de geração reabertas.
6. **Piloto e conversões:** preparação idempotente de até 10 referências publicadas por projeto, sem gerar ou avaliar conteúdo. Novos salvamentos individuais, em massa e de notícias preparam avaliação autônoma durável. O worker só consome avaliações quando o programa estiver habilitado e tiver orçamento positivo, no máximo uma por passagem disponível. A revisão exige dimensões aprovadas, ausência de pendências, afirmações com trechos de suporte e verificações determinísticas; não é garantia de exatidão universal. Aprovação é vinculada ao conteúdo e ao projeto e não publica por si só. Eventos de clique, contato, lead qualificado, agendamento e contrato podem ser importados com evidência, origem, data e chave de deduplicação; isso não instala pixel público nem integra CRM automaticamente. Não há ganho de conversão medido.

## Fluxo preparado para avaliação autônoma

Nicho/público/funil/oferta/fontes acompanham o rascunho. O salvamento prepara `editorial_review` com chave derivada da versão. O worker verifica o programa; orçamento zero não aciona IA. Com futura autorização positiva e configuração completa, a avaliação retorna parecer estruturado. Somente parecer aprovado + evidências literais + HTML válido produzem recibo assinado. Mudança concorrente no artigo impede salvar a aprovação. Pendências deixam a peça sem aprovação. O publicador mantém as verificações já instaladas.

## Verificação e implantação

- Banco isolado PGlite: migração, RLS, restrições de escrita/execução, reserva com orçamento zero, idempotência, limite, contabilização e isolamento de credenciais passaram.
- Testes de parser SERP, citações nativas, denominador, quotes inventadas, ausência de fontes, orçamento, DNS/redirecionamento e inserção de links passaram.
- Deno dos serviços e TypeScript da interface verificados. Suíte completa: 60 arquivos / 423 testes passaram.
- Migração aditiva aplicada com RLS; Advisor não acrescentou avisos de segurança em relação à linha de base. Avisos antigos permanecem fora desta mudança.
- Instalação segue o caminho PowerShell/SSH autorizado, sem depender de GitHub Actions e sem ler ou copiar chaves privadas. Backups anteriores mantidos na máquina e na VPS.

## Referências técnicas

- [OpenAI: busca e anotações de citação](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Serper: produto e formato de resultados demonstrado](https://serper.dev/). A configuração autenticada do endpoint ainda requer homologação.
- [Supabase: RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Vault](https://supabase.com/docs/guides/database/vault)

Não ativar execução positiva só para testar: a decisão vigente é preparar sem serviços pagos.
