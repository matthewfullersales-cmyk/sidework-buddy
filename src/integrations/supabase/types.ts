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
      employee_notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          employee_id: string
          id: string
          kind: string
          owner_id: string
          read_at: string | null
          title: string
          url: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          data?: Json
          employee_id: string
          id?: string
          kind: string
          owner_id: string
          read_at?: string | null
          title: string
          url?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          employee_id?: string
          id?: string
          kind?: string
          owner_id?: string
          read_at?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_notifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "restaurant_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          created_at: string
          id: string
          interview_type: string
          offered_slots: string[]
          owner_id: string
          person_id: string
          public_token: string
          selected_slot: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interview_type: string
          offered_slots?: string[]
          owner_id: string
          person_id: string
          public_token?: string
          selected_slot?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interview_type?: string
          offered_slots?: string[]
          owner_id?: string
          person_id?: string
          public_token?: string
          selected_slot?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
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
      menu_quiz_banks: {
        Row: {
          bank_version: number
          created_at: string
          owner_id: string
          questions: Json
          updated_at: string
        }
        Insert: {
          bank_version?: number
          created_at?: string
          owner_id: string
          questions: Json
          updated_at?: string
        }
        Update: {
          bank_version?: number
          created_at?: string
          owner_id?: string
          questions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          applied_at: string | null
          approved_roles: string[]
          archived: boolean
          auth_user_id: string | null
          auto_approve_roles: string[]
          created_at: string
          email: string | null
          emergency_contact: Json | null
          first_name: string
          hired_at: string | null
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          invited_at: string | null
          is_trainer_for_roles: string[]
          job_id: string | null
          joined_via: string | null
          last_name: string
          onboarding_started: boolean
          owner_id: string
          personal_info_complete: boolean
          phone: string | null
          primary_role: string | null
          push_opt_in: boolean
          resume_path: string | null
          source: string | null
          state: string
          state_changed_at: string
          submission_count: number
          updated_at: string
          weekly_availability: Json | null
          work_experience: Json | null
        }
        Insert: {
          applied_at?: string | null
          approved_roles?: string[]
          archived?: boolean
          auth_user_id?: string | null
          auto_approve_roles?: string[]
          created_at?: string
          email?: string | null
          emergency_contact?: Json | null
          first_name: string
          hired_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_at?: string | null
          is_trainer_for_roles?: string[]
          job_id?: string | null
          joined_via?: string | null
          last_name: string
          onboarding_started?: boolean
          owner_id: string
          personal_info_complete?: boolean
          phone?: string | null
          primary_role?: string | null
          push_opt_in?: boolean
          resume_path?: string | null
          source?: string | null
          state?: string
          state_changed_at?: string
          submission_count?: number
          updated_at?: string
          weekly_availability?: Json | null
          work_experience?: Json | null
        }
        Update: {
          applied_at?: string | null
          approved_roles?: string[]
          archived?: boolean
          auth_user_id?: string | null
          auto_approve_roles?: string[]
          created_at?: string
          email?: string | null
          emergency_contact?: Json | null
          first_name?: string
          hired_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_at?: string | null
          is_trainer_for_roles?: string[]
          job_id?: string | null
          joined_via?: string | null
          last_name?: string
          onboarding_started?: boolean
          owner_id?: string
          personal_info_complete?: boolean
          phone?: string | null
          primary_role?: string | null
          push_opt_in?: boolean
          resume_path?: string | null
          source?: string | null
          state?: string
          state_changed_at?: string
          submission_count?: number
          updated_at?: string
          weekly_availability?: Json | null
          work_experience?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "people_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_info: Json | null
          created_at: string
          employee_id: string | null
          full_name: string
          id: string
          menu_test_config: Json
          prior_slugs: string[]
          restaurant_hours: Json | null
          restaurant_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          shadow_packet: Json | null
          slug: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_status: string
          updated_at: string
        }
        Insert: {
          business_info?: Json | null
          created_at?: string
          employee_id?: string | null
          full_name?: string
          id: string
          menu_test_config?: Json
          prior_slugs?: string[]
          restaurant_hours?: Json | null
          restaurant_name?: string | null
          role: Database["public"]["Enums"]["user_role"]
          shadow_packet?: Json | null
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          business_info?: Json | null
          created_at?: string
          employee_id?: string | null
          full_name?: string
          id?: string
          menu_test_config?: Json
          prior_slugs?: string[]
          restaurant_hours?: Json | null
          restaurant_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          shadow_packet?: Json | null
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          employee_id: string
          endpoint: string
          id: string
          last_used_at: string
          owner_id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          employee_id: string
          endpoint: string
          id?: string
          last_used_at?: string
          owner_id: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          employee_id?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          owner_id?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "restaurant_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          created_at: string
          current_index: number
          current_served_at: string | null
          distraction_flagged: boolean
          employee_id: string
          expires_at: string
          id: string
          is_preview: boolean
          owner_id: string
          passed: boolean | null
          question_count: number
          questions: Json
          responses: Json
          resume_counts: Json
          score: number | null
          submitted_at: string | null
          updated_at: string
          video_id: string
        }
        Insert: {
          created_at?: string
          current_index?: number
          current_served_at?: string | null
          distraction_flagged?: boolean
          employee_id: string
          expires_at?: string
          id?: string
          is_preview?: boolean
          owner_id: string
          passed?: boolean | null
          question_count: number
          questions: Json
          responses?: Json
          resume_counts?: Json
          score?: number | null
          submitted_at?: string | null
          updated_at?: string
          video_id: string
        }
        Update: {
          created_at?: string
          current_index?: number
          current_served_at?: string | null
          distraction_flagged?: boolean
          employee_id?: string
          expires_at?: string
          id?: string
          is_preview?: boolean
          owner_id?: string
          passed?: boolean | null
          question_count?: number
          questions?: Json
          responses?: Json
          resume_counts?: Json
          score?: number | null
          submitted_at?: string | null
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "restaurant_employees"
            referencedColumns: ["id"]
          },
        ]
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
          invite_token: string | null
          invited_at: string
          join_status: string
          joined_via: string | null
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
          push_opt_in: boolean
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
          invite_token?: string | null
          invited_at?: string
          join_status?: string
          joined_via?: string | null
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
          push_opt_in?: boolean
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
          invite_token?: string | null
          invited_at?: string
          join_status?: string
          joined_via?: string | null
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
          push_opt_in?: boolean
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
      shadow_shifts: {
        Row: {
          arrival_time: string
          confirmed_at: string | null
          created_at: string
          id: string
          note: string | null
          owner_id: string
          person_id: string
          role: string
          shift_date: string
          status: string
          trainer_person_id: string | null
          updated_at: string
        }
        Insert: {
          arrival_time: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          owner_id: string
          person_id: string
          role: string
          shift_date: string
          status?: string
          trainer_person_id?: string | null
          updated_at?: string
        }
        Update: {
          arrival_time?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          person_id?: string
          role?: string
          shift_date?: string
          status?: string
          trainer_person_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shadow_shifts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shadow_shifts_trainer_person_id_fkey"
            columns: ["trainer_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "people"
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
            referencedRelation: "people"
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
            referencedRelation: "people"
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
            referencedRelation: "people"
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
      training_progress: {
        Row: {
          attempts: number
          bank_version: number | null
          completed_at: string | null
          created_at: string
          distraction_flagged: boolean
          employee_id: string
          id: string
          locked_out: boolean
          owner_id: string
          passed: boolean
          quiz_score: number | null
          updated_at: string
          video_id: string
          watched_sec: number
        }
        Insert: {
          attempts?: number
          bank_version?: number | null
          completed_at?: string | null
          created_at?: string
          distraction_flagged?: boolean
          employee_id: string
          id?: string
          locked_out?: boolean
          owner_id: string
          passed?: boolean
          quiz_score?: number | null
          updated_at?: string
          video_id: string
          watched_sec?: number
        }
        Update: {
          attempts?: number
          bank_version?: number | null
          completed_at?: string | null
          created_at?: string
          distraction_flagged?: boolean
          employee_id?: string
          id?: string
          locked_out?: boolean
          owner_id?: string
          passed?: boolean
          quiz_score?: number | null
          updated_at?: string
          video_id?: string
          watched_sec?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_progress_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "restaurant_employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_restaurant_slug: {
        Args: { p_base: string; p_owner_id: string }
        Returns: string
      }
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
      approve_pending_person: {
        Args: { p_person_id: string }
        Returns: undefined
      }
      can_manage_hiring_for: { Args: { p_owner_id: string }; Returns: boolean }
      can_manage_schedule_for: {
        Args: { p_owner_id: string }
        Returns: boolean
      }
      claim_employee_invite: {
        Args: { p_auth_user_id: string; p_patch: Json; p_token: string }
        Returns: undefined
      }
      claim_hire_invite: {
        Args: { p_application_id: string; p_employee_profile_id: string }
        Returns: undefined
      }
      claim_person_invite: { Args: { p_token: string }; Returns: string }
      confirm_interview_slot: {
        Args: { p_slot: string; p_token: string }
        Returns: {
          address: string
          first_name: string
          id: string
          interview_type: string
          offered_slots: string[]
          restaurant_name: string
          restaurant_phone: string
          selected_slot: string
          status: string
        }[]
      }
      create_interview_offer: {
        Args: { p_person_id: string; p_slots: string[]; p_type: string }
        Returns: {
          created_at: string
          id: string
          interview_type: string
          offered_slots: string[]
          owner_id: string
          person_id: string
          public_token: string
          selected_slot: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "interviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_person_invite: {
        Args: {
          p_email: string
          p_first_name: string
          p_last_name: string
          p_owner_id: string
          p_phone: string
          p_primary_role: string
        }
        Returns: {
          invite_token: string
          matched_existing: boolean
          person_id: string
        }[]
      }
      create_shadow_shift: {
        Args: {
          p_arrival_time: string
          p_note?: string
          p_person_id: string
          p_role: string
          p_shift_date: string
          p_trainer_person_id?: string
        }
        Returns: {
          arrival_time: string
          confirmed_at: string | null
          created_at: string
          id: string
          note: string | null
          owner_id: string
          person_id: string
          role: string
          shift_date: string
          status: string
          trainer_person_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "shadow_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decline_pending_person: {
        Args: { p_person_id: string }
        Returns: undefined
      }
      employee_can_claim_role: {
        Args: { p_owner_id: string; p_role: string }
        Returns: boolean
      }
      ensure_my_restaurant_slug: { Args: never; Returns: string }
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
      get_menu_bank_meta: {
        Args: { p_owner_id: string }
        Returns: {
          bank_version: number
          dessert_count: number
          drink_count: number
          food_count: number
          updated_at: string
        }[]
      }
      get_menu_test_config: { Args: { p_owner_id: string }; Returns: Json }
      get_public_employee_invite: {
        Args: { p_token: string }
        Returns: {
          claimed: boolean
          email: string
          first_name: string
          id: string
          last_name: string
          name: string
          phone: string
          primary_role: string
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
      get_public_interview_by_token: {
        Args: { p_token: string }
        Returns: {
          address: string
          first_name: string
          id: string
          interview_type: string
          offered_slots: string[]
          restaurant_name: string
          restaurant_phone: string
          selected_slot: string
          status: string
        }[]
      }
      get_public_job_restaurant: {
        Args: { p_job_id: string }
        Returns: {
          owner_id: string
          restaurant_name: string
        }[]
      }
      get_public_join_restaurant: {
        Args: { p_slug: string }
        Returns: {
          owner_id: string
          restaurant_name: string
        }[]
      }
      get_public_person_invite: {
        Args: { p_token: string }
        Returns: {
          claimed: boolean
          email: string
          expired: boolean
          first_name: string
          last_name: string
          phone: string
          primary_role: string
          restaurant_name: string
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
      get_restaurant_coworker_names: {
        Args: { p_owner_id: string }
        Returns: {
          employee_id: string
          first_name: string
        }[]
      }
      hire_person: {
        Args: { p_person_id: string; p_primary_role: string }
        Returns: {
          applied_at: string | null
          approved_roles: string[]
          archived: boolean
          auth_user_id: string | null
          auto_approve_roles: string[]
          created_at: string
          email: string | null
          emergency_contact: Json | null
          first_name: string
          hired_at: string | null
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          invited_at: string | null
          is_trainer_for_roles: string[]
          job_id: string | null
          joined_via: string | null
          last_name: string
          onboarding_started: boolean
          owner_id: string
          personal_info_complete: boolean
          phone: string | null
          primary_role: string | null
          push_opt_in: boolean
          resume_path: string | null
          source: string | null
          state: string
          state_changed_at: string
          submission_count: number
          updated_at: string
          weekly_availability: Json | null
          work_experience: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      host_complete_interview: {
        Args: { p_application_id: string; p_notes: string }
        Returns: undefined
      }
      join_restaurant_by_slug: {
        Args: { p_auth_user_id: string; p_patch: Json; p_slug: string }
        Returns: string
      }
      join_restaurant_by_slug_v2: {
        Args: {
          p_email: string
          p_first_name: string
          p_last_name: string
          p_phone: string
          p_primary_role: string
          p_slug: string
        }
        Returns: string
      }
      person_can_manage: { Args: { p_owner_id: string }; Returns: boolean }
      regenerate_person_invite: {
        Args: { p_person_id: string }
        Returns: string
      }
      search_restaurants: {
        Args: { q: string }
        Returns: {
          owner_id: string
          restaurant_name: string
          slug: string
        }[]
      }
      set_person_state: {
        Args: { p_new_state: string; p_person_id: string }
        Returns: {
          applied_at: string | null
          approved_roles: string[]
          archived: boolean
          auth_user_id: string | null
          auto_approve_roles: string[]
          created_at: string
          email: string | null
          emergency_contact: Json | null
          first_name: string
          hired_at: string | null
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          invited_at: string | null
          is_trainer_for_roles: string[]
          job_id: string | null
          joined_via: string | null
          last_name: string
          onboarding_started: boolean
          owner_id: string
          personal_info_complete: boolean
          phone: string | null
          primary_role: string | null
          push_opt_in: boolean
          resume_path: string | null
          source: string | null
          state: string
          state_changed_at: string
          submission_count: number
          updated_at: string
          weekly_availability: Json | null
          work_experience: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_restaurant_slug: { Args: { p_slug: string }; Returns: string }
      shift_is_on_trade_board: {
        Args: { p_owner_id: string; p_shift_id: string }
        Returns: boolean
      }
      slugify_name: { Args: { input: string }; Returns: string }
      submit_application: {
        Args: {
          p_email: string
          p_first_name: string
          p_job_id: string
          p_last_name: string
          p_owner_slug: string
          p_phone: string
          p_source: string
        }
        Returns: string
      }
      update_shadow_shift: {
        Args: {
          p_arrival_time: string
          p_id: string
          p_note?: string
          p_shift_date: string
          p_trainer_person_id?: string
        }
        Returns: {
          arrival_time: string
          confirmed_at: string | null
          created_at: string
          id: string
          note: string | null
          owner_id: string
          person_id: string
          role: string
          shift_date: string
          status: string
          trainer_person_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "shadow_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
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
