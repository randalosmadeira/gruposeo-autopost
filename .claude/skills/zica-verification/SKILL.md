---
name: zica-verification
description: Gates de qualidade e evidências para alterações no Zica.IA/Zica Posts.
---

# Verificação Zica

Execute do menor para o maior escopo:

1. Teste direcionado do módulo alterado.
2. `npm test`.
3. `npm run build`.
4. Lint apenas nos arquivos alterados; depois registre o estado do lint global sem misturar dívida preexistente.
5. Para migração, inspeção estática e testes de invariantes; aplicação remota somente com autorização.

Relate comandos, códigos de saída e contagens. Falha global preexistente não autoriza suprimir regras nem alterar arquivos não relacionados.
