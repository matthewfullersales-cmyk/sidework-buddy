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
          assigned_to: string | null
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
          shadow_confirmed_at: string | null
          shadow_response_note: string | null
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
          assigned_to?: string | null
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
          shadow_confirmed_at?: string | null
          shadow_response_note?: string | null
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
          assigned_to?: string | null
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
          shadow_confirmed_at?: string | null
          shadow_response_note?: string | null
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
            foreignKeyName: "job_applications_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "restaurant_team_members"
            referencedColumns: ["id"]
          },
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
          restaurant_hours: Json | null
          restaurant_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          full_name?: string
          id: string
          restaurant_hours?: Json | null
          restaurant_name?: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          full_name?: string
          id?: string
          restaurant_hours?: Json | null
          restaurant_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_employees: {
        Row: {
          application_pitch: string | null
          applied_at: string | null
          approved_roles: string[]
          auth_user_id: string | null
          auto_approve_roles: string[]
          availability: string
          created_at: string
          email: string | null
          emergency_contact: Json | null
          first_name: string | null
          hired_from_application_id: string | null
          id: string
          invited_at: string
          last_name: string | null
          local_id: string | null
          name: string
          onboarding_started: boolean
          owner_id: string
          personal_info_complete: boolean
          phone: string | null
          photo_url: string | null
          position: string | null
          primary_role: string
          section: string | null
          seniority: number | null
          special_talents: string | null
          updated_at: string
          weekly_availability: Json | null
          work_experience: Json | null
        }
        Insert: {
          application_pitch?: string | null
          applied_at?: string | null
          approved_roles?: string[]
          auth_user_id?: string | null
          auto_approve_roles?: string[]
          availability?: string
          created_at?: string
          email?: string | null
          emergency_contact?: Json | null
          first_name?: string | null
          hired_from_application_id?: string | null
          id?: string
          invited_at?: string
          last_name?: string | null
          local_id?: string | null
          name?: string
          onboarding_started?: boolean
          owner_id: string
          personal_info_complete?: boolean
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          primary_role?: string
          section?: string | null
          seniority?: number | null
          special_talents?: string | null
          updated_at?: string
          weekly_availability?: Json | null
          work_experience?: Json | null
        }
        Update: {
          application_pitch?: string | null
          applied_at?: string | null
          approved_roles?: string[]
          auth_user_id?: string | null
          auto_approve_roles?: string[]
          availability?: string
          created_at?: string
          email?: string | null
          emergency_contact?: Json | null
          first_name?: string | null
          hired_from_application_id?: string | null
          id?: string
          invited_at?: string
          last_name?: string | null
          local_id?: string | null
          name?: string
          onboarding_started?: boolean
          owner_id?: string
          personal_info_complete?: boolean
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          primary_role?: string
          section?: string | null
          seniority?: number | null
          special_talents?: string | null
          updated_at?: string
          weekly_availability?: Json | null
          work_experience?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_employees_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_team_members: {
        Row: {
          auth_user_id: string | null
          can_manage_hiring: boolean
          can_manage_schedule: boolean
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          name: string
          owner_id: string
          phone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          can_manage_hiring?: boolean
          can_manage_schedule?: boolean
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          name: string
          owner_id: string
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          can_manage_hiring?: boolean
          can_manage_schedule?: boolean
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shift_trades: {
        Row: {
          approved_by: string | null
          auto_approved: boolean
          claimed_by: string | null
          created_at: string
          id: string
          local_id: string | null
          note: string | null
          owner_id: string
          posted_by: string | null
          resolved_at: string | null
          shift_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          auto_approved?: boolean
          claimed_by?: string | null
          created_at?: string
          id?: string
          local_id?: string | null
          note?: string | null
          owner_id: string
          posted_by?: string | null
          resolved_at?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          auto_approved?: boolean
          claimed_by?: string | null
          created_at?: string
          id?: string
          local_id?: string | null
          note?: string | null
          owner_id?: string
          posted_by?: string | null
          resolved_at?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_trades_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "restaurant_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_trades_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_trades_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "restaurant_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_trades_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          created_at: string
          date: string
          employee_id: string | null
          end_time: string
          id: string
          local_id: string | null
          notes: string | null
          owner_id: string
          position: string | null
          role: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          employee_id?: string | null
          end_time: string
          id?: string
          local_id?: string | null
          notes?: string | null
          owner_id: string
          position?: string | null
          role: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          employee_id?: string | null
          end_time?: string
          id?: string
          local_id?: string | null
          notes?: string | null
          owner_id?: string
          position?: string | null
          role?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "restaurant_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off_requests: {
        Row: {
          created_at: string
          decision_note: string | null
          employee_id: string | null
          end_date: string
          id: string
          local_id: string | null
          owner_id: string
          reason: string
          reason_type: string | null
          resolved_at: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_note?: string | null
          employee_id?: string | null
          end_date: string
          id?: string
          local_id?: string | null
          owner_id: string
          reason?: string
          reason_type?: string | null
          resolved_at?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_note?: string | null
          employee_id?: string | null
          end_date?: string
          id?: string
          local_id?: string | null
          owner_id?: string
          reason?: string
          reason_type?: string | null
          resolved_at?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "restaurant_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      applicant_confirm_shadow_shift: {
        Args: { p_application_id: string }
        Returns: undefined
      }
      applicant_decline_shadow_shift: {
        Args: { p_application_id: string; p_note: string }
        Returns: undefined
      }
      can_manage_hiring_for: { Args: { p_owner_id: string }; Returns: boolean }
      can_manage_schedule_for: {
        Args: { p_owner_id: string }
        Returns: boolean
      }
      claim_hire_invite: {
        Args: { p_application_id: string; p_employee_profile_id: string }
        Returns: undefined
      }
      claim_team_invite: {
        Args: { p_auth_user_id: string; p_team_member_id: string }
        Returns: undefined
      }
      employee_can_claim_role: {
        Args: { p_owner_id: string; p_role: string }
        Returns: boolean
      }
      get_effective_owner: {
        Args: never
        Returns: {
          acting: string
          can_manage_hiring: boolean
          can_manage_schedule: boolean
          owner_id: string
          restaurant_name: string
        }[]
      }
      get_employee_context: {
        Args: never
        Returns: {
          employee_id: string
          owner_id: string
          restaurant_name: string
        }[]
      }
      get_public_hire_invite: {
        Args: { p_application_id: string }
        Returns: {
          email: string
          first_name: string
          hired_employee_id: string
          id: string
          job_title: string
          last_name: string
          name: string
          phone: string
          restaurant_name: string
          role: string
          stage: string
        }[]
      }
      get_public_interview: {
        Args: { p_application_id: string }
        Returns: {
          assignee_email: string
          assignee_name: string
          assignee_phone: string
          first_name: string
          id: string
          interview_notes: string
          interview_type: string
          job_title: string
          name: string
          offered_slots: string[]
          phone: string
          restaurant_name: string
          role: string
          selected_slot: string
          stage: string
        }[]
      }
      get_public_shadow_shift: {
        Args: { p_application_id: string }
        Returns: {
          first_name: string
          id: string
          job_title: string
          name: string
          restaurant_name: string
          role: string
          shadow_confirmed_at: string
          shadow_response_note: string
          shadow_shift: Json
          stage: string
        }[]
      }
      get_public_team_invite: {
        Args: { p_team_member_id: string }
        Returns: {
          can_manage_hiring: boolean
          can_manage_schedule: boolean
          claimed: boolean
          first_name: string
          id: string
          name: string
          restaurant_name: string
        }[]
      }
      host_complete_interview: {
        Args: { p_application_id: string; p_notes: string }
        Returns: undefined
      }
      search_restaurants: {
        Args: { q: string }
        Returns: {
          owner_id: string
          restaurant_name: string
          slug: string
        }[]
      }
      slugify_name: { Args: { input: string }; Returns: string }
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
