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
      chronos_rules: {
        Row: {
          condition: Json
          created_at: string
          cron: string
          enabled: boolean
          id: string
          last_fired_at: string | null
          name: string
          trigger_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          condition?: Json
          created_at?: string
          cron: string
          enabled?: boolean
          id?: string
          last_fired_at?: string | null
          name: string
          trigger_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          condition?: Json
          created_at?: string
          cron?: string
          enabled?: boolean
          id?: string
          last_fired_at?: string | null
          name?: string
          trigger_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      execution_plans: {
        Row: {
          created_at: string
          dag: Json
          error: string | null
          goal: string
          id: string
          signal_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dag: Json
          error?: string | null
          goal: string
          id?: string
          signal_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dag?: Json
          error?: string | null
          goal?: string
          id?: string
          signal_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_plans_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_chunks: {
        Row: {
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          priority: string
          raw_text: string
          source: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          priority?: string
          raw_text: string
          source?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          priority?: string
          raw_text?: string
          source?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      skill_versions: {
        Row: {
          code: string
          created_at: string
          generated_by_model: string | null
          id: string
          parent_version_id: string | null
          requirements: string | null
          skill_id: string
          user_id: string
          validated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          generated_by_model?: string | null
          id?: string
          parent_version_id?: string | null
          requirements?: string | null
          skill_id: string
          user_id: string
          validated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          generated_by_model?: string | null
          id?: string
          parent_version_id?: string | null
          requirements?: string | null
          skill_id?: string
          user_id?: string
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skill_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "skill_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_versions_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          active_version_id: string | null
          created_at: string
          description: string | null
          fail_count: number
          id: string
          language: string
          name: string
          network_policy: Json
          signature_hash: string
          success_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active_version_id?: string | null
          created_at?: string
          description?: string | null
          fail_count?: number
          id?: string
          language?: string
          name: string
          network_policy?: Json
          signature_hash: string
          success_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active_version_id?: string | null
          created_at?: string
          description?: string | null
          fail_count?: number
          id?: string
          language?: string
          name?: string
          network_policy?: Json
          signature_hash?: string
          success_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_active_version"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "skill_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_runs: {
        Row: {
          attempt: number
          created_at: string
          duration_ms: number | null
          exit_code: number | null
          id: string
          input: Json | null
          node_id: string
          output: Json | null
          plan_id: string | null
          skill_version_id: string | null
          status: string
          stderr: string | null
          stdout: string | null
          tool_name: string | null
          user_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          duration_ms?: number | null
          exit_code?: number | null
          id?: string
          input?: Json | null
          node_id: string
          output?: Json | null
          plan_id?: string | null
          skill_version_id?: string | null
          status?: string
          stderr?: string | null
          stdout?: string | null
          tool_name?: string | null
          user_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          duration_ms?: number | null
          exit_code?: number | null
          id?: string
          input?: Json | null
          node_id?: string
          output?: Json | null
          plan_id?: string | null
          skill_version_id?: string | null
          status?: string
          stderr?: string | null
          stdout?: string | null
          tool_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_runs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_runs_skill_version_id_fkey"
            columns: ["skill_version_id"]
            isOneToOne: false
            referencedRelation: "skill_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_state: {
        Row: {
          flags: Json
          focus: string | null
          last_active: string
          updated_at: string
          user_id: string
        }
        Insert: {
          flags?: Json
          focus?: string | null
          last_active?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          flags?: Json
          focus?: string | null
          last_active?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_secrets: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
          value_encrypted: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
          value_encrypted: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          value_encrypted?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_memory_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          id: string
          metadata: Json
          similarity: number
          text: string
        }[]
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
  public: {
    Enums: {},
  },
} as const
