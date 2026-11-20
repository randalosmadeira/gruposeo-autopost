/**
 * Carrega o perfil de regras de um artigo juntando as camadas: padrão editável, projeto, artigo e PROMPT do agente (tabela prompt_templates:
 * o template escolhido no artigo, senão o do projeto, senão o global). Só leitura. Falha de leitura = segue com o que já tem (nunca bloqueia).
 * O texto do prompt só é LIDO atrás de diretivas de otimização (ver parsePromptDirectives); nada dele é enviado a terceiros.
 */
import { resolveRuleProfile, type RuleProfile } from './optimization-rules.ts';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);

export async function loadPromptTexts(admin: Admin, article: Rec, project: Rec | null): Promise<string[]> {
  const texts: string[] = [];
  try {
    const cfg = isObj(article.config) ? article.config : {};
    const templateId = typeof cfg.promptTemplateId === 'string' ? cfg.promptTemplateId.trim() : '';
    if (templateId) {
      const { data } = await admin.from('prompt_templates').select('prompt').eq('id', templateId).maybeSingle();
      if (data && typeof data.prompt === 'string') texts.push(data.prompt);
    } else if (project && typeof project.id === 'string') {
      const mine = await admin.from('prompt_templates').select('prompt').eq('project_id', project.id).limit(5);
      const own = (Array.isArray(mine.data) ? mine.data as Array<{ prompt?: string }> : []).find((r) => r.prompt?.trim());
      if (own?.prompt) texts.push(own.prompt);
      else {
        const global = await admin.from('prompt_templates').select('prompt').is('project_id', null).limit(5);
        const g = (Array.isArray(global.data) ? global.data as Array<{ prompt?: string }> : []).find((r) => r.prompt?.trim());
        if (g?.prompt) texts.push(g.prompt);
      }
    }
  } catch { /* sem prompt legível: vale o padrão editável */ }
  return texts;
}

export async function loadRuleProfile(admin: Admin, article: Rec, project: Rec | null): Promise<RuleProfile> {
  const prompts = await loadPromptTexts(admin, article, project);
  return resolveRuleProfile({
    projectIdentity: project?.editorial_identity,
    projectStrategy: isObj(project?.nexus_strategy) ? project!.nexus_strategy as Rec : null,
    articleConfig: isObj(article.config) ? article.config : null,
    prompts,
  });
}
