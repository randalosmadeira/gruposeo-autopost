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
      news_agents: {
        Row: {
          articles_generated: number | null
          auto_publish: boolean | null
          cite_sources_footer: boolean | null
          cite_sources_inline: boolean | null
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          keywords: string[] | null
          language: string | null
          last_run_at: string | null
          name: string
          post_type: string | null
          project_id: string | null
          search_internal_links: boolean | null
          topics: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          articles_generated?: number | null
          auto_publish?: boolean | null
          cite_sources_footer?: boolean | null
          cite_sources_inline?: boolean | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          language?: string | null
          last_run_at?: string | null
          name: string
          post_type?: string | null
          project_id?: string | null
          search_internal_links?: boolean | null
          topics?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          articles_generated?: number | null
          auto_publish?: boolean | null
          cite_sources_footer?: boolean | null
          cite_sources_inline?: boolean | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          language?: string | null
          last_run_at?: string | null
          name?: string
          post_type?: string | null
          project_id?: string | null
          search_internal_links?: boolean | null
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
          updated_at?: string
          user_id?: string
          wordpress_app_password?: string | null
          wordpress_url?: string | null
          wordpress_username?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          anthropic_api_key: string | null
          created_at: string
          default_ai_model: string | null
          default_language: string | null
          default_point_of_view: string | null
          default_tone: string | null
          email_notifications: boolean | null
          id: string
          openai_api_key: string | null
          serper_api_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anthropic_api_key?: string | null
          created_at?: string
          default_ai_model?: string | null
          default_language?: string | null
          default_point_of_view?: string | null
          default_tone?: string | null
          email_notifications?: boolean | null
          id?: string
          openai_api_key?: string | null
          serper_api_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anthropic_api_key?: string | null
          created_at?: string
          default_ai_model?: string | null
          default_language?: string | null
          default_point_of_view?: string | null
          default_tone?: string | null
          email_notifications?: boolean | null
          id?: string
          openai_api_key?: string | null
          serper_api_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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
