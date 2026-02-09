# 🔍 Prompt de Auditoria e Otimização de Sistema

## Objetivo
Realizar uma análise minuciosa do projeto para identificar arquivos, dependências, código e dados irrelevantes que podem ser removidos com segurança, tornando o sistema mais leve e rápido, **sem comprometer nenhuma funcionalidade**.

---

## 📋 PROMPT PARA ANÁLISE COMPLETA

```
Você é um auditor técnico especializado em otimização de aplicações React/TypeScript com Supabase. Sua missão é analisar minuciosamente este projeto e identificar APENAS elementos que podem ser removidos com 100% de segurança, mantendo todas as funcionalidades intactas.

## REGRAS DE OURO (NUNCA VIOLAR)

1. **ZERO RISCO**: Só marque para remoção itens com 100% de certeza de inutilidade
2. **PRESERVAR FUNCIONALIDADE**: Nenhuma feature pode ser afetada
3. **MANTER INTEGRAÇÕES**: WordPress, Supabase, APIs externas devem continuar funcionando
4. **DOCUMENTAR TUDO**: Justifique cada recomendação de remoção
5. **VALIDAÇÃO CRUZADA**: Verifique referências em TODOS os arquivos antes de recomendar remoção

---

## FASE 1: ANÁLISE DE ARQUIVOS E COMPONENTES

### 1.1 Componentes React Órfãos
Execute esta verificação para cada componente em `src/components/`:

□ O componente é importado em algum lugar?
□ Está registrado em alguma rota?
□ É exportado via arquivo index.ts e usado externamente?
□ Faz parte de uma biblioteca de componentes reutilizáveis?

**Comando de verificação**:
```bash
# Para cada componente, buscar referências
grep -r "ComponentName" src/ --include="*.tsx" --include="*.ts"
```

### 1.2 Páginas Não Utilizadas
Para cada arquivo em `src/pages/`:

□ Existe rota definida em App.tsx para esta página?
□ Há links/navegação que levam a esta página?
□ É uma página de fallback ou erro necessária?

### 1.3 Hooks Personalizados
Para cada hook em `src/hooks/`:

□ O hook é importado em algum componente?
□ É utilizado indiretamente via outro hook?
□ Faz parte de uma funcionalidade planejada mas não implementada?

### 1.4 Utilitários e Libs
Para cada arquivo em `src/lib/`:

□ As funções são importadas em algum lugar?
□ São utilities de terceiros que podem ser substituídas por libs existentes?

---

## FASE 2: ANÁLISE DE DEPENDÊNCIAS (package.json)

### 2.1 Dependências Não Utilizadas
Para cada dependência:

□ É importada em algum arquivo .ts/.tsx?
□ É uma dependência de peer/dev necessária para build?
□ É utilizada indiretamente por outra dependência?

**Ferramenta recomendada**: `npx depcheck`

### 2.2 Dependências Duplicadas
□ Existem libs com funcionalidades sobrepostas?
  - Exemplo: date-fns + moment.js
  - Exemplo: lodash + underscore
  - Exemplo: múltiplas libs de ícones

### 2.3 Versões Desatualizadas com Overhead
□ Existem versões antigas que são significativamente maiores que as atuais?
□ Há polyfills desnecessários para browsers modernos?

---

## FASE 3: ANÁLISE DE ASSETS E ARQUIVOS ESTÁTICOS

### 3.1 Imagens e Mídia (public/ e src/assets/)
Para cada asset:

□ É referenciado em algum componente/CSS?
□ É carregado dinamicamente via URL?
□ Tem versões duplicadas (diferentes resoluções do mesmo arquivo)?
□ Pode ser otimizado (compressão, formato moderno como WebP)?

### 3.2 Arquivos de Configuração
□ Existem arquivos .config que não são utilizados?
□ Há configurações de ferramentas não instaladas?

### 3.3 Documentação Obsoleta
□ A documentação em docs/ está atualizada?
□ Existem TODOs ou FIXMEs em arquivos de doc antigos?

---

## FASE 4: ANÁLISE DE CÓDIGO MORTO

### 4.1 Funções e Variáveis Não Utilizadas
□ Existem exports que nunca são importados?
□ Há funções definidas mas nunca chamadas?
□ Variáveis declaradas mas não utilizadas?

**Ferramenta**: ESLint com regras `no-unused-vars`, `no-unreachable`

### 4.2 Código Comentado
□ Há blocos de código comentados extensos (>10 linhas)?
□ São backups de funcionalidades antigas?
□ Podem ser recuperados via git history?

### 4.3 Console.logs e Debug Code
□ Existem console.log de desenvolvimento?
□ Há debuggers esquecidos?
□ Timeouts/intervals de teste?

### 4.4 Feature Flags Obsoletas
□ Existem condicionais para features que já estão 100% ativas?
□ Há código de A/B testing antigo?

---

## FASE 5: ANÁLISE DE BANCO DE DADOS (Supabase)

### 5.1 Tabelas Órfãs
□ Existem tabelas não referenciadas no código?
□ Há tabelas de migração/temporárias não removidas?

### 5.2 Colunas Não Utilizadas
□ Existem colunas que nunca são lidas/escritas pelo código?
□ Há colunas deprecated com dados antigos?

### 5.3 Índices Redundantes
□ Existem índices duplicados?
□ Há índices em colunas nunca filtradas?

### 5.4 Funções/Triggers Inativos
□ Existem database functions não chamadas?
□ Há triggers em tabelas sem inserções?

⚠️ **CUIDADO**: Antes de remover qualquer elemento do banco:
- Verificar se há dados de produção que precisam ser preservados
- Fazer backup completo
- Testar em ambiente de staging

---

## FASE 6: ANÁLISE DE EDGE FUNCTIONS

### 6.1 Functions Não Utilizadas
Para cada função em `supabase/functions/`:

□ É chamada pelo frontend?
□ É acionada por webhook?
□ Faz parte de um cron job ativo?
□ É dependência de outra function?

### 6.2 Código Compartilhado (_shared/)
□ Os módulos em _shared/ são importados por functions ativas?

---

## FASE 7: ANÁLISE DE ESTILOS

### 7.1 Classes CSS Não Utilizadas
□ Existem classes definidas em index.css não usadas?
□ Há variáveis CSS órfãs?

### 7.2 Tailwind Purge
□ O sistema de purge está configurado corretamente?
□ Há classes customizadas em tailwind.config.ts não utilizadas?

---

## 📊 TEMPLATE DE RELATÓRIO

### Resumo Executivo
- Total de arquivos analisados: ___
- Arquivos candidatos a remoção: ___
- Economia estimada (KB/MB): ___
- Nível de confiança: Alto/Médio/Baixo

### Itens para Remoção Segura (100% confiança)

| Tipo | Caminho/Nome | Justificativa | Economia |
|------|--------------|---------------|----------|
| Componente | src/components/OldWidget.tsx | Zero importações encontradas | 2.3KB |
| Dependência | moment.js | Substituída por date-fns | 67KB |
| Asset | public/old-logo.png | Não referenciado | 45KB |

### Itens para Revisão (Necessita Confirmação Humana)

| Tipo | Caminho/Nome | Dúvida | Risco |
|------|--------------|--------|-------|
| Página | src/pages/Legacy.tsx | Pode ser link externo | Médio |
| Tabela | old_users | Pode ter dados históricos | Alto |

### Itens Preservados (Parecem inutilizados mas são necessários)

| Tipo | Caminho/Nome | Motivo da Preservação |
|------|--------------|----------------------|
| Hook | useDebounce | Usado dinamicamente via spread |
| Config | .env.example | Documentação para novos devs |

---

## ✅ CHECKLIST PRÉ-REMOÇÃO

Antes de executar qualquer remoção:

□ Backup completo do projeto realizado
□ Branch separada criada para as mudanças
□ Todos os testes passando antes das mudanças
□ Cada remoção testada individualmente
□ Build de produção verificado após mudanças
□ Smoke test em todas as funcionalidades principais
□ Rollback plan documentado

---

## 🎯 MÉTRICAS DE SUCESSO

Após otimização, verificar:

1. **Bundle Size**: Redução de X% no tamanho do build
2. **Load Time**: Melhoria no First Contentful Paint
3. **Build Time**: Redução no tempo de compilação
4. **Test Coverage**: Mantida ou melhorada
5. **Funcionalidades**: 100% operacionais

---

## ⚠️ LISTA DE EXCLUSÃO (NUNCA REMOVER)

Arquivos que NUNCA devem ser removidos, mesmo que pareçam inutilizados:

- `src/integrations/supabase/client.ts` - Gerado automaticamente
- `src/integrations/supabase/types.ts` - Gerado automaticamente
- `supabase/config.toml` - Configuração crítica
- `.env` - Variáveis de ambiente
- `package.json` / `package-lock.json` - Dependências
- `tsconfig.json` - Configuração TypeScript
- `vite.config.ts` - Build configuration
- `tailwind.config.ts` - Estilização
- `index.html` - Entry point
- Qualquer arquivo em `supabase/migrations/` - Histórico do banco
```

---

## 🚀 COMO USAR ESTE PROMPT

1. **Copie o prompt acima** para o Claude/ChatGPT
2. **Anexe ou descreva** a estrutura do seu projeto
3. **Execute fase por fase** para análise detalhada
4. **Documente resultados** no template de relatório
5. **Implemente mudanças** com cautela, testando cada uma

## 📝 Notas Adicionais

- Execute este audit periodicamente (mensal/trimestral)
- Mantenha um changelog de otimizações realizadas
- Use ferramentas automatizadas quando disponíveis
- Sempre priorize estabilidade sobre otimização
