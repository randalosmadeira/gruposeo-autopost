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
      articles: {
        Row: {
          config: Json | null
          content: string | null
          created_at: string
          error_message: string | null
          excerpt: string | null
          featured_image_url: string | null
          id: string
          keyword: string
          project_id: string | null
          published_at: string | null
          published_url: string | null
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
          config?: Json | null
          content?: string | null
          created_at?: string
          error_message?: string | null
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          keyword: string
          project_id?: string | null
          published_at?: string | null
          published_url?: string | null
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
          config?: Json | null
          content?: string | null
          created_at?: string
          error_message?: string | null
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          keyword?: string
          project_id?: string | null
          published_at?: string | null
          published_url?: string | null
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
          created_at: string
          description: string | null
          domain: string
          id: string
          is_connected: boolean
          name: string
          seo_plugin: string | null
          updated_at: string
          user_id: string
          wordpress_app_password: string | null
          wordpress_url: string | null
          wordpress_username: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          domain: string
          id?: string
          is_connected?: boolean
          name: string
          seo_plugin?: string | null
          updated_at?: string
          user_id: string
          wordpress_app_password?: string | null
          wordpress_url?: string | null
          wordpress_username?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          domain?: string
          id?: string
          is_connected?: boolean
          name?: string
          seo_plugin?: string | null
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
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          prompt: string
          template_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          prompt: string
          template_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          prompt?: string
          template_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
