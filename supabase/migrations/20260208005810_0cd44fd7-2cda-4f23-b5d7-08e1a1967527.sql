-- =============================================
-- TABELA: wordpress_article_index
-- Cache híbrido de análise semântica de artigos WP
-- =============================================
CREATE TABLE public.wordpress_article_index (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Identificadores do WordPress
  wp_post_id BIGINT NOT NULL,
  wp_post_url TEXT NOT NULL,
  wp_post_slug TEXT,
  wp_post_title TEXT NOT NULL,
  wp_post_type TEXT DEFAULT 'post',
  wp_post_status TEXT DEFAULT 'publish',
  wp_categories TEXT[] DEFAULT '{}',
  wp_tags TEXT[] DEFAULT '{}',
  
  -- Análise semântica (gerada por IA)
  primary_keyword TEXT,
  secondary_keywords TEXT[] DEFAULT '{}',
  topic_cluster TEXT,  -- cluster/silo identificado pela IA
  semantic_summary TEXT,  -- resumo semântico para matching
  content_hash TEXT,  -- hash MD5 para detectar mudanças
  
  -- Métricas e scoring
  word_count INTEGER DEFAULT 0,
  internal_links_count INTEGER DEFAULT 0,
  external_links_count INTEGER DEFAULT 0,
  seo_score INTEGER DEFAULT 0,
  linkability_score INTEGER DEFAULT 0,  -- quão "linkável" é este artigo (0-100)
  
  -- Metadados de sincronização
  last_wp_modified_at TIMESTAMP WITH TIME ZONE,
  last_analyzed_at TIMESTAMP WITH TIME ZONE,
  analysis_version INTEGER DEFAULT 1,  -- versão do algoritmo de análise
  sync_status TEXT DEFAULT 'pending',  -- pending, synced, error
  sync_error TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Constraint única por post WordPress
  CONSTRAINT unique_wp_post_per_project UNIQUE (project_id, wp_post_id)
);

-- =============================================
-- TABELA: internal_link_suggestions
-- Sugestões de links internos geradas pela IA
-- =============================================
CREATE TABLE public.internal_link_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Artigo de origem (onde o link será inserido)
  source_article_id UUID REFERENCES public.wordpress_article_index(id) ON DELETE CASCADE,
  source_wp_post_id BIGINT,
  
  -- Artigo de destino (para onde o link aponta)
  target_article_id UUID REFERENCES public.wordpress_article_index(id) ON DELETE CASCADE,
  target_wp_post_id BIGINT,
  target_url TEXT NOT NULL,
  
  -- Dados da sugestão
  anchor_text TEXT NOT NULL,
  anchor_context TEXT,  -- frase/parágrafo onde inserir
  relevance_score INTEGER DEFAULT 0,  -- 0-100, quão relevante é o link
  position_suggestion TEXT,  -- 'introduction', 'body', 'conclusion'
  
  -- Status
  status TEXT DEFAULT 'pending',  -- pending, approved, rejected, applied
  applied_at TIMESTAMP WITH TIME ZONE,
  rejected_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- TABELA: keyword_link_rules
-- Regras de linkagem automática por palavra-chave
-- =============================================
CREATE TABLE public.keyword_link_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Regra de linkagem
  keyword TEXT NOT NULL,  -- palavra-chave que dispara o link
  match_type TEXT DEFAULT 'exact',  -- exact, partial, regex
  case_sensitive BOOLEAN DEFAULT false,
  
  -- Destino do link
  target_url TEXT NOT NULL,
  target_title TEXT,  -- para exibição
  
  -- Configurações
  max_links_per_article INTEGER DEFAULT 1,  -- máximo de vezes que linka por artigo
  priority INTEGER DEFAULT 0,  -- prioridade quando múltiplas regras aplicam
  is_active BOOLEAN DEFAULT true,
  
  -- Estatísticas
  times_applied INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_keyword_per_project UNIQUE (project_id, keyword)
);

-- =============================================
-- TABELA: topic_clusters
-- Clusters/Silos temáticos detectados pela IA
-- =============================================
CREATE TABLE public.topic_clusters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Identificação do cluster
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  
  -- Artigo pilar (principal do cluster)
  pillar_article_id UUID REFERENCES public.wordpress_article_index(id) ON DELETE SET NULL,
  
  -- Keywords do cluster
  primary_keywords TEXT[] DEFAULT '{}',
  related_keywords TEXT[] DEFAULT '{}',
  
  -- Métricas
  article_count INTEGER DEFAULT 0,
  average_seo_score INTEGER DEFAULT 0,
  cluster_strength INTEGER DEFAULT 0,  -- força do cluster (0-100)
  
  -- Status
  is_auto_generated BOOLEAN DEFAULT true,  -- gerado pela IA ou manual
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_cluster_slug_per_project UNIQUE (project_id, slug)
);

-- =============================================
-- ÍNDICES PARA PERFORMANCE
-- =============================================
CREATE INDEX idx_wp_article_index_project ON public.wordpress_article_index(project_id);
CREATE INDEX idx_wp_article_index_user ON public.wordpress_article_index(user_id);
CREATE INDEX idx_wp_article_index_cluster ON public.wordpress_article_index(topic_cluster);
CREATE INDEX idx_wp_article_index_keywords ON public.wordpress_article_index USING GIN(secondary_keywords);
CREATE INDEX idx_wp_article_index_sync ON public.wordpress_article_index(sync_status);

CREATE INDEX idx_link_suggestions_project ON public.internal_link_suggestions(project_id);
CREATE INDEX idx_link_suggestions_source ON public.internal_link_suggestions(source_article_id);
CREATE INDEX idx_link_suggestions_status ON public.internal_link_suggestions(status);

CREATE INDEX idx_keyword_rules_project ON public.keyword_link_rules(project_id);
CREATE INDEX idx_keyword_rules_keyword ON public.keyword_link_rules(keyword);
CREATE INDEX idx_keyword_rules_active ON public.keyword_link_rules(is_active);

CREATE INDEX idx_topic_clusters_project ON public.topic_clusters(project_id);

-- =============================================
-- ENABLE RLS
-- =============================================
ALTER TABLE public.wordpress_article_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_link_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keyword_link_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_clusters ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES - wordpress_article_index
-- =============================================
CREATE POLICY "Users can view their own article index"
ON public.wordpress_article_index FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own article index"
ON public.wordpress_article_index FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own article index"
ON public.wordpress_article_index FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own article index"
ON public.wordpress_article_index FOR DELETE
USING (auth.uid() = user_id);

-- =============================================
-- RLS POLICIES - internal_link_suggestions
-- =============================================
CREATE POLICY "Users can view their own link suggestions"
ON public.internal_link_suggestions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own link suggestions"
ON public.internal_link_suggestions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own link suggestions"
ON public.internal_link_suggestions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own link suggestions"
ON public.internal_link_suggestions FOR DELETE
USING (auth.uid() = user_id);

-- =============================================
-- RLS POLICIES - keyword_link_rules
-- =============================================
CREATE POLICY "Users can view their own keyword rules"
ON public.keyword_link_rules FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own keyword rules"
ON public.keyword_link_rules FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own keyword rules"
ON public.keyword_link_rules FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own keyword rules"
ON public.keyword_link_rules FOR DELETE
USING (auth.uid() = user_id);

-- =============================================
-- RLS POLICIES - topic_clusters
-- =============================================
CREATE POLICY "Users can view their own topic clusters"
ON public.topic_clusters FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own topic clusters"
ON public.topic_clusters FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own topic clusters"
ON public.topic_clusters FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own topic clusters"
ON public.topic_clusters FOR DELETE
USING (auth.uid() = user_id);

-- =============================================
-- TRIGGERS PARA updated_at
-- =============================================
CREATE TRIGGER update_wordpress_article_index_updated_at
BEFORE UPDATE ON public.wordpress_article_index
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_internal_link_suggestions_updated_at
BEFORE UPDATE ON public.internal_link_suggestions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_keyword_link_rules_updated_at
BEFORE UPDATE ON public.keyword_link_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_topic_clusters_updated_at
BEFORE UPDATE ON public.topic_clusters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();