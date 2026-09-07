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
    PostgrestVersion: "14.5"
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
      analysis_uploads: {
        Row: {
          analysis_result: Json | null
          analyzed_at: string | null
          cleaned_at: string | null
          corrections_applied: Json | null
          created_at: string
          error_message: string | null
          file_format: string
          file_name: string
          file_path: string
          file_size_bytes: number
          file_type: string
          id: string
          project_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          analysis_result?: Json | null
          analyzed_at?: string | null
          cleaned_at?: string | null
          corrections_applied?: Json | null
          created_at?: string
          error_message?: string | null
          file_format: string
          file_name: string
          file_path: string
          file_size_bytes?: number
          file_type: string
          id?: string
          project_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          analysis_result?: Json | null
          analyzed_at?: string | null
          cleaned_at?: string | null
          corrections_applied?: Json | null
          created_at?: string
          error_message?: string | null
          file_format?: string
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          file_type?: string
          id?: string
          project_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_uploads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          app_name: string
          app_tagline: string
          id: number
          metadata: Json
          support_email: string
          updated_at: string
        }
        Insert: {
          app_name?: string
          app_tagline?: string
          id?: number
          metadata?: Json
          support_email?: string
          updated_at?: string
        }
        Update: {
          app_name?: string
          app_tagline?: string
          id?: number
          metadata?: Json
          support_email?: string
          updated_at?: string
        }
        Relationships: []
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
          indexed_confirmed_at: string | null
          indexing_provider: string | null
          indexing_status: string
          indexing_submitted_at: string | null
          keyword: string
          last_llm_audit_at: string | null
          llm_visibility_score: number | null
          metricas_verniz: Json | null
          nicho_detectado: string | null
          organization_id: string | null
          originality_score: number
          project_id: string | null
          published_at: string | null
          published_url: string | null
          rss_feed_url: string | null
          rss_feed_validated_at: string | null
          rss_feed_validation: Json
          scheduled_at: string | null
          secondary_keywords: string[] | null
          semantic_authority_score: number | null
          seo_score: number | null
          slug: string | null
          source_canonical_url: string | null
          status: Database["public"]["Enums"]["article_status"]
          title: string | null
          traffic_wave_status: string
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
          indexed_confirmed_at?: string | null
          indexing_provider?: string | null
          indexing_status?: string
          indexing_submitted_at?: string | null
          keyword: string
          last_llm_audit_at?: string | null
          llm_visibility_score?: number | null
          metricas_verniz?: Json | null
          nicho_detectado?: string | null
          organization_id?: string | null
          originality_score?: number
          project_id?: string | null
          published_at?: string | null
          published_url?: string | null
          rss_feed_url?: string | null
          rss_feed_validated_at?: string | null
          rss_feed_validation?: Json
          scheduled_at?: string | null
          secondary_keywords?: string[] | null
          semantic_authority_score?: number | null
          seo_score?: number | null
          slug?: string | null
          source_canonical_url?: string | null
          status?: Database["public"]["Enums"]["article_status"]
          title?: string | null
          traffic_wave_status?: string
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
          indexed_confirmed_at?: string | null
          indexing_provider?: string | null
          indexing_status?: string
          indexing_submitted_at?: string | null
          keyword?: string
          last_llm_audit_at?: string | null
          llm_visibility_score?: number | null
          metricas_verniz?: Json | null
          nicho_detectado?: string | null
          organization_id?: string | null
          originality_score?: number
          project_id?: string | null
          published_at?: string | null
          published_url?: string | null
          rss_feed_url?: string | null
          rss_feed_validated_at?: string | null
          rss_feed_validation?: Json
          scheduled_at?: string | null
          secondary_keywords?: string[] | null
          semantic_authority_score?: number | null
          seo_score?: number | null
          slug?: string | null
          source_canonical_url?: string | null
          status?: Database["public"]["Enums"]["article_status"]
          title?: string | null
          traffic_wave_status?: string
          type?: Database["public"]["Enums"]["article_type"]
          updated_at?: string
          user_id?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_ingress_keys: {
        Row: {
          created_at: string
          enabled: boolean
          name: string
          secret_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          name: string
          secret_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          name?: string
          secret_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      candidate_reference_whitelist: {
        Row: {
          allowed_modules: string[]
          created_at: string
          drive_file_id: string
          drive_folder_id: string
          is_active: boolean
          label: string
          updated_at: string
        }
        Insert: {
          allowed_modules?: string[]
          created_at?: string
          drive_file_id: string
          drive_folder_id: string
          is_active?: boolean
          label: string
          updated_at?: string
        }
        Update: {
          allowed_modules?: string[]
          created_at?: string
          drive_file_id?: string
          drive_folder_id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      commercial_plan_versions: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          plan_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          plan_id: string
          snapshot: Json
          version: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          plan_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "commercial_plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commercial_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_plans: {
        Row: {
          active: boolean
          article_limit_monthly: number | null
          billing_cycle: string
          brand_asset_limit: number
          byok_allowed: boolean
          copilot_allowed: boolean
          created_at: string
          currency: string
          features: Json
          id: string
          name: string
          overage_grace_articles: number
          overage_policy: string
          overage_unit_cents: number | null
          price_cents: number | null
          project_limit: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          article_limit_monthly?: number | null
          billing_cycle?: string
          brand_asset_limit?: number
          byok_allowed?: boolean
          copilot_allowed?: boolean
          created_at?: string
          currency?: string
          features?: Json
          id: string
          name: string
          overage_grace_articles?: number
          overage_policy?: string
          overage_unit_cents?: number | null
          price_cents?: number | null
          project_limit?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          article_limit_monthly?: number | null
          billing_cycle?: string
          brand_asset_limit?: number
          byok_allowed?: boolean
          copilot_allowed?: boolean
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          name?: string
          overage_grace_articles?: number
          overage_policy?: string
          overage_unit_cents?: number | null
          price_cents?: number | null
          project_limit?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      copilot_tool_registry: {
        Row: {
          admin_only: boolean
          created_at: string
          enabled: boolean
          label: string
          requires_confirmation: boolean
          risk_level: string
          tool_key: string
          updated_at: string
        }
        Insert: {
          admin_only?: boolean
          created_at?: string
          enabled?: boolean
          label: string
          requires_confirmation?: boolean
          risk_level: string
          tool_key: string
          updated_at?: string
        }
        Update: {
          admin_only?: boolean
          created_at?: string
          enabled?: boolean
          label?: string
          requires_confirmation?: boolean
          risk_level?: string
          tool_key?: string
          updated_at?: string
        }
        Relationships: []
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
      editorial_plan_assets: {
        Row: {
          byte_size: number
          created_at: string
          created_by: string
          id: string
          mime_type: string
          organization_id: string
          original_name: string
          plan_id: string
          project_id: string
          status: string
          storage_path: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          created_by: string
          id?: string
          mime_type: string
          organization_id: string
          original_name: string
          plan_id: string
          project_id: string
          status?: string
          storage_path: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          created_by?: string
          id?: string
          mime_type?: string
          organization_id?: string
          original_name?: string
          plan_id?: string
          project_id?: string
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "editorial_plan_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_plan_assets_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "editorial_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_plan_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_plan_audit_events: {
        Row: {
          actor_user_id: string | null
          details: Json
          event_type: string
          from_status: string | null
          id: number
          item_id: string | null
          occurred_at: string
          organization_id: string
          plan_id: string
          project_id: string
          to_status: string | null
        }
        Insert: {
          actor_user_id?: string | null
          details?: Json
          event_type: string
          from_status?: string | null
          id?: never
          item_id?: string | null
          occurred_at?: string
          organization_id: string
          plan_id: string
          project_id: string
          to_status?: string | null
        }
        Update: {
          actor_user_id?: string | null
          details?: Json
          event_type?: string
          from_status?: string | null
          id?: never
          item_id?: string | null
          occurred_at?: string
          organization_id?: string
          plan_id?: string
          project_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "editorial_plan_audit_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "editorial_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_plan_audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_plan_audit_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "editorial_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_plan_audit_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_plan_items: {
        Row: {
          category: string | null
          created_at: string
          current_step: string
          difficulty: number | null
          duplicate: boolean
          duplicate_reason: string | null
          id: string
          intent: string | null
          keyword: string
          keyword_sha256: string
          last_error_code: string | null
          last_error_message: string | null
          next_attempt_at: string | null
          normalized_keyword: string
          organization_id: string
          plan_id: string
          priority: number | null
          project_id: string
          retry_count: number
          sequence_no: number
          status: string
          updated_at: string
          volume: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          current_step?: string
          difficulty?: number | null
          duplicate?: boolean
          duplicate_reason?: string | null
          id?: string
          intent?: string | null
          keyword: string
          keyword_sha256: string
          last_error_code?: string | null
          last_error_message?: string | null
          next_attempt_at?: string | null
          normalized_keyword: string
          organization_id: string
          plan_id: string
          priority?: number | null
          project_id: string
          retry_count?: number
          sequence_no: number
          status?: string
          updated_at?: string
          volume?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          current_step?: string
          difficulty?: number | null
          duplicate?: boolean
          duplicate_reason?: string | null
          id?: string
          intent?: string | null
          keyword?: string
          keyword_sha256?: string
          last_error_code?: string | null
          last_error_message?: string | null
          next_attempt_at?: string | null
          normalized_keyword?: string
          organization_id?: string
          plan_id?: string
          priority?: number | null
          project_id?: string
          retry_count?: number
          sequence_no?: number
          status?: string
          updated_at?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "editorial_plan_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "editorial_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_plan_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_plans: {
        Row: {
          audience: string
          category: string
          city: string
          created_at: string
          created_by: string
          estimated_credits: number
          estimated_input_tokens: number
          estimated_output_tokens: number
          frequency: string
          id: string
          idempotency_key: string
          metadata: Json
          name: string
          organization_id: string
          portal: string
          project_id: string
          publication_enabled: boolean
          requested_quantity: number
          source_file_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audience: string
          category: string
          city: string
          created_at?: string
          created_by: string
          estimated_credits?: number
          estimated_input_tokens?: number
          estimated_output_tokens?: number
          frequency: string
          id?: string
          idempotency_key: string
          metadata?: Json
          name: string
          organization_id: string
          portal: string
          project_id: string
          publication_enabled?: boolean
          requested_quantity: number
          source_file_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audience?: string
          category?: string
          city?: string
          created_at?: string
          created_by?: string
          estimated_credits?: number
          estimated_input_tokens?: number
          estimated_output_tokens?: number
          frequency?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          name?: string
          organization_id?: string
          portal?: string
          project_id?: string
          publication_enabled?: boolean
          requested_quantity?: number
          source_file_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "editorial_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_rss_sources: {
        Row: {
          created_at: string
          created_by: string
          id: string
          label: string
          organization_id: string
          plan_id: string | null
          project_id: string
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          label: string
          organization_id: string
          plan_id?: string | null
          project_id: string
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          label?: string
          organization_id?: string
          plan_id?: string | null
          project_id?: string
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "editorial_rss_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_rss_sources_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "editorial_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_rss_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      electoral_campaign_optins: {
        Row: {
          campaign_preset_id: string
          city: string | null
          consent_at: string
          consent_contact: boolean
          contact_hash: string
          created_at: string
          email: string | null
          email_updates: boolean
          fingerprint_hash: string | null
          full_name: string
          id: string
          privacy_notice_version: string
          purpose: string
          source_portal: string
          state: string | null
          status: string
          updated_at: string
          volunteer: boolean
          whatsapp: string | null
          whatsapp_updates: boolean
          withdrawn_at: string | null
        }
        Insert: {
          campaign_preset_id?: string
          city?: string | null
          consent_at?: string
          consent_contact?: boolean
          contact_hash: string
          created_at?: string
          email?: string | null
          email_updates?: boolean
          fingerprint_hash?: string | null
          full_name: string
          id?: string
          privacy_notice_version?: string
          purpose?: string
          source_portal: string
          state?: string | null
          status?: string
          updated_at?: string
          volunteer?: boolean
          whatsapp?: string | null
          whatsapp_updates?: boolean
          withdrawn_at?: string | null
        }
        Update: {
          campaign_preset_id?: string
          city?: string | null
          consent_at?: string
          consent_contact?: boolean
          contact_hash?: string
          created_at?: string
          email?: string | null
          email_updates?: boolean
          fingerprint_hash?: string | null
          full_name?: string
          id?: string
          privacy_notice_version?: string
          purpose?: string
          source_portal?: string
          state?: string | null
          status?: string
          updated_at?: string
          volunteer?: boolean
          whatsapp?: string | null
          whatsapp_updates?: boolean
          withdrawn_at?: string | null
        }
        Relationships: []
      }
      electoral_content_sources: {
        Row: {
          active: boolean
          authority_level: string
          campaign_preset_id: string
          created_at: string
          factual_use_status: string
          id: string
          metadata: Json
          raw_text: string
          slug: string
          source_filename: string | null
          source_sha256: string
          source_type: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          authority_level?: string
          campaign_preset_id: string
          created_at?: string
          factual_use_status?: string
          id?: string
          metadata?: Json
          raw_text?: string
          slug: string
          source_filename?: string | null
          source_sha256: string
          source_type: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          authority_level?: string
          campaign_preset_id?: string
          created_at?: string
          factual_use_status?: string
          id?: string
          metadata?: Json
          raw_text?: string
          slug?: string
          source_filename?: string | null
          source_sha256?: string
          source_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      electoral_content_units: {
        Row: {
          active: boolean
          body: string
          campaign_preset_id: string
          created_at: string
          id: string
          metadata: Json
          priority: number
          risk_flags: string[]
          source_id: string
          source_locator: Json
          tags: string[]
          title: string
          topic: string
          unit_key: string
          unit_type: string
          updated_at: string
          usage_scope: string
          verification_status: string
        }
        Insert: {
          active?: boolean
          body: string
          campaign_preset_id: string
          created_at?: string
          id?: string
          metadata?: Json
          priority?: number
          risk_flags?: string[]
          source_id: string
          source_locator?: Json
          tags?: string[]
          title: string
          topic?: string
          unit_key: string
          unit_type: string
          updated_at?: string
          usage_scope?: string
          verification_status?: string
        }
        Update: {
          active?: boolean
          body?: string
          campaign_preset_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          priority?: number
          risk_flags?: string[]
          source_id?: string
          source_locator?: Json
          tags?: string[]
          title?: string
          topic?: string
          unit_key?: string
          unit_type?: string
          updated_at?: string
          usage_scope?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "electoral_content_units_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "electoral_content_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      electoral_image_jobs: {
        Row: {
          campaign_preset_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          fidelity_preference: number
          generation_mode: string
          id: string
          output_asset_ids: string[]
          overlay_config: Json
          project_id: string | null
          prompt_context: string | null
          provider: string
          provider_job_id: string | null
          reference_asset_ids: string[]
          requested_formats: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_preset_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          fidelity_preference?: number
          generation_mode?: string
          id?: string
          output_asset_ids?: string[]
          overlay_config?: Json
          project_id?: string | null
          prompt_context?: string | null
          provider?: string
          provider_job_id?: string | null
          reference_asset_ids?: string[]
          requested_formats?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_preset_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          fidelity_preference?: number
          generation_mode?: string
          id?: string
          output_asset_ids?: string[]
          overlay_config?: Json
          project_id?: string | null
          prompt_context?: string | null
          provider?: string
          provider_job_id?: string | null
          reference_asset_ids?: string[]
          requested_formats?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "electoral_image_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      electoral_portal_resources: {
        Row: {
          active: boolean
          campaign_preset_id: string
          category: string
          created_at: string
          created_by: string | null
          editorial_hook: string
          id: string
          label: string
          priority: number
          project_id: string | null
          tags: string[]
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          campaign_preset_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          editorial_hook?: string
          id?: string
          label: string
          priority?: number
          project_id?: string | null
          tags?: string[]
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          campaign_preset_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          editorial_hook?: string
          id?: string
          label?: string
          priority?: number
          project_id?: string | null
          tags?: string[]
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "electoral_portal_resources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      electoral_portal_settings: {
        Row: {
          aggregate_analytics_enabled: boolean
          allow_individual_voter_profiles: boolean
          allow_political_preference_inference: boolean
          analytics_disable_after: string | null
          campaign_preset_id: string
          contextual_linking_enabled: boolean
          ga4_measurement_id: string | null
          geo_reporting_level: string
          gtm_server_container_url: string | null
          gtm_web_container_id: string | null
          max_links_per_post: number
          min_links_per_post: number
          optin_dismiss_hours: number
          optin_exit_intent_enabled: boolean
          optin_instagram_enabled: boolean
          optin_instagram_label: string
          optin_instagram_url: string | null
          optin_popup_enabled: boolean
          optin_privacy_url: string | null
          optin_scroll_trigger_percent: number
          optin_success_suppress_days: number
          primary_portals: string[]
          updated_at: string
        }
        Insert: {
          aggregate_analytics_enabled?: boolean
          allow_individual_voter_profiles?: boolean
          allow_political_preference_inference?: boolean
          analytics_disable_after?: string | null
          campaign_preset_id: string
          contextual_linking_enabled?: boolean
          ga4_measurement_id?: string | null
          geo_reporting_level?: string
          gtm_server_container_url?: string | null
          gtm_web_container_id?: string | null
          max_links_per_post?: number
          min_links_per_post?: number
          optin_dismiss_hours?: number
          optin_exit_intent_enabled?: boolean
          optin_instagram_enabled?: boolean
          optin_instagram_label?: string
          optin_instagram_url?: string | null
          optin_popup_enabled?: boolean
          optin_privacy_url?: string | null
          optin_scroll_trigger_percent?: number
          optin_success_suppress_days?: number
          primary_portals?: string[]
          updated_at?: string
        }
        Update: {
          aggregate_analytics_enabled?: boolean
          allow_individual_voter_profiles?: boolean
          allow_political_preference_inference?: boolean
          analytics_disable_after?: string | null
          campaign_preset_id?: string
          contextual_linking_enabled?: boolean
          ga4_measurement_id?: string | null
          geo_reporting_level?: string
          gtm_server_container_url?: string | null
          gtm_web_container_id?: string | null
          max_links_per_post?: number
          min_links_per_post?: number
          optin_dismiss_hours?: number
          optin_exit_intent_enabled?: boolean
          optin_instagram_enabled?: boolean
          optin_instagram_label?: string
          optin_instagram_url?: string | null
          optin_popup_enabled?: boolean
          optin_privacy_url?: string | null
          optin_scroll_trigger_percent?: number
          optin_success_suppress_days?: number
          primary_portals?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      electoral_visual_assets: {
        Row: {
          alt_text: string | null
          approved_at: string | null
          asset_kind: string
          campaign_preset_id: string
          created_at: string
          file_size_bytes: number | null
          height: number | null
          id: string
          is_default: boolean
          metadata: Json
          mime_type: string | null
          overlay_config: Json
          project_id: string | null
          source_asset_id: string | null
          status: string
          storage_path: string
          updated_at: string
          user_id: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          approved_at?: string | null
          asset_kind?: string
          campaign_preset_id?: string
          created_at?: string
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_default?: boolean
          metadata?: Json
          mime_type?: string | null
          overlay_config?: Json
          project_id?: string | null
          source_asset_id?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          user_id: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          approved_at?: string | null
          asset_kind?: string
          campaign_preset_id?: string
          created_at?: string
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_default?: boolean
          metadata?: Json
          mime_type?: string | null
          overlay_config?: Json
          project_id?: string | null
          source_asset_id?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "electoral_visual_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electoral_visual_assets_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "electoral_visual_assets"
            referencedColumns: ["id"]
          },
        ]
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
      gbp_audits: {
        Row: {
          ai_insights: Json | null
          ai_provider: string | null
          business_name: string
          category: string | null
          city: string
          country: string | null
          created_at: string
          error_message: string | null
          id: string
          language: string | null
          local_pack: Json | null
          own_place: Json | null
          project_id: string | null
          search_query: string | null
          serp_data: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_insights?: Json | null
          ai_provider?: string | null
          business_name: string
          category?: string | null
          city: string
          country?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          language?: string | null
          local_pack?: Json | null
          own_place?: Json | null
          project_id?: string | null
          search_query?: string | null
          serp_data?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_insights?: Json | null
          ai_provider?: string | null
          business_name?: string
          category?: string | null
          city?: string
          country?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          language?: string | null
          local_pack?: Json | null
          own_place?: Json | null
          project_id?: string | null
          search_query?: string | null
          serp_data?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gbp_audits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      gbp_competitor_snapshots: {
        Row: {
          competitor_id: string
          created_at: string
          id: string
          photos_count: number | null
          posts_count: number | null
          rating: number | null
          raw: Json | null
          reviews_count: number | null
          snapshot_date: string
          user_id: string
        }
        Insert: {
          competitor_id: string
          created_at?: string
          id?: string
          photos_count?: number | null
          posts_count?: number | null
          rating?: number | null
          raw?: Json | null
          reviews_count?: number | null
          snapshot_date?: string
          user_id: string
        }
        Update: {
          competitor_id?: string
          created_at?: string
          id?: string
          photos_count?: number | null
          posts_count?: number | null
          rating?: number | null
          raw?: Json | null
          reviews_count?: number | null
          snapshot_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gbp_competitor_snapshots_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "gbp_competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      gbp_competitors: {
        Row: {
          address: string | null
          audit_id: string
          category: string | null
          created_at: string
          hours: Json | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          place_id: string | null
          price_level: string | null
          rating: number | null
          raw: Json | null
          reviews_count: number | null
          tracked: boolean
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          audit_id: string
          category?: string | null
          created_at?: string
          hours?: Json | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          place_id?: string | null
          price_level?: string | null
          rating?: number | null
          raw?: Json | null
          reviews_count?: number | null
          tracked?: boolean
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          audit_id?: string
          category?: string | null
          created_at?: string
          hours?: Json | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          place_id?: string | null
          price_level?: string | null
          rating?: number | null
          raw?: Json | null
          reviews_count?: number | null
          tracked?: boolean
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gbp_competitors_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "gbp_audits"
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
      hyperlocal_generation_history: {
        Row: {
          article_id: string | null
          brand: string | null
          category: string | null
          created_at: string
          fewshot_count: number
          fewshot_examples: Json
          first_sentence_ok: boolean | null
          first_sentence_words: number | null
          frontload_passes: boolean | null
          frontload_word_count: number | null
          has_jurisdiction: boolean | null
          has_legal_base: boolean | null
          id: string
          keyword: string | null
          poi_id: string | null
          regen_attempts: number
          source: string
          template_kind: string | null
          title: string
          updated_at: string
          user_id: string
          validation_history: Json
        }
        Insert: {
          article_id?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          fewshot_count?: number
          fewshot_examples?: Json
          first_sentence_ok?: boolean | null
          first_sentence_words?: number | null
          frontload_passes?: boolean | null
          frontload_word_count?: number | null
          has_jurisdiction?: boolean | null
          has_legal_base?: boolean | null
          id?: string
          keyword?: string | null
          poi_id?: string | null
          regen_attempts?: number
          source?: string
          template_kind?: string | null
          title: string
          updated_at?: string
          user_id: string
          validation_history?: Json
        }
        Update: {
          article_id?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          fewshot_count?: number
          fewshot_examples?: Json
          first_sentence_ok?: boolean | null
          first_sentence_words?: number | null
          frontload_passes?: boolean | null
          frontload_word_count?: number | null
          has_jurisdiction?: boolean | null
          has_legal_base?: boolean | null
          id?: string
          keyword?: string | null
          poi_id?: string | null
          regen_attempts?: number
          source?: string
          template_kind?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          validation_history?: Json
        }
        Relationships: []
      }
      hyperlocal_template_overrides: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          template_kind: string
          updated_at: string
          updated_by_ai: boolean
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          template_kind: string
          updated_at?: string
          updated_by_ai?: boolean
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          template_kind?: string
          updated_at?: string
          updated_by_ai?: boolean
          user_id?: string
        }
        Relationships: []
      }
      hyperlocal_title_template_versions: {
        Row: {
          category: string
          change_reason: string | null
          changed_by: string | null
          city_hint: string | null
          created_at: string
          id: string
          is_urgency: boolean
          neighborhood_hint: string | null
          poi_type: string | null
          source: string | null
          status: string
          template_id: string
          title: string
          user_id: string
          version_number: number
          ymyl_subarea: string | null
        }
        Insert: {
          category: string
          change_reason?: string | null
          changed_by?: string | null
          city_hint?: string | null
          created_at?: string
          id?: string
          is_urgency?: boolean
          neighborhood_hint?: string | null
          poi_type?: string | null
          source?: string | null
          status: string
          template_id: string
          title: string
          user_id: string
          version_number: number
          ymyl_subarea?: string | null
        }
        Update: {
          category?: string
          change_reason?: string | null
          changed_by?: string | null
          city_hint?: string | null
          created_at?: string
          id?: string
          is_urgency?: boolean
          neighborhood_hint?: string | null
          poi_type?: string | null
          source?: string | null
          status?: string
          template_id?: string
          title?: string
          user_id?: string
          version_number?: number
          ymyl_subarea?: string | null
        }
        Relationships: []
      }
      hyperlocal_title_templates: {
        Row: {
          category: string
          city_hint: string | null
          created_at: string
          id: string
          is_urgency: boolean
          neighborhood_hint: string | null
          poi_type: string | null
          source: string
          status: string
          title: string
          updated_at: string
          user_id: string | null
          ymyl_subarea: string | null
        }
        Insert: {
          category: string
          city_hint?: string | null
          created_at?: string
          id?: string
          is_urgency?: boolean
          neighborhood_hint?: string | null
          poi_type?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
          ymyl_subarea?: string | null
        }
        Update: {
          category?: string
          city_hint?: string | null
          created_at?: string
          id?: string
          is_urgency?: boolean
          neighborhood_hint?: string | null
          poi_type?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
          ymyl_subarea?: string | null
        }
        Relationships: []
      }
      indexnow_config: {
        Row: {
          active: boolean | null
          api_key: string
          created_at: string | null
          host: string
          id: string
          key_location: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          api_key: string
          created_at?: string | null
          host: string
          id?: string
          key_location: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          api_key?: string
          created_at?: string | null
          host?: string
          id?: string
          key_location?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      indexnow_logs: {
        Row: {
          created_at: string | null
          id: string
          response_body: string | null
          status_code: number | null
          url: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          response_body?: string | null
          status_code?: number | null
          url: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          response_body?: string | null
          status_code?: number | null
          url?: string
          user_id?: string | null
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
      module_image_assets: {
        Row: {
          alt_text: string
          background_mode: string
          background_prompt: string | null
          bucket_name: string | null
          caption: string
          created_at: string
          external_url: string | null
          id: string
          is_active: boolean
          label: string
          last_used_at: string | null
          module_key: string
          original_source_url: string | null
          processing_metadata: Json
          project_id: string | null
          semantic_filename: string
          semantic_tags: string[]
          slot: number
          source_type: string
          storage_path: string | null
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          alt_text?: string
          background_mode?: string
          background_prompt?: string | null
          bucket_name?: string | null
          caption?: string
          created_at?: string
          external_url?: string | null
          id?: string
          is_active?: boolean
          label: string
          last_used_at?: string | null
          module_key: string
          original_source_url?: string | null
          processing_metadata?: Json
          project_id?: string | null
          semantic_filename: string
          semantic_tags?: string[]
          slot: number
          source_type: string
          storage_path?: string | null
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          alt_text?: string
          background_mode?: string
          background_prompt?: string | null
          bucket_name?: string | null
          caption?: string
          created_at?: string
          external_url?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_used_at?: string | null
          module_key?: string
          original_source_url?: string | null
          processing_metadata?: Json
          project_id?: string | null
          semantic_filename?: string
          semantic_tags?: string[]
          slot?: number
          source_type?: string
          storage_path?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_image_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      module_image_policies: {
        Row: {
          allow_ai_generation: boolean
          allow_background_editing: boolean
          auto_select: boolean
          body_width: number
          created_at: string
          hero_height: number
          hero_width: number
          id: string
          max_body_kb: number
          max_hero_kb: number
          module_key: string
          preferred_format: string
          project_id: string | null
          required_asset_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_ai_generation?: boolean
          allow_background_editing?: boolean
          auto_select?: boolean
          body_width?: number
          created_at?: string
          hero_height?: number
          hero_width?: number
          id?: string
          max_body_kb?: number
          max_hero_kb?: number
          module_key: string
          preferred_format?: string
          project_id?: string | null
          required_asset_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_ai_generation?: boolean
          allow_background_editing?: boolean
          auto_select?: boolean
          body_width?: number
          created_at?: string
          hero_height?: number
          hero_width?: number
          id?: string
          max_body_kb?: number
          max_hero_kb?: number
          module_key?: string
          preferred_format?: string
          project_id?: string | null
          required_asset_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_image_policies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      module_image_selection_logs: {
        Row: {
          article_id: string | null
          asset_id: string
          created_at: string
          id: string
          module_key: string
          project_id: string | null
          selection_reason: string
          selector_model: string | null
          selector_provider: string | null
          user_id: string
        }
        Insert: {
          article_id?: string | null
          asset_id: string
          created_at?: string
          id?: string
          module_key: string
          project_id?: string | null
          selection_reason?: string
          selector_model?: string | null
          selector_provider?: string | null
          user_id: string
        }
        Update: {
          article_id?: string | null
          asset_id?: string
          created_at?: string
          id?: string
          module_key?: string
          project_id?: string | null
          selection_reason?: string
          selector_model?: string | null
          selector_provider?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_image_selection_logs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_image_selection_logs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "module_image_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_image_selection_logs_project_id_fkey"
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
          automation_mode: string
          created_at: string
          custom_slug_prefix: string | null
          default_angle: string | null
          excluded_keywords: string[] | null
          id: string
          is_active: boolean | null
          last_ai_confidence: number | null
          last_ai_profile: Json
          last_article_at: string | null
          last_articles_found: number
          last_check_at: string | null
          last_error: string | null
          last_success_at: string | null
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
          rss_feed_validated_at: string | null
          rss_feed_validation: Json
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
          automation_mode?: string
          created_at?: string
          custom_slug_prefix?: string | null
          default_angle?: string | null
          excluded_keywords?: string[] | null
          id?: string
          is_active?: boolean | null
          last_ai_confidence?: number | null
          last_ai_profile?: Json
          last_article_at?: string | null
          last_articles_found?: number
          last_check_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
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
          rss_feed_validated_at?: string | null
          rss_feed_validation?: Json
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
          automation_mode?: string
          created_at?: string
          custom_slug_prefix?: string | null
          default_angle?: string | null
          excluded_keywords?: string[] | null
          id?: string
          is_active?: boolean | null
          last_ai_confidence?: number | null
          last_ai_profile?: Json
          last_article_at?: string | null
          last_articles_found?: number
          last_check_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
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
          rss_feed_validated_at?: string | null
          rss_feed_validation?: Json
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
      organization_brand_assets: {
        Row: {
          created_at: string
          created_by: string | null
          height: number | null
          id: string
          master_storage_path: string | null
          metadata: Json
          mime_type: string
          organization_id: string
          original_storage_path: string
          sha256: string | null
          slot: number
          status: string
          updated_at: string
          width: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          master_storage_path?: string | null
          metadata?: Json
          mime_type: string
          organization_id: string
          original_storage_path: string
          sha256?: string | null
          slot: number
          status?: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          master_storage_path?: string | null
          metadata?: Json
          mime_type?: string
          organization_id?: string
          original_storage_path?: string
          sha256?: string | null
          slot?: number
          status?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_brand_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_brand_kits: {
        Row: {
          alternate_logo_storage_path: string | null
          created_at: string
          font_family: string
          logo_storage_path: string | null
          organization_id: string
          primary_color: string
          secondary_color: string
          settings: Json
          updated_at: string
          watermark_text: string | null
        }
        Insert: {
          alternate_logo_storage_path?: string | null
          created_at?: string
          font_family?: string
          logo_storage_path?: string | null
          organization_id: string
          primary_color?: string
          secondary_color?: string
          settings?: Json
          updated_at?: string
          watermark_text?: string | null
        }
        Update: {
          alternate_logo_storage_path?: string | null
          created_at?: string
          font_family?: string
          logo_storage_path?: string | null
          organization_id?: string
          primary_color?: string
          secondary_color?: string
          settings?: Json
          updated_at?: string
          watermark_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_brand_kits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_media_derivatives: {
        Row: {
          asset_id: string
          byte_size: number | null
          created_at: string
          format: string
          height: number
          id: string
          organization_id: string
          storage_path: string
          template_key: string
          variant_key: string
          width: number
        }
        Insert: {
          asset_id: string
          byte_size?: number | null
          created_at?: string
          format?: string
          height: number
          id?: string
          organization_id: string
          storage_path: string
          template_key: string
          variant_key: string
          width: number
        }
        Update: {
          asset_id?: string
          byte_size?: number | null
          created_at?: string
          format?: string
          height?: number
          id?: string
          organization_id?: string
          storage_path?: string
          template_key?: string
          variant_key?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_media_derivatives_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "organization_brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_media_derivatives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_operating_policies: {
        Row: {
          allow_automated_publish: boolean
          approver_roles: string[]
          article_limit_monthly_override: number | null
          billing_cycle: string
          created_at: string
          currency: string
          organization_id: string
          overage_grace_articles: number
          overage_policy: string
          overage_unit_cents: number | null
          price_cents: number | null
          project_limit_override: number | null
          publication_approval_required: boolean
          publisher_roles: string[]
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          allow_automated_publish?: boolean
          approver_roles?: string[]
          article_limit_monthly_override?: number | null
          billing_cycle?: string
          created_at?: string
          currency?: string
          organization_id: string
          overage_grace_articles?: number
          overage_policy?: string
          overage_unit_cents?: number | null
          price_cents?: number | null
          project_limit_override?: number | null
          publication_approval_required?: boolean
          publisher_roles?: string[]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          allow_automated_publish?: boolean
          approver_roles?: string[]
          article_limit_monthly_override?: number | null
          billing_cycle?: string
          created_at?: string
          currency?: string
          organization_id?: string
          overage_grace_articles?: number
          overage_policy?: string
          overage_unit_cents?: number | null
          price_cents?: number | null
          project_limit_override?: number | null
          publication_approval_required?: boolean
          publisher_roles?: string[]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_operating_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_policy_versions: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          organization_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          organization_id: string
          snapshot: Json
          version: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          organization_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_policy_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_provider_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          provider: string
          secret_last_four: string
          status: string
          updated_at: string
          vault_secret_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          provider: string
          secret_last_four: string
          status?: string
          updated_at?: string
          vault_secret_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          provider?: string
          secret_last_four?: string
          status?: string
          updated_at?: string
          vault_secret_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_provider_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          current_period_start: string
          external_customer_id: string | null
          external_subscription_id: string | null
          gateway: string | null
          id: string
          organization_id: string
          plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          gateway?: string | null
          id?: string
          organization_id: string
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          gateway?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commercial_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_usage_ledger: {
        Row: {
          amount: number
          article_id: string | null
          id: string
          metadata: Json
          metric: string
          model: string | null
          occurred_at: string
          organization_id: string
          project_id: string | null
          provider: string | null
          reservation_id: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          article_id?: string | null
          id?: string
          metadata?: Json
          metric: string
          model?: string | null
          occurred_at?: string
          organization_id: string
          project_id?: string | null
          provider?: string | null
          reservation_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          article_id?: string | null
          id?: string
          metadata?: Json
          metric?: string
          model?: string | null
          occurred_at?: string
          organization_id?: string
          project_id?: string | null
          provider?: string | null
          reservation_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_usage_ledger_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_usage_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_usage_ledger_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_usage_ledger_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "usage_quota_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          owner_user_id: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          owner_user_id: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          owner_user_id?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      poi_hyperlocal: {
        Row: {
          city: string
          comarca: string | null
          created_at: string
          discovery_source: string
          full_address: string | null
          id: string
          internal_notes: string | null
          is_24_7: boolean
          latitude: number | null
          longitude: number | null
          name: string
          neighborhood: string | null
          neighborhoods_served: string[] | null
          official_url: string | null
          opening_hours: string | null
          poi_type: string
          raw_payload: Json | null
          slug: string | null
          state_uf: string
          status: string
          updated_at: string
          urgency_phone: string | null
          user_id: string
          virtual_channel_url: string | null
          ymyl_subareas: string[] | null
        }
        Insert: {
          city: string
          comarca?: string | null
          created_at?: string
          discovery_source?: string
          full_address?: string | null
          id?: string
          internal_notes?: string | null
          is_24_7?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          neighborhood?: string | null
          neighborhoods_served?: string[] | null
          official_url?: string | null
          opening_hours?: string | null
          poi_type: string
          raw_payload?: Json | null
          slug?: string | null
          state_uf: string
          status?: string
          updated_at?: string
          urgency_phone?: string | null
          user_id: string
          virtual_channel_url?: string | null
          ymyl_subareas?: string[] | null
        }
        Update: {
          city?: string
          comarca?: string | null
          created_at?: string
          discovery_source?: string
          full_address?: string | null
          id?: string
          internal_notes?: string | null
          is_24_7?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          neighborhood?: string | null
          neighborhoods_served?: string[] | null
          official_url?: string | null
          opening_hours?: string | null
          poi_type?: string
          raw_payload?: Json | null
          slug?: string | null
          state_uf?: string
          status?: string
          updated_at?: string
          urgency_phone?: string | null
          user_id?: string
          virtual_channel_url?: string | null
          ymyl_subareas?: string[] | null
        }
        Relationships: []
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
      project_circuit_breakers: {
        Row: {
          consecutive_failures: number
          last_error_code: string | null
          last_status_code: number | null
          opened_at: string | null
          organization_id: string
          project_id: string
          retry_after: string | null
          state: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          last_error_code?: string | null
          last_status_code?: number | null
          opened_at?: string | null
          organization_id: string
          project_id: string
          retry_after?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          last_error_code?: string | null
          last_status_code?: number | null
          opened_at?: string | null
          organization_id?: string
          project_id?: string
          retry_after?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_circuit_breakers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_circuit_breakers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          commercial_info: Json
          compliance_rules: string | null
          created_at: string
          cta_comunidade: string | null
          cta_conclusao: string | null
          cta_leads: string | null
          description: string | null
          domain: string
          editorial_identity: Json
          empresa_endereco: string | null
          empresa_nome: string | null
          empresa_telefone: string | null
          empresa_whatsapp: string | null
          id: string
          is_connected: boolean
          links_prioritarios: string[] | null
          name: string
          nicho: string | null
          organization_id: string | null
          palavras_secundarias: string[] | null
          pov_padrao: string | null
          rss_feed_url: string | null
          rss_feed_validated_at: string | null
          rss_feed_validation: Json
          seo_plugin: string | null
          social_google_maps: string | null
          social_instagram: string | null
          social_linkedin: string | null
          social_links: Json
          social_linktree: string | null
          social_tiktok: string | null
          social_twitter: string | null
          social_youtube: string | null
          tom_padrao: string | null
          updated_at: string
          user_id: string
          wordpress_app_password: string | null
          wordpress_connected_at: string | null
          wordpress_connector_mode: string
          wordpress_credential_ref: string | null
          wordpress_last_verified_at: string | null
          wordpress_plugin_namespace: string | null
          wordpress_plugin_version: string | null
          wordpress_url: string | null
          wordpress_username: string | null
        }
        Insert: {
          commercial_info?: Json
          compliance_rules?: string | null
          created_at?: string
          cta_comunidade?: string | null
          cta_conclusao?: string | null
          cta_leads?: string | null
          description?: string | null
          domain: string
          editorial_identity?: Json
          empresa_endereco?: string | null
          empresa_nome?: string | null
          empresa_telefone?: string | null
          empresa_whatsapp?: string | null
          id?: string
          is_connected?: boolean
          links_prioritarios?: string[] | null
          name: string
          nicho?: string | null
          organization_id?: string | null
          palavras_secundarias?: string[] | null
          pov_padrao?: string | null
          rss_feed_url?: string | null
          rss_feed_validated_at?: string | null
          rss_feed_validation?: Json
          seo_plugin?: string | null
          social_google_maps?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_links?: Json
          social_linktree?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          tom_padrao?: string | null
          updated_at?: string
          user_id: string
          wordpress_app_password?: string | null
          wordpress_connected_at?: string | null
          wordpress_connector_mode?: string
          wordpress_credential_ref?: string | null
          wordpress_last_verified_at?: string | null
          wordpress_plugin_namespace?: string | null
          wordpress_plugin_version?: string | null
          wordpress_url?: string | null
          wordpress_username?: string | null
        }
        Update: {
          commercial_info?: Json
          compliance_rules?: string | null
          created_at?: string
          cta_comunidade?: string | null
          cta_conclusao?: string | null
          cta_leads?: string | null
          description?: string | null
          domain?: string
          editorial_identity?: Json
          empresa_endereco?: string | null
          empresa_nome?: string | null
          empresa_telefone?: string | null
          empresa_whatsapp?: string | null
          id?: string
          is_connected?: boolean
          links_prioritarios?: string[] | null
          name?: string
          nicho?: string | null
          organization_id?: string | null
          palavras_secundarias?: string[] | null
          pov_padrao?: string | null
          rss_feed_url?: string | null
          rss_feed_validated_at?: string | null
          rss_feed_validation?: Json
          seo_plugin?: string | null
          social_google_maps?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_links?: Json
          social_linktree?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          tom_padrao?: string | null
          updated_at?: string
          user_id?: string
          wordpress_app_password?: string | null
          wordpress_connected_at?: string | null
          wordpress_connector_mode?: string
          wordpress_credential_ref?: string | null
          wordpress_last_verified_at?: string | null
          wordpress_plugin_namespace?: string | null
          wordpress_plugin_version?: string | null
          wordpress_url?: string | null
          wordpress_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_template_versions: {
        Row: {
          agent_name: string | null
          agent_type: string | null
          context_rules: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          output_schema: Json
          project_id: string | null
          prompt: string
          prompt_template_id: string
          target_function: string | null
          user_id: string
          version: number
        }
        Insert: {
          agent_name?: string | null
          agent_type?: string | null
          context_rules?: Json
          created_at?: string
          id?: string
          is_active: boolean
          name: string
          output_schema?: Json
          project_id?: string | null
          prompt: string
          prompt_template_id: string
          target_function?: string | null
          user_id: string
          version: number
        }
        Update: {
          agent_name?: string | null
          agent_type?: string | null
          context_rules?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          output_schema?: Json
          project_id?: string | null
          prompt?: string
          prompt_template_id?: string
          target_function?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_template_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_template_versions_prompt_template_id_fkey"
            columns: ["prompt_template_id"]
            isOneToOne: false
            referencedRelation: "prompt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          agent_name: string | null
          agent_type: string | null
          context_rules: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean | null
          name: string
          output_schema: Json
          project_id: string | null
          prompt: string
          source: string
          target_function: string | null
          template_type: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          agent_name?: string | null
          agent_type?: string | null
          context_rules?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          name: string
          output_schema?: Json
          project_id?: string | null
          prompt: string
          source?: string
          target_function?: string | null
          template_type?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          agent_name?: string | null
          agent_type?: string | null
          context_rules?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          name?: string
          output_schema?: Json
          project_id?: string | null
          prompt?: string
          source?: string
          target_function?: string | null
          template_type?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rss_schedules: {
        Row: {
          article_length: string | null
          articles_generated: number | null
          auto_publish: boolean | null
          created_at: string
          editorial_autonomy: boolean
          feed_name: string
          feed_url: string
          frequency: string | null
          id: string
          is_active: boolean | null
          last_decision: Json | null
          last_error: string | null
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
          editorial_autonomy?: boolean
          feed_name: string
          feed_url: string
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          last_decision?: Json | null
          last_error?: string | null
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
          editorial_autonomy?: boolean
          feed_name?: string
          feed_url?: string
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          last_decision?: Json | null
          last_error?: string | null
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
      supporter_avatar_candidate_presets: {
        Row: {
          created_at: string
          drive_download_url: string
          drive_file_id: string
          drive_file_name: string
          drive_folder_id: string
          drive_view_url: string
          is_active: boolean
          label: string
          prompt_hint: string
          prop: string
          slug: string
          sort_order: number
          updated_at: string
          wardrobe: string
        }
        Insert: {
          created_at?: string
          drive_download_url: string
          drive_file_id: string
          drive_file_name: string
          drive_folder_id: string
          drive_view_url: string
          is_active?: boolean
          label: string
          prompt_hint?: string
          prop: string
          slug: string
          sort_order?: number
          updated_at?: string
          wardrobe: string
        }
        Update: {
          created_at?: string
          drive_download_url?: string
          drive_file_id?: string
          drive_file_name?: string
          drive_folder_id?: string
          drive_view_url?: string
          is_active?: boolean
          label?: string
          prompt_hint?: string
          prop?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          wardrobe?: string
        }
        Relationships: []
      }
      supporter_avatar_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          input_payload: Json
          model: string | null
          output_payload: Json
          provider: string | null
          request_id: string
          stage: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_payload?: Json
          model?: string | null
          output_payload?: Json
          provider?: string | null
          request_id: string
          stage: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_payload?: Json
          model?: string | null
          output_payload?: Json
          provider?: string | null
          request_id?: string
          stage?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporter_avatar_jobs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "supporter_avatar_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      supporter_avatar_outputs: {
        Row: {
          created_at: string
          height: number
          id: string
          mime_type: string
          model: string | null
          platform: string
          prompt_version: string | null
          qa_payload: Json
          qa_score: number | null
          request_id: string
          storage_path: string
          width: number
        }
        Insert: {
          created_at?: string
          height: number
          id?: string
          mime_type?: string
          model?: string | null
          platform: string
          prompt_version?: string | null
          qa_payload?: Json
          qa_score?: number | null
          request_id: string
          storage_path: string
          width: number
        }
        Update: {
          created_at?: string
          height?: number
          id?: string
          mime_type?: string
          model?: string | null
          platform?: string
          prompt_version?: string | null
          qa_payload?: Json
          qa_score?: number | null
          request_id?: string
          storage_path?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "supporter_avatar_outputs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "supporter_avatar_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      supporter_avatar_prompt_templates: {
        Row: {
          config: Json
          created_at: string
          fidelity_target: number
          id: string
          is_active: boolean
          name: string
          negative_prompt: string
          owner_user_id: string | null
          slug: string
          system_prompt: string
          updated_at: string
          version: number
        }
        Insert: {
          config?: Json
          created_at?: string
          fidelity_target?: number
          id?: string
          is_active?: boolean
          name: string
          negative_prompt?: string
          owner_user_id?: string | null
          slug: string
          system_prompt: string
          updated_at?: string
          version?: number
        }
        Update: {
          config?: Json
          created_at?: string
          fidelity_target?: number
          id?: string
          is_active?: boolean
          name?: string
          negative_prompt?: string
          owner_user_id?: string | null
          slug?: string
          system_prompt?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      supporter_avatar_requests: {
        Row: {
          candidate_preset_slug: string | null
          city: string | null
          completed_at: string | null
          consent_at: string | null
          consent_image_use: boolean
          consent_public_gallery: boolean
          consent_social_linking: boolean
          consent_terms: boolean
          created_at: string
          delivery_mode: string
          email: string | null
          expires_at: string
          fingerprint_hash: string | null
          generation_count: number
          id: string
          internal_selection: Json
          max_generations: number
          output_format: string
          pipeline_version: string
          prompt_template_slug: string
          provider_preference: string
          public_token_hash: string
          social_handles: Json
          source_count: number
          state: string | null
          status: string
          style: string
          support_text: string
          supporter_approved_at: string | null
          supporter_name: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          candidate_preset_slug?: string | null
          city?: string | null
          completed_at?: string | null
          consent_at?: string | null
          consent_image_use?: boolean
          consent_public_gallery?: boolean
          consent_social_linking?: boolean
          consent_terms?: boolean
          created_at?: string
          delivery_mode?: string
          email?: string | null
          expires_at?: string
          fingerprint_hash?: string | null
          generation_count?: number
          id?: string
          internal_selection?: Json
          max_generations?: number
          output_format?: string
          pipeline_version?: string
          prompt_template_slug?: string
          provider_preference?: string
          public_token_hash: string
          social_handles?: Json
          source_count?: number
          state?: string | null
          status?: string
          style?: string
          support_text?: string
          supporter_approved_at?: string | null
          supporter_name: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          candidate_preset_slug?: string | null
          city?: string | null
          completed_at?: string | null
          consent_at?: string | null
          consent_image_use?: boolean
          consent_public_gallery?: boolean
          consent_social_linking?: boolean
          consent_terms?: boolean
          created_at?: string
          delivery_mode?: string
          email?: string | null
          expires_at?: string
          fingerprint_hash?: string | null
          generation_count?: number
          id?: string
          internal_selection?: Json
          max_generations?: number
          output_format?: string
          pipeline_version?: string
          prompt_template_slug?: string
          provider_preference?: string
          public_token_hash?: string
          social_handles?: Json
          source_count?: number
          state?: string | null
          status?: string
          style?: string
          support_text?: string
          supporter_approved_at?: string | null
          supporter_name?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supporter_avatar_requests_candidate_preset_slug_fkey"
            columns: ["candidate_preset_slug"]
            isOneToOne: false
            referencedRelation: "supporter_avatar_candidate_presets"
            referencedColumns: ["slug"]
          },
        ]
      }
      supporter_avatar_sources: {
        Row: {
          created_at: string
          file_size_bytes: number | null
          id: string
          mime_type: string
          request_id: string
          sha256: string | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          mime_type: string
          request_id: string
          sha256?: string | null
          storage_path: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string
          request_id?: string
          sha256?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporter_avatar_sources_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "supporter_avatar_requests"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "token_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      usage_quota_reservations: {
        Row: {
          amount: number
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          metric: string
          organization_id: string
          period_end: string
          period_start: string
          reserved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key: string
          metric: string
          organization_id: string
          period_end: string
          period_start: string
          reserved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          metric?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          reserved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_quota_reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      wordpress_operations: {
        Row: {
          article_id: string | null
          attempts: number
          completed_at: string | null
          correlation_id: string
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          operation_type: string
          project_id: string
          result: Json
          scheduled_at: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          article_id?: string | null
          attempts?: number
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          operation_type?: string
          project_id: string
          result?: Json
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          article_id?: string | null
          attempts?: number
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          operation_type?: string
          project_id?: string
          result?: Json
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wordpress_operations_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wordpress_operations_project_id_fkey"
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
      zica_ai_provider_health_cache: {
        Row: {
          checked_at: string
          payload: Json
          provider: string
        }
        Insert: {
          checked_at?: string
          payload?: Json
          provider: string
        }
        Update: {
          checked_at?: string
          payload?: Json
          provider?: string
        }
        Relationships: []
      }
      zica_brain_jobs: {
        Row: {
          article_id: string | null
          attempts: number
          batch_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          job_type: string
          last_error: string | null
          lease_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          organization_id: string | null
          payload: Json
          priority: number
          project_id: string | null
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          article_id?: string | null
          attempts?: number
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          job_type: string
          last_error?: string | null
          lease_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          organization_id?: string | null
          payload?: Json
          priority?: number
          project_id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          article_id?: string | null
          attempts?: number
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          job_type?: string
          last_error?: string | null
          lease_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          organization_id?: string | null
          payload?: Json
          priority?: number
          project_id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zica_brain_jobs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zica_brain_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zica_brain_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      zica_brain_state: {
        Row: {
          last_error: string | null
          last_error_at: string | null
          last_heartbeat_at: string | null
          last_success_at: string | null
          metrics: Json
          status: string
          subsystem: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_error?: string | null
          last_error_at?: string | null
          last_heartbeat_at?: string | null
          last_success_at?: string | null
          metrics?: Json
          status?: string
          subsystem: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_error?: string | null
          last_error_at?: string | null
          last_heartbeat_at?: string | null
          last_success_at?: string | null
          metrics?: Json
          status?: string
          subsystem?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      zica_orchestrator_events: {
        Row: {
          attempts: number
          completed_at: string | null
          content_hash: string
          correlation_id: string
          created_at: string
          event_id: string
          event_type: string
          last_error: string | null
          status: string
          target_key: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          content_hash: string
          correlation_id: string
          created_at?: string
          event_id: string
          event_type: string
          last_error?: string | null
          status?: string
          target_key: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          content_hash?: string
          correlation_id?: string
          created_at?: string
          event_id?: string
          event_type?: string
          last_error?: string | null
          status?: string
          target_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zica_orchestrator_events_target_key_fkey"
            columns: ["target_key"]
            isOneToOne: false
            referencedRelation: "zica_orchestrator_targets"
            referencedColumns: ["target_key"]
          },
        ]
      }
      zica_orchestrator_targets: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          credential_ref: string
          delivery_mode: string
          hmac_secret_ref: string
          owner_user_id: string
          site_origin: string
          site_url: string
          target_key: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          credential_ref: string
          delivery_mode: string
          hmac_secret_ref: string
          owner_user_id: string
          site_origin: string
          site_url: string
          target_key: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          credential_ref?: string
          delivery_mode?: string
          hmac_secret_ref?: string
          owner_user_id?: string
          site_origin?: string
          site_url?: string
          target_key?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      electoral_agent_content_context: {
        Row: {
          authority_level: string | null
          body: string | null
          campaign_preset_id: string | null
          factual_use_status: string | null
          id: string | null
          metadata: Json | null
          priority: number | null
          risk_flags: string[] | null
          source_filename: string | null
          source_locator: Json | null
          source_sha256: string | null
          source_slug: string | null
          source_title: string | null
          source_type: string | null
          tags: string[] | null
          title: string | null
          topic: string | null
          unit_key: string | null
          unit_type: string | null
          usage_scope: string | null
          verification_status: string | null
        }
        Relationships: []
      }
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
      check_organization_publication_permission: {
        Args: {
          p_automated?: boolean
          p_organization_id: string
          p_user_id: string
        }
        Returns: Json
      }
      claim_zica_brain_jobs: {
        Args: { p_limit?: number; p_worker?: string }
        Returns: {
          article_id: string | null
          attempts: number
          batch_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          job_type: string
          last_error: string | null
          lease_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          organization_id: string | null
          payload: Json
          priority: number
          project_id: string | null
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "zica_brain_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      commit_article_quota: {
        Args: {
          p_article_id?: string
          p_metadata?: Json
          p_project_id?: string
          p_reservation_id: string
        }
        Returns: Json
      }
      create_editorial_plan: {
        Args: {
          p_audience: string
          p_category: string
          p_city: string
          p_estimated_credits?: number
          p_estimated_input_tokens?: number
          p_estimated_output_tokens?: number
          p_frequency: string
          p_idempotency_key: string
          p_items: Json
          p_name: string
          p_portal: string
          p_project_id: string
          p_requested_quantity: number
          p_rss_sources?: Json
          p_source_file_name?: string
        }
        Returns: Json
      }
      default_organization_id: { Args: never; Returns: string }
      delete_organization_openai_byok: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      delete_zica_ai_provider_secret: {
        Args: { p_provider: string }
        Returns: Json
      }
      dispatch_due_wordpress_operations: { Args: never; Returns: number }
      enqueue_supporter_avatar_generation: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: Json
      }
      exec_sql: { Args: { sql_query: string }; Returns: Json }
      finish_zica_brain_job: {
        Args: { p_error?: string; p_id: string; p_ok: boolean; p_result?: Json }
        Returns: undefined
      }
      get_zica_ai_provider_secret: {
        Args: { p_provider: string }
        Returns: string
      }
      get_zica_automation_secret: { Args: { p_name: string }; Returns: string }
      get_zica_orchestrator_credential: {
        Args: { p_ref: string }
        Returns: string
      }
      get_zica_wordpress_credential: {
        Args: { p_ref: string }
        Returns: string
      }
      has_organization_role: {
        Args: { p_organization_id: string; p_roles: string[] }
        Returns: boolean
      }
      is_ceo: { Args: never; Returns: boolean }
      is_organization_member: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      register_editorial_plan_asset: {
        Args: {
          p_byte_size: number
          p_mime_type: string
          p_original_name: string
          p_plan_id: string
          p_storage_path: string
        }
        Returns: string
      }
      reprocess_editorial_plan_item: {
        Args: { p_expected_step: string; p_item_id: string }
        Returns: Json
      }
      reserve_article_quota: {
        Args: { p_idempotency_key: string; p_organization_id: string }
        Returns: Json
      }
      set_organization_openai_byok: {
        Args: { p_organization_id: string; p_secret: string }
        Returns: Json
      }
      set_zica_ai_provider_secret: {
        Args: { p_provider: string; p_secret: string }
        Returns: Json
      }
      update_commercial_plan_terms: {
        Args: {
          p_billing_cycle: string
          p_changed_by: string
          p_currency: string
          p_overage_grace_articles: number
          p_overage_policy: string
          p_overage_unit_cents: number
          p_plan_id: string
          p_price_cents: number
        }
        Returns: Json
      }
      update_organization_business_policy: {
        Args: {
          p_allow_automated_publish: boolean
          p_approver_roles: string[]
          p_article_limit_monthly_override: number
          p_billing_cycle: string
          p_changed_by: string
          p_currency: string
          p_organization_id: string
          p_overage_grace_articles: number
          p_overage_policy: string
          p_overage_unit_cents: number
          p_period_end: string
          p_period_start: string
          p_plan_id: string
          p_price_cents: number
          p_project_limit_override: number
          p_publication_approval_required: boolean
          p_publisher_roles: string[]
          p_subscription_status: string
        }
        Returns: Json
      }
      zica_ai_provider_secret_status: { Args: never; Returns: Json }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
