export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          extracted_recipe: Json | null
          id: string
          messages: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted_recipe?: Json | null
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extracted_recipe?: Json | null
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      composition_items: {
        Row: {
          child_composition_id: string | null
          composition_id: string
          course: string | null
          id: string
          notes: string | null
          position: number
          quantity_factor: number
          recipe_id: string | null
          user_id: string
        }
        Insert: {
          child_composition_id?: string | null
          composition_id: string
          course?: string | null
          id?: string
          notes?: string | null
          position: number
          quantity_factor?: number
          recipe_id?: string | null
          user_id: string
        }
        Update: {
          child_composition_id?: string | null
          composition_id?: string
          course?: string | null
          id?: string
          notes?: string | null
          position?: number
          quantity_factor?: number
          recipe_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "composition_items_child_fkey"
            columns: ["user_id", "child_composition_id"]
            isOneToOne: false
            referencedRelation: "compositions"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "composition_items_parent_fkey"
            columns: ["user_id", "composition_id"]
            isOneToOne: false
            referencedRelation: "compositions"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "composition_items_recipe_fkey"
            columns: ["user_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      compositions: {
        Row: {
          assembly_steps: Json
          created_at: string
          id: string
          kind: string
          servings: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assembly_steps?: Json
          created_at?: string
          id?: string
          kind: string
          servings?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assembly_steps?: Json
          created_at?: string
          id?: string
          kind?: string
          servings?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cookidoo_exports: {
        Row: {
          cookidoo_recipe_id: string | null
          cookidoo_url: string | null
          created_at: string
          diagnostics: Json | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          recipe_id: string
          status: string
          unguided_steps: number[]
          updated: boolean
          user_id: string
          warnings: string[]
        }
        Insert: {
          cookidoo_recipe_id?: string | null
          cookidoo_url?: string | null
          created_at?: string
          diagnostics?: Json | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          recipe_id: string
          status?: string
          unguided_steps?: number[]
          updated?: boolean
          user_id: string
          warnings?: string[]
        }
        Update: {
          cookidoo_recipe_id?: string | null
          cookidoo_url?: string | null
          created_at?: string
          diagnostics?: Json | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          recipe_id?: string
          status?: string
          unguided_steps?: number[]
          updated?: boolean
          user_id?: string
          warnings?: string[]
        }
        Relationships: []
      }
      meal_plans: {
        Row: {
          composition_id: string | null
          created_at: string
          custom_meal: string | null
          day_of_week: number
          id: string
          meal_type: string
          notes: string | null
          recipe_id: string | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          composition_id?: string | null
          created_at?: string
          custom_meal?: string | null
          day_of_week: number
          id?: string
          meal_type: string
          notes?: string | null
          recipe_id?: string | null
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          composition_id?: string | null
          created_at?: string
          custom_meal?: string | null
          day_of_week?: number
          id?: string
          meal_type?: string
          notes?: string | null
          recipe_id?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_composition_owner_fkey"
            columns: ["user_id", "composition_id"]
            isOneToOne: false
            referencedRelation: "compositions"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "meal_plans_recipe_owner_fkey"
            columns: ["user_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      pairing_ai_rate_limit_buckets: {
        Row: {
          bucket_key: string
          request_count: number
          scope: string
          user_id: string | null
          window_started_at: string
        }
        Insert: {
          bucket_key: string
          request_count?: number
          scope: string
          user_id?: string | null
          window_started_at?: string
        }
        Update: {
          bucket_key?: string
          request_count?: number
          scope?: string
          user_id?: string | null
          window_started_at?: string
        }
        Relationships: []
      }
      pairing_feedback: {
        Row: {
          candidate_recipe_id: string
          id: string
          signal: string
          source_composition_id: string | null
          source_recipe_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          candidate_recipe_id: string
          id?: string
          signal: string
          source_composition_id?: string | null
          source_recipe_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          candidate_recipe_id?: string
          id?: string
          signal?: string
          source_composition_id?: string | null
          source_recipe_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pairing_feedback_candidate_fkey"
            columns: ["user_id", "candidate_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "pairing_feedback_source_composition_fkey"
            columns: ["user_id", "source_composition_id"]
            isOneToOne: false
            referencedRelation: "compositions"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "pairing_feedback_source_recipe_fkey"
            columns: ["user_id", "source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          theme: string | null
          updated_at: string
          webhook_token: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          theme?: string | null
          updated_at?: string
          webhook_token?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          theme?: string | null
          updated_at?: string
          webhook_token?: string | null
        }
        Relationships: []
      }
      recipe_pairing_profiles: {
        Row: {
          active_minutes: number | null
          allergen_review_state: string
          allergens: string[]
          dietary_compatibilities: string[]
          dietary_exclusions: string[]
          dietary_review_state: string
          equipment: string[]
          flavors: string[]
          make_ahead: boolean
          recipe_id: string
          roles: string[]
          textures: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active_minutes?: number | null
          allergen_review_state?: string
          allergens?: string[]
          dietary_compatibilities?: string[]
          dietary_exclusions?: string[]
          dietary_review_state?: string
          equipment?: string[]
          flavors?: string[]
          make_ahead?: boolean
          recipe_id: string
          roles?: string[]
          textures?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active_minutes?: number | null
          allergen_review_state?: string
          allergens?: string[]
          dietary_compatibilities?: string[]
          dietary_exclusions?: string[]
          dietary_review_state?: string
          equipment?: string[]
          flavors?: string[]
          make_ahead?: boolean
          recipe_id?: string
          roles?: string[]
          textures?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_pairing_profiles_recipe_owner_fkey"
            columns: ["user_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      recipe_shares: {
        Row: {
          claimed_at: string | null
          created_at: string
          id: string
          identifier_type: string
          recipe_snapshot: Json
          recipient_id: string | null
          recipient_identifier: string
          sender_id: string
          status: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          id?: string
          identifier_type: string
          recipe_snapshot: Json
          recipient_id?: string | null
          recipient_identifier: string
          sender_id: string
          status?: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          id?: string
          identifier_type?: string
          recipe_snapshot?: Json
          recipient_id?: string | null
          recipient_identifier?: string
          sender_id?: string
          status?: string
        }
        Relationships: []
      }
      recipe_versions: {
        Row: {
          change_description: string | null
          created_at: string
          id: string
          ingredients: Json
          nutrition_tags: string[] | null
          recipe_id: string
          season: string | null
          servings: number | null
          steps: Json
          title: string
          user_id: string
          version_number: number
        }
        Insert: {
          change_description?: string | null
          created_at?: string
          id?: string
          ingredients?: Json
          nutrition_tags?: string[] | null
          recipe_id: string
          season?: string | null
          servings?: number | null
          steps?: Json
          title: string
          user_id: string
          version_number: number
        }
        Update: {
          change_description?: string | null
          created_at?: string
          id?: string
          ingredients?: Json
          nutrition_tags?: string[] | null
          recipe_id?: string
          season?: string | null
          servings?: number | null
          steps?: Json
          title?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_versions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          ai_summary: string | null
          calorie_score: number | null
          cookidoo_exported_at: string | null
          cookidoo_recipe_id: string | null
          created_at: string | null
          entry_kind: string | null
          id: string
          ingredients: Json
          is_favorite: boolean | null
          nutrition_tags: string[] | null
          season: string | null
          servings: number | null
          source_image_url: string | null
          source_type: string
          status: string
          steps: Json
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_summary?: string | null
          calorie_score?: number | null
          cookidoo_exported_at?: string | null
          cookidoo_recipe_id?: string | null
          created_at?: string | null
          entry_kind?: string | null
          id?: string
          ingredients?: Json
          is_favorite?: boolean | null
          nutrition_tags?: string[] | null
          season?: string | null
          servings?: number | null
          source_image_url?: string | null
          source_type?: string
          status?: string
          steps?: Json
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_summary?: string | null
          calorie_score?: number | null
          cookidoo_exported_at?: string | null
          cookidoo_recipe_id?: string | null
          created_at?: string | null
          entry_kind?: string | null
          id?: string
          ingredients?: Json
          is_favorite?: boolean | null
          nutrition_tags?: string[] | null
          season?: string | null
          servings?: number | null
          source_image_url?: string | null
          source_type?: string
          status?: string
          steps?: Json
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_ai_settings: {
        Row: {
          agent_configs: Json | null
          api_key: string | null
          created_at: string
          id: string
          preferred_model: string | null
          provider: string
          provider_api_keys: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_configs?: Json | null
          api_key?: string | null
          created_at?: string
          id?: string
          preferred_model?: string | null
          provider?: string
          provider_api_keys?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_configs?: Json | null
          api_key?: string | null
          created_at?: string
          id?: string
          preferred_model?: string | null
          provider?: string
          provider_api_keys?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_cookidoo_credentials: {
        Row: {
          country: string
          created_at: string
          email: string
          id: string
          password_enc: string
          updated_at: string
          user_id: string
        }
        Insert: {
          country?: string
          created_at?: string
          email: string
          id?: string
          password_enc: string
          updated_at?: string
          user_id: string
        }
        Update: {
          country?: string
          created_at?: string
          email?: string
          id?: string
          password_enc?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_culinary_preferences: {
        Row: {
          created_at: string
          culinary_style: Json
          dietary_constraints: Json
          id: string
          kitchen_equipment: Json
          taste_preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          culinary_style?: Json
          dietary_constraints?: Json
          id?: string
          kitchen_equipment?: Json
          taste_preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          culinary_style?: Json
          dietary_constraints?: Json
          id?: string
          kitchen_equipment?: Json
          taste_preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_rate_limit_buckets: {
        Row: {
          bucket_key: string
          cost_count: number
          request_count: number
          scope: string
          window_started_at: string
        }
        Insert: {
          bucket_key: string
          cost_count?: number
          request_count?: number
          scope: string
          window_started_at?: string
        }
        Update: {
          bucket_key?: string
          cost_count?: number
          request_count?: number
          scope?: string
          window_started_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      profiles_safe: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          theme: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          theme?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          theme?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_ai_settings_safe: {
        Row: {
          agent_configs: Json | null
          created_at: string | null
          id: string | null
          preferred_model: string | null
          provider: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          agent_configs?: Json | null
          created_at?: string | null
          id?: string | null
          preferred_model?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          agent_configs?: Json | null
          created_at?: string | null
          id?: string | null
          preferred_model?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_cookidoo_credentials_safe: {
        Row: {
          country: string | null
          created_at: string | null
          email: string | null
          id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      consume_pairing_ai_quota: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      consume_voice_quota: {
        Args: { p_cost?: number; p_scope: string; p_user_id: string }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      generate_webhook_token: { Args: { user_uuid: string }; Returns: string }
      get_my_webhook_token: { Args: never; Returns: string }
      get_user_id_by_phone: { Args: { phone_number: string }; Returns: string }
      replace_week_meal_plan: {
        Args: { p_meals: Json; p_week_start: string }
        Returns: number
      }
      save_composition: {
        Args: {
          p_assembly_steps: Json
          p_id?: string
          p_items: Json
          p_kind: string
          p_servings: number
          p_title: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
