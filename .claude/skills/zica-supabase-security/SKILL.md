---
name: zica-supabase-security
description: Schema, migrações, RLS, Storage e segurança Supabase do Zica.IA.
---

# Supabase seguro no Zica.IA

- Confira documentação/changelog atual antes de depender de comportamento de versão.
- Use migrações versionadas; não edite migração já aplicada.
- Habilite RLS em toda tabela exposta e combine autenticação com predicado de organização/projeto.
- Nunca autorize por `user_metadata` nem exponha `service_role` no cliente.
- `UPDATE` requer políticas de `SELECT`, `USING` e `WITH CHECK` coerentes.
- Funções `SECURITY DEFINER` devem ter `search_path` fixo, checar `auth.uid()`/papel internamente e grants mínimos.
- Storage deve validar bucket, prefixo do tenant, MIME, tamanho e permissões para cada operação.
- Antes de aplicar remotamente: revisar SQL, testar localmente, executar advisors e obter autorização explícita.
- Registrar rollback SQL ou estratégia de compatibilidade para cada alteração material.
