
-- ============================================================================
-- MIGRAÇÃO: SISTEMA DE GATILHOS EMOCIONAIS v2.0
-- ============================================================================

-- Adicionar campos NOVOS (emotional_trigger, emotional_confidence, image_style, image_source já existem)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS emotional_intensity TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_prompt TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_disclaimer TEXT;

-- Índices para análise de performance
CREATE INDEX IF NOT EXISTS idx_articles_emotional_trigger ON articles(emotional_trigger);
CREATE INDEX IF NOT EXISTS idx_articles_image_source ON articles(image_source);

-- Comentários para documentação
COMMENT ON COLUMN articles.emotional_trigger IS 'Gatilho emocional: serious, humor, concern, outrage, anguish, sarcasm, satire, happiness, celebration, doubt, mystery';
COMMENT ON COLUMN articles.emotional_confidence IS 'Confiança da detecção (0-100)';
COMMENT ON COLUMN articles.emotional_intensity IS 'Intensidade emocional: low, medium, high';
COMMENT ON COLUMN articles.image_style IS 'Estilo da imagem: photorealistic_documentary, caricature_colorful, noir_enigmatic, etc.';
COMMENT ON COLUMN articles.image_source IS 'Origem: original, caricature, generated, conceptual';
COMMENT ON COLUMN articles.image_prompt IS 'Prompt usado para gerar a imagem';
COMMENT ON COLUMN articles.image_disclaimer IS 'Disclaimer para caricaturas';

-- Tabela de configurações de gatilhos por usuário
CREATE TABLE IF NOT EXISTS emotional_trigger_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trigger_code TEXT NOT NULL,
  custom_prompt TEXT,
  custom_color_palette TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, trigger_code)
);

ALTER TABLE emotional_trigger_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their trigger configs"
  ON emotional_trigger_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their trigger configs"
  ON emotional_trigger_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their trigger configs"
  ON emotional_trigger_configs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their trigger configs"
  ON emotional_trigger_configs FOR DELETE
  USING (auth.uid() = user_id);

-- View para análise de distribuição de gatilhos
CREATE OR REPLACE VIEW emotional_trigger_stats AS
SELECT 
  user_id,
  emotional_trigger,
  image_source,
  COUNT(*) as total_articles,
  AVG(emotional_confidence) as avg_confidence,
  COUNT(CASE WHEN image_source = 'original' THEN 1 END) as reused_count,
  COUNT(CASE WHEN image_source = 'caricature' THEN 1 END) as caricature_count,
  MIN(created_at) as first_article,
  MAX(created_at) as last_article
FROM articles
WHERE emotional_trigger IS NOT NULL
GROUP BY user_id, emotional_trigger, image_source;

GRANT SELECT ON emotional_trigger_stats TO authenticated;

-- Índice composto para busca por período + gatilho
CREATE INDEX IF NOT EXISTS idx_articles_created_at_trigger 
  ON articles(created_at, emotional_trigger) 
  WHERE emotional_trigger IS NOT NULL;
