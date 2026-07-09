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
      job_applications: {
        Row: {
          ai_score: string | null
          applied_at: string
          archived: boolean
          availability_days: string[]
          availability_hours: string
          created_at: string
          email: string | null
          first_name: string | null
          hired_employee_id: string | null
          id: string
          interview_notes: string | null
          interview_sent_at: string | null
          interview_type: string | null
          job_id: string
          last_name: string | null
          name: string
          note: string | null
          offered_slots: string[] | null
          owner_id: string
          phone: string
          pitch: string | null
          role: string | null
          selected_slot: string | null
          shadow_shift: Json | null
          source: string | null
          special_talents: string | null
          stage: string | null
          status: string
          updated_at: string
          verified: boolean
          weekly_availability: Json | null
          work_experience: Json | null
        }
        Insert: {
          ai_score?: string | null
          applied_at?: string
          archived?: boolean
          availability_days?: string[]
          availability_hours?: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          hired_employee_id?: string | null
          id?: string
          interview_notes?: string | null
          interview_sent_at?: string | null
          interview_type?: string | null
          job_id: string
          last_name?: string | null
          name?: string
          note?: string | null
          offered_slots?: string[] | null
          owner_id: string
          phone?: string
          pitch?: string | null
          role?: string | null
          selected_slot?: string | null
          shadow_shift?: Json | null
          source?: string | null
          special_talents?: string | null
          stage?: string | null
          status?: string
          updated_at?: string
          verified?: boolean
          weekly_availability?: Json | null
          work_experience?: Json | null
        }
        Update: {
          ai_score?: string | null
          applied_at?: string
          archived?: boolean
          availability_days?: string[]
          availability_hours?: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          hired_employee_id?: string | null
          id?: string
          interview_notes?: string | null
          interview_sent_at?: string | null
          interview_type?: string | null
          job_id?: string
          last_name?: string | null
          name?: string
          note?: string | null
          offered_slots?: string[] | null
          owner_id?: string
          phone?: string
          pitch?: string | null
          role?: string | null
          selected_slot?: string | null
          shadow_shift?: Json | null
          source?: string | null
          special_talents?: string | null
          stage?: string | null
          status?: string
          updated_at?: string
          verified?: boolean
          weekly_availability?: Json | null
          work_experience?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_postings: {
        Row: {
          created_at: string
          description: string
          id: string
          open: boolean
          owner_id: string
          pay_range: string
          posted_at: string
          role: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          open?: boolean
          owner_id: string
          pay_range?: string
          posted_at?: string
          role: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          open?: boolean
          owner_id?: string
          pay_range?: string
          posted_at?: string
          role?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          employee_id: string | null
          full_name: string
          id: string
          restaurant_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          full_name?: string
          id: string
          restaurant_name?: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          full_name?: string
          id?: string
          restaurant_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      applicant_confirm_interview_slot: {
        Args: { p_application_id: string; p_slot: string }
        Returns: undefined
      }
    }
    Enums: {
      user_role: "owner" | "employee"
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
      user_role: ["owner", "employee"],
    },
  },
} as const
