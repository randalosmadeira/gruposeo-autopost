export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_news: {
        Row: {
          agent_id: string
          article_id: string | null
          content: string | null
          created_at: string
          generated_at: string | null
          id: string
          original_title: string | null
          published_at: string | null
          source_name: string | null
          source_url: string | null
          status: string | null
          title: string
          user_id: string
        }
        Insert: {
          agent_id: string
          article_id?: string | null
          content?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          original_title?: string | null
          published_at?: string | null
          source_name?: string | null
          source_url?: string | null
          status?: string | null
          title: string
          user_id: string
        }
        Update: {
          agent_id?: string
          article_id?: string | null
          content?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          original_title?: string | null
          published_at?: string | null
          source_name?: string | null
          source_url?: string | null
          status?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_news_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "news_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_news_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_reports: {
        Row: {
          admin_notes: string | null
          article_id: string
          category: string
          created_at: string
          credits_refunded: number | null
          description: string
          id: string
          resolved_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          article_id: string
          category: string
          created_at?: string
          credits_refunded?: number | null
          description: string
          id?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          article_id?: string
          category?: string
          created_at?: string
          credits_refunded?: number | null
          description?: string
          id?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_reports_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_versions: {
        Row: {
          article_id: string
          change_description: string | null
          content: string | null
          created_at: string
          excerpt: string | null
          featured_image_url: string | null
          id: string
          is_auto_save: boolean | null
          title: string | null
          user_id: string
          version_number: number
          word_count: number | null
        }
        Insert: {
          article_id: string
          change_description?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          is_auto_save?: boolean | null
          title?: string | null
          user_id: string
          version_number?: number
          word_count?: number | null
        }
        Update: {
          article_id?: string
          change_description?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          is_auto_save?: boolean | null
          title?: string | null
          user_id?: string
          version_number?: number
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "article_versions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          angulo_analise: string | null
          compliance_aplicado: string | null
          config: Json | null
          content: string | null
          created_at: string
          emotional_confidence: number | null
          emotional_intensity: string | null
          emotional_trigger: string | null
          error_message: string | null
          excerpt: string | null
          featured_image_url: string | null
          id: string
          image_disclaimer: string | null
          image_prompt: string | null
          image_source: string | null
          image_style: string | null
          keyword: string
          metricas_verniz: Json | null
          nicho_detectado: string | null
          project_id: string | null
          published_at: string | null
          published_url: string | null
          scheduled_at: string | null
          secondary_keywords: string[] | null
          seo_score: number | null
          slug: string | null
          status: Database["public"]["Enums"]["article_status"]
          title: string | null
          type: Database["public"]["Enums"]["article_type"]
          updated_at: string
          user_id: string
          word_count: number | null
        }
        Insert: {
          angulo_analise?: string | null
          compliance_aplicado?: string | null
          config?: Json | null
          content?: string | null
          created_at?: string
          emotional_confidence?: number | null
          emotional_intensity?: string | null
          emotional_trigger?: string | null
          error_message?: string | null
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          image_disclaimer?: string | null
          image_prompt?: string | null
          image_source?: string | null
          image_style?: string | null
          keyword: string
          metricas_verniz?: Json | null
          nicho_detectado?: string | null
          project_id?: string | null
          published_at?: string | null
          published_url?: string | null
          scheduled_at?: string | null
          secondary_keywords?: string[] | null
          seo_score?: number | null
          slug?: string | null
          status?: Database["public"]["Enums"]["article_status"]
          title?: string | null
          type?: Database["public"]["Enums"]["article_type"]
          updated_at?: string
          user_id: string
          word_count?: number | null
        }
        Update: {
          angulo_analise?: string | null
          compliance_aplicado?: string | null
          config?: Json | null
          content?: string | null
          created_at?: string
          emotional_confidence?: number | null
          emotional_intensity?: string | null
          emotional_trigger?: string | null
          error_message?: string | null
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          image_disclaimer?: string | null
          image_prompt?: string | null
          image_source?: string | null
          image_style?: string | null
          keyword?: string
          metricas_verniz?: Json | null
          nicho_detectado?: string | null
          project_id?: string | null
          published_at?: string | null
          published_url?: string | null
          scheduled_at?: string | null
          secondary_keywords?: string[] | null
          seo_score?: number | null
          slug?: string | null
          status?: Database["public"]["Enums"]["article_status"]
          title?: string | null
          type?: Database["public"]["Enums"]["article_type"]
          updated_at?: string
          user_id?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      emotional_trigger_configs: {
        Row: {
          created_at: string | null
          custom_color_palette: string[] | null
          custom_prompt: string | null
          id: string
          is_active: boolean | null
          trigger_code: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          custom_color_palette?: string[] | null
          custom_prompt?: string | null
          id?: string
          is_active?: boolean | null
          trigger_code: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          custom_color_palette?: string[] | null
          custom_prompt?: string | null
          id?: string
          is_active?: boolean | null
          trigger_code?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      generation_logs: {
        Row: {
          completed_at: string | null
          completed_steps: number | null
          created_at: string
          current_step: string | null
          error_message: string | null
          generation_type: string
          id: string
          metadata: Json | null
          started_at: string
          status: string
          total_steps: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_steps?: number | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          generation_type?: string
          id?: string
          metadata?: Json | null
          started_at?: string
          status?: string
          total_steps?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_steps?: number | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          generation_type?: string
          id?: string
          metadata?: Json | null
          started_at?: string
          status?: string
          total_steps?: number | null
          user_id?: string
        }
        Relationships: []
      }
      internal_link_suggestions: {
        Row: {
          anchor_context: string | null
          anchor_text: string
          applied_at: string | null
          created_at: string
          id: string
          position_suggestion: string | null
          project_id: string
          rejected_reason: string | null
          relevance_score: number | null
          source_article_id: string | null
          source_wp_post_id: number | null
          status: string | null
          target_article_id: string | null
          target_url: string
          target_wp_post_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_context?: string | null
          anchor_text: string
          applied_at?: string | null
          created_at?: string
          id?: string
          position_suggestion?: string | null
          project_id: string
          rejected_reason?: string | null
          relevance_score?: number | null
          source_article_id?: string | null
          source_wp_post_id?: number | null
          status?: string | null
          target_article_id?: string | null
          target_url: string
          target_wp_post_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_context?: string | null
          anchor_text?: string
          applied_at?: string | null
          created_at?: string
          id?: string
          position_suggestion?: string | null
          project_id?: string
          rejected_reason?: string | null
          relevance_score?: number | null
          source_article_id?: string | null
          source_wp_post_id?: number | null
          status?: string | null
          target_article_id?: string | null
          target_url?: string
          target_wp_post_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_link_suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_suggestions_source_article_id_fkey"
            columns: ["source_article_id"]
            isOneToOne: false
            referencedRelation: "wordpress_article_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_suggestions_target_article_id_fkey"
            columns: ["target_article_id"]
            isOneToOne: false
            referencedRelation: "wordpress_article_index"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_link_rules: {
        Row: {
          case_sensitive: boolean | null
          created_at: string
          id: string
          is_active: boolean | null
          keyword: string
          match_type: string | null
          max_links_per_article: number | null
          priority: number | null
          project_id: string
          target_title: string | null
          target_url: string
          times_applied: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          case_sensitive?: boolean | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          keyword: string
          match_type?: string | null
          max_links_per_article?: number | null
          priority?: number | null
          project_id: string
          target_title?: string | null
          target_url: string
          times_applied?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          case_sensitive?: boolean | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          keyword?: string
          match_type?: string | null
          max_links_per_article?: number | null
          priority?: number | null
          project_id?: string
          target_title?: string | null
          target_url?: string
          times_applied?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_link_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      monitored_portals: {
        Row: {
          active_days: string[] | null
          active_hours: string[] | null
          article_length: string | null
          articles_generated: number | null
          auto_meta_description: boolean | null
          auto_publish: boolean | null
          auto_title: boolean | null
          created_at: string
          custom_slug_prefix: string | null
          default_angle: string | null
          excluded_keywords: string[] | null
          id: string
          is_active: boolean | null
          last_article_at: string | null
          last_check_at: string | null
          last_error: string | null
          max_articles_per_day: number | null
          monitoring_frequency: string | null
          next_check_at: string | null
          niches: string[] | null
          portal_domain: string
          portal_name: string
          portal_url: string
          preferred_keywords: string[] | null
          preserve_original_seo: boolean | null
          project_id: string | null
          publish_delay_minutes: number | null
          rss_feed_url: string | null
          seo_preservation_percent: number | null
          sitemap_priority: number | null
          update_sitemap: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_days?: string[] | null
          active_hours?: string[] | null
          article_length?: string | null
          articles_generated?: number | null
          auto_meta_description?: boolean | null
          auto_publish?: boolean | null
          auto_title?: boolean | null
          created_at?: string
          custom_slug_prefix?: string | null
          default_angle?: string | null
          excluded_keywords?: string[] | null
          id?: string
          is_active?: boolean | null
          last_article_at?: string | null
          last_check_at?: string | null
          last_error?: string | null
          max_articles_per_day?: number | null
          monitoring_frequency?: string | null
          next_check_at?: string | null
          niches?: string[] | null
          portal_domain: string
          portal_name: string
          portal_url: string
          preferred_keywords?: string[] | null
          preserve_original_seo?: boolean | null
          project_id?: string | null
          publish_delay_minutes?: number | null
          rss_feed_url?: string | null
          seo_preservation_percent?: number | null
          sitemap_priority?: number | null
          update_sitemap?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_days?: string[] | null
          active_hours?: string[] | null
          article_length?: string | null
          articles_generated?: number | null
          auto_meta_description?: boolean | null
          auto_publish?: boolean | null
          auto_title?: boolean | null
          created_at?: string
          custom_slug_prefix?: string | null
          default_angle?: string | null
          excluded_keywords?: string[] | null
          id?: string
          is_active?: boolean | null
          last_article_at?: string | null
          last_check_at?: string | null
          last_error?: string | null
          max_articles_per_day?: number | null
          monitoring_frequency?: string | null
          next_check_at?: string | null
          niches?: string[] | null
          portal_domain?: string
          portal_name?: string
          portal_url?: string
          preferred_keywords?: string[] | null
          preserve_original_seo?: boolean | null
          project_id?: string | null
          publish_delay_minutes?: number | null
          rss_feed_url?: string | null
          seo_preservation_percent?: number | null
          sitemap_priority?: number | null
          update_sitemap?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitored_portals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      news_agents: {
        Row: {
          active_days: string[] | null
          agent_type: string | null
          articles_generated: number | null
          auto_publish: boolean | null
          category: string | null
          cite_sources_footer: boolean | null
          cite_sources_inline: boolean | null
          country: string | null
          created_at: string
          execution_times: string[] | null
          id: string
          image_generation: string | null
          is_active: boolean
          keywords: string[] | null
          language: string | null
          last_error: string | null
          last_run_at: string | null
          name: string
          news_per_day: number | null
          post_type: string | null
          project_id: string | null
          prompt_template: string | null
          publish_status: string | null
          rss_feeds: string[] | null
          search_internal_links: boolean | null
          search_window: string | null
          topics: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active_days?: string[] | null
          agent_type?: string | null
          articles_generated?: number | null
          auto_publish?: boolean | null
          category?: string | null
          cite_sources_footer?: boolean | null
          cite_sources_inline?: boolean | null
          country?: string | null
          created_at?: string
          execution_times?: string[] | null
          id?: string
          image_generation?: string | null
          is_active?: boolean
          keywords?: string[] | null
          language?: string | null
          last_error?: string | null
          last_run_at?: string | null
          name: string
          news_per_day?: number | null
          post_type?: string | null
          project_id?: string | null
          prompt_template?: string | null
          publish_status?: string | null
          rss_feeds?: string[] | null
          search_internal_links?: boolean | null
          search_window?: string | null
          topics?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active_days?: string[] | null
          agent_type?: string | null
          articles_generated?: number | null
          auto_publish?: boolean | null
          category?: string | null
          cite_sources_footer?: boolean | null
          cite_sources_inline?: boolean | null
          country?: string | null
          created_at?: string
          execution_times?: string[] | null
          id?: string
          image_generation?: string | null
          is_active?: boolean
          keywords?: string[] | null
          language?: string | null
          last_error?: string | null
          last_run_at?: string | null
          name?: string
          news_per_day?: number | null
          post_type?: string | null
          project_id?: string | null
          prompt_template?: string | null
          publish_status?: string | null
          rss_feeds?: string[] | null
          search_internal_links?: boolean | null
          search_window?: string | null
          topics?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_agents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          compliance_rules: string | null
          created_at: string
          cta_comunidade: string | null
          cta_conclusao: string | null
          cta_leads: string | null
          description: string | null
          domain: string
          empresa_endereco: string | null
          empresa_nome: string | null
          empresa_telefone: string | null
          empresa_whatsapp: string | null
          id: string
          is_connected: boolean
          links_prioritarios: string[] | null
          name: string
          nicho: string | null
          palavras_secundarias: string[] | null
          pov_padrao: string | null
          seo_plugin: string | null
          social_google_maps: string | null
          social_instagram: string | null
          social_linkedin: string | null
          social_linktree: string | null
          social_tiktok: string | null
          social_twitter: string | null
          social_youtube: string | null
          tom_padrao: string | null
          updated_at: string
          user_id: string
          wordpress_app_password: string | null
          wordpress_url: string | null
          wordpress_username: string | null
        }
        Insert: {
          compliance_rules?: string | null
          created_at?: string
          cta_comunidade?: string | null
          cta_conclusao?: string | null
          cta_leads?: string | null
          description?: string | null
          domain: string
          empresa_endereco?: string | null
          empresa_nome?: string | null
          empresa_telefone?: string | null
          empresa_whatsapp?: string | null
          id?: string
          is_connected?: boolean
          links_prioritarios?: string[] | null
          name: string
          nicho?: string | null
          palavras_secundarias?: string[] | null
          pov_padrao?: string | null
          seo_plugin?: string | null
          social_google_maps?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_linktree?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          tom_padrao?: string | null
          updated_at?: string
          user_id: string
          wordpress_app_password?: string | null
          wordpress_url?: string | null
          wordpress_username?: string | null
        }
        Update: {
          compliance_rules?: string | null
          created_at?: string
          cta_comunidade?: string | null
          cta_conclusao?: string | null
          cta_leads?: string | null
          description?: string | null
          domain?: string
          empresa_endereco?: string | null
          empresa_nome?: string | null
          empresa_telefone?: string | null
          empresa_whatsapp?: string | null
          id?: string
          is_connected?: boolean
          links_prioritarios?: string[] | null
          name?: string
          nicho?: string | null
          palavras_secundarias?: string[] | null
          pov_padrao?: string | null
          seo_plugin?: string | null
          social_google_maps?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_linktree?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          tom_padrao?: string | null
          updated_at?: string
          user_id?: string
          wordpress_app_password?: string | null
          wordpress_url?: string | null
          wordpress_username?: string | null
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          agent_name: string | null
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          prompt: string
          target_function: string | null
          template_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          prompt: string
          target_function?: string | null
          template_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          prompt?: string
          target_function?: string | null
          template_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rss_schedules: {
        Row: {
          article_length: string | null
          articles_generated: number | null
          auto_publish: boolean | null
          created_at: string
          feed_name: string
          feed_url: string
          frequency: string | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          niche: string | null
          project_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          article_length?: string | null
          articles_generated?: number | null
          auto_publish?: boolean | null
          created_at?: string
          feed_name: string
          feed_url: string
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          niche?: string | null
          project_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          article_length?: string | null
          articles_generated?: number | null
          auto_publish?: boolean | null
          created_at?: string
          feed_name?: string
          feed_url?: string
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          niche?: string | null
          project_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rss_schedules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_agent_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          details: Json | null
          error_message: string | null
          id: string
          indexing_submitted: number | null
          links_applied: number | null
          links_suggested: number | null
          meta_issues_fixed: number | null
          meta_issues_found: number | null
          project_id: string | null
          run_type: string
          sitemap_updated: boolean | null
          started_at: string
          status: string
          summary: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          error_message?: string | null
          id?: string
          indexing_submitted?: number | null
          links_applied?: number | null
          links_suggested?: number | null
          meta_issues_fixed?: number | null
          meta_issues_found?: number | null
          project_id?: string | null
          run_type?: string
          sitemap_updated?: boolean | null
          started_at?: string
          status?: string
          summary?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          error_message?: string | null
          id?: string
          indexing_submitted?: number | null
          links_applied?: number | null
          links_suggested?: number | null
          meta_issues_fixed?: number | null
          meta_issues_found?: number | null
          project_id?: string | null
          run_type?: string
          sitemap_updated?: boolean | null
          started_at?: string
          status?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_agent_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      token_usage_logs: {
        Row: {
          article_id: string | null
          created_at: string
          estimated_cost_usd: number | null
          id: string
          input_tokens: number | null
          metadata: Json | null
          model: string
          operation: string
          output_tokens: number | null
          provider: string
          total_tokens: number | null
          user_id: string
        }
        Insert: {
          article_id?: string | null
          created_at?: string
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model: string
          operation: string
          output_tokens?: number | null
          provider: string
          total_tokens?: number | null
          user_id: string
        }
        Update: {
          article_id?: string | null
          created_at?: string
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string
          operation?: string
          output_tokens?: number | null
          provider?: string
          total_tokens?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_usage_logs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_clusters: {
        Row: {
          article_count: number | null
          average_seo_score: number | null
          cluster_strength: number | null
          created_at: string
          description: string | null
          id: string
          is_auto_generated: boolean | null
          name: string
          pillar_article_id: string | null
          primary_keywords: string[] | null
          project_id: string
          related_keywords: string[] | null
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          article_count?: number | null
          average_seo_score?: number | null
          cluster_strength?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_auto_generated?: boolean | null
          name: string
          pillar_article_id?: string | null
          primary_keywords?: string[] | null
          project_id: string
          related_keywords?: string[] | null
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          article_count?: number | null
          average_seo_score?: number | null
          cluster_strength?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_auto_generated?: boolean | null
          name?: string
          pillar_article_id?: string | null
          primary_keywords?: string[] | null
          project_id?: string
          related_keywords?: string[] | null
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_clusters_pillar_article_id_fkey"
            columns: ["pillar_article_id"]
            isOneToOne: false
            referencedRelation: "wordpress_article_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_clusters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          ai_provider: string | null
          anthropic_api_key: string | null
          byok_enabled: boolean | null
          content_model: string | null
          created_at: string
          default_ai_model: string | null
          default_language: string | null
          default_point_of_view: string | null
          default_tone: string | null
          email_notifications: boolean | null
          gemini_api_key: string | null
          id: string
          image_model: string | null
          openai_api_key: string | null
          serper_api_key: string | null
          timezone: string | null
          title_model: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_provider?: string | null
          anthropic_api_key?: string | null
          byok_enabled?: boolean | null
          content_model?: string | null
          created_at?: string
          default_ai_model?: string | null
          default_language?: string | null
          default_point_of_view?: string | null
          default_tone?: string | null
          email_notifications?: boolean | null
          gemini_api_key?: string | null
          id?: string
          image_model?: string | null
          openai_api_key?: string | null
          serper_api_key?: string | null
          timezone?: string | null
          title_model?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_provider?: string | null
          anthropic_api_key?: string | null
          byok_enabled?: boolean | null
          content_model?: string | null
          created_at?: string
          default_ai_model?: string | null
          default_language?: string | null
          default_point_of_view?: string | null
          default_tone?: string | null
          email_notifications?: boolean | null
          gemini_api_key?: string | null
          id?: string
          image_model?: string | null
          openai_api_key?: string | null
          serper_api_key?: string | null
          timezone?: string | null
          title_model?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wordpress_article_index: {
        Row: {
          analysis_version: number | null
          content_hash: string | null
          created_at: string
          external_links_count: number | null
          id: string
          internal_links_count: number | null
          last_analyzed_at: string | null
          last_wp_modified_at: string | null
          linkability_score: number | null
          primary_keyword: string | null
          project_id: string
          secondary_keywords: string[] | null
          semantic_summary: string | null
          seo_score: number | null
          sync_error: string | null
          sync_status: string | null
          topic_cluster: string | null
          updated_at: string
          user_id: string
          word_count: number | null
          wp_categories: string[] | null
          wp_post_id: number
          wp_post_slug: string | null
          wp_post_status: string | null
          wp_post_title: string
          wp_post_type: string | null
          wp_post_url: string
          wp_tags: string[] | null
        }
        Insert: {
          analysis_version?: number | null
          content_hash?: string | null
          created_at?: string
          external_links_count?: number | null
          id?: string
          internal_links_count?: number | null
          last_analyzed_at?: string | null
          last_wp_modified_at?: string | null
          linkability_score?: number | null
          primary_keyword?: string | null
          project_id: string
          secondary_keywords?: string[] | null
          semantic_summary?: string | null
          seo_score?: number | null
          sync_error?: string | null
          sync_status?: string | null
          topic_cluster?: string | null
          updated_at?: string
          user_id: string
          word_count?: number | null
          wp_categories?: string[] | null
          wp_post_id: number
          wp_post_slug?: string | null
          wp_post_status?: string | null
          wp_post_title: string
          wp_post_type?: string | null
          wp_post_url: string
          wp_tags?: string[] | null
        }
        Update: {
          analysis_version?: number | null
          content_hash?: string | null
          created_at?: string
          external_links_count?: number | null
          id?: string
          internal_links_count?: number | null
          last_analyzed_at?: string | null
          last_wp_modified_at?: string | null
          linkability_score?: number | null
          primary_keyword?: string | null
          project_id?: string
          secondary_keywords?: string[] | null
          semantic_summary?: string | null
          seo_score?: number | null
          sync_error?: string | null
          sync_status?: string | null
          topic_cluster?: string | null
          updated_at?: string
          user_id?: string
          word_count?: number | null
          wp_categories?: string[] | null
          wp_post_id?: number
          wp_post_slug?: string | null
          wp_post_status?: string | null
          wp_post_title?: string
          wp_post_type?: string | null
          wp_post_url?: string
          wp_tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "wordpress_article_index_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      wordpress_stats: {
        Row: {
          approved_comments: number | null
          articles_needing_attention: number | null
          articles_without_links: number | null
          auto_corrections_applied: number | null
          broken_links: number | null
          created_at: string
          draft_articles: number | null
          id: string
          last_sync_at: string | null
          missing_featured_images: number | null
          pending_articles: number | null
          pending_comments: number | null
          project_id: string
          published_articles: number | null
          publishing_trend: Json | null
          raw_data: Json | null
          seo_issues: number | null
          sync_errors: number | null
          synced_articles: number | null
          total_articles: number | null
          total_comments: number | null
          total_internal_links: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_comments?: number | null
          articles_needing_attention?: number | null
          articles_without_links?: number | null
          auto_corrections_applied?: number | null
          broken_links?: number | null
          created_at?: string
          draft_articles?: number | null
          id?: string
          last_sync_at?: string | null
          missing_featured_images?: number | null
          pending_articles?: number | null
          pending_comments?: number | null
          project_id: string
          published_articles?: number | null
          publishing_trend?: Json | null
          raw_data?: Json | null
          seo_issues?: number | null
          sync_errors?: number | null
          synced_articles?: number | null
          total_articles?: number | null
          total_comments?: number | null
          total_internal_links?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_comments?: number | null
          articles_needing_attention?: number | null
          articles_without_links?: number | null
          auto_corrections_applied?: number | null
          broken_links?: number | null
          created_at?: string
          draft_articles?: number | null
          id?: string
          last_sync_at?: string | null
          missing_featured_images?: number | null
          pending_articles?: number | null
          pending_comments?: number | null
          project_id?: string
          published_articles?: number | null
          publishing_trend?: Json | null
          raw_data?: Json | null
          seo_issues?: number | null
          sync_errors?: number | null
          synced_articles?: number | null
          total_articles?: number | null
          total_comments?: number | null
          total_internal_links?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wordpress_stats_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      emotional_trigger_stats: {
        Row: {
          avg_confidence: number | null
          caricature_count: number | null
          emotional_trigger: string | null
          first_article: string | null
          image_source: string | null
          last_article: string | null
          reused_count: number | null
          total_articles: number | null
          user_id: string | null
        }
        Relationships: []
      }
      token_usage_summary: {
        Row: {
          date: string | null
          operation: string | null
          provider: string | null
          request_count: number | null
          total_cost_usd: number | null
          total_input_tokens: number | null
          total_output_tokens: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Relationships: []
      }
      user_settings_safe: {
        Row: {
          ai_provider: string | null
          byok_enabled: boolean | null
          content_model: string | null
          created_at: string | null
          default_ai_model: string | null
          default_language: string | null
          default_point_of_view: string | null
          default_tone: string | null
          email_notifications: boolean | null
          has_anthropic_key: boolean | null
          has_gemini_key: boolean | null
          has_openai_key: boolean | null
          has_serper_key: boolean | null
          id: string | null
          image_model: string | null
          timezone: string | null
          title_model: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ai_provider?: string | null
          byok_enabled?: boolean | null
          content_model?: string | null
          created_at?: string | null
          default_ai_model?: string | null
          default_language?: string | null
          default_point_of_view?: string | null
          default_tone?: string | null
          email_notifications?: boolean | null
          has_anthropic_key?: never
          has_gemini_key?: never
          has_openai_key?: never
          has_serper_key?: never
          id?: string | null
          image_model?: string | null
          timezone?: string | null
          title_model?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ai_provider?: string | null
          byok_enabled?: boolean | null
          content_model?: string | null
          created_at?: string | null
          default_ai_model?: string | null
          default_language?: string | null
          default_point_of_view?: string | null
          default_tone?: string | null
          email_notifications?: boolean | null
          has_anthropic_key?: never
          has_gemini_key?: never
          has_openai_key?: never
          has_serper_key?: never
          id?: string | null
          image_model?: string | null
          timezone?: string | null
          title_model?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      article_status: "draft" | "generating" | "ready" | "published" | "error"
      article_type: "blog" | "sales" | "review" | "comparison"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      article_status: ["draft", "generating", "ready", "published", "error"],
      article_type: ["blog", "sales", "review", "comparison"],
    },
  },
} as const
