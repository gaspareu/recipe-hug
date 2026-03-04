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
          created_at: string | null
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
          created_at?: string | null
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
          created_at?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_webhook_token: { Args: { user_uuid: string }; Returns: string }
      get_my_webhook_token: { Args: never; Returns: string }
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
  public: {
    Enums: {},
  },
} as const
