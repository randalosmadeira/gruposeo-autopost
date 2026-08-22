export function buildSEOPrompts(config: any) {
  return { 
    system: "Sistema regido por instrucoes.md.", 
    user: `Gere conteúdo para: ${config.keyword || 'tema fornecido'}` 
  };
}
