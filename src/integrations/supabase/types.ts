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
      accounts: {
        Row: {
          available_balance: number | null
          created_at: string
          currency: string | null
          current_balance: number | null
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          is_joint: boolean
          is_manual: boolean | null
          is_zero_balance: boolean
          joint_end_date: string | null
          joint_start_date: string | null
          mask: string | null
          name: string
          official_name: string | null
          ownership_pct: number | null
          plaid_account_id: string | null
          subtype: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          available_balance?: number | null
          created_at?: string
          currency?: string | null
          current_balance?: number | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_joint?: boolean
          is_manual?: boolean | null
          is_zero_balance?: boolean
          joint_end_date?: string | null
          joint_start_date?: string | null
          mask?: string | null
          name: string
          official_name?: string | null
          ownership_pct?: number | null
          plaid_account_id?: string | null
          subtype?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          available_balance?: number | null
          created_at?: string
          currency?: string | null
          current_balance?: number | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_joint?: boolean
          is_manual?: boolean | null
          is_zero_balance?: boolean
          joint_end_date?: string | null
          joint_start_date?: string | null
          mask?: string | null
          name?: string
          official_name?: string | null
          ownership_pct?: number | null
          plaid_account_id?: string | null
          subtype?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      amortization_schedules: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          end_date: string
          id: string
          is_active: boolean | null
          monthly_amount: number
          name: string
          start_date: string
          total_amount: number
          transaction_id: string | null
          type: Database["public"]["Enums"]["amortization_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          monthly_amount: number
          name: string
          start_date: string
          total_amount: number
          transaction_id?: string | null
          type: Database["public"]["Enums"]["amortization_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          monthly_amount?: number
          name?: string
          start_date?: string
          total_amount?: number
          transaction_id?: string | null
          type?: Database["public"]["Enums"]["amortization_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "amortization_schedules_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          created_at: string
          id: string
          is_liability: boolean | null
          name: string
          notes: string | null
          type: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_liability?: boolean | null
          name: string
          notes?: string | null
          type: string
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          is_liability?: boolean | null
          name?: string
          notes?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      auto_amortize_categories: {
        Row: {
          amortize_months: number
          category_name: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          amortize_months?: number
          category_name: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          amortize_months?: number
          category_name?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      balance_sheet_snapshots: {
        Row: {
          created_at: string
          current_assets: number
          current_liabilities: number
          fixed_assets: number
          id: string
          long_term_liabilities: number
          snapshot_date: string
          total_assets: number
          total_equity: number
          total_liabilities: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_assets?: number
          current_liabilities?: number
          fixed_assets?: number
          id?: string
          long_term_liabilities?: number
          snapshot_date: string
          total_assets?: number
          total_equity?: number
          total_liabilities?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_assets?: number
          current_liabilities?: number
          fixed_assets?: number
          id?: string
          long_term_liabilities?: number
          snapshot_date?: string
          total_assets?: number
          total_equity?: number
          total_liabilities?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      benefit_usage: {
        Row: {
          amount_used: number
          benefit_id: string
          created_at: string
          id: string
          notes: string | null
          period_end: string
          period_start: string
          transaction_id: string | null
          usage_date: string
          user_id: string
        }
        Insert: {
          amount_used?: number
          benefit_id: string
          created_at?: string
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          transaction_id?: string | null
          usage_date?: string
          user_id: string
        }
        Update: {
          amount_used?: number
          benefit_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          transaction_id?: string | null
          usage_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_usage_benefit_id_fkey"
            columns: ["benefit_id"]
            isOneToOne: false
            referencedRelation: "credit_card_benefits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_usage_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          budget_scope: string
          category: string
          color: string | null
          created_at: string
          id: string
          is_active: boolean | null
          is_joint: boolean | null
          monthly_limit: number
          period: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_scope?: string
          category: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_joint?: boolean | null
          monthly_limit: number
          period?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_scope?: string
          category?: string
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_joint?: boolean | null
          monthly_limit?: number
          period?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ceo_calendar_events: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          end_time: string | null
          event_date: string
          google_event_id: string | null
          id: string
          is_all_day: boolean
          is_joint: boolean | null
          recurrence: string | null
          start_time: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_date: string
          google_event_id?: string | null
          id?: string
          is_all_day?: boolean
          is_joint?: boolean | null
          recurrence?: string | null
          start_time?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_date?: string
          google_event_id?: string | null
          id?: string
          is_all_day?: boolean
          is_joint?: boolean | null
          recurrence?: string | null
          start_time?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ceo_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_joint: boolean | null
          priority: string
          sort_order: number | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_joint?: boolean | null
          priority?: string
          sort_order?: number | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_joint?: boolean | null
          priority?: string
          sort_order?: number | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cogs_categories: {
        Row: {
          category_name: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          category_name: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          category_name?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          birthday: string | null
          contact_type: string
          created_at: string
          display_name: string
          email: string | null
          first_name: string | null
          id: string
          last_contacted_at: string | null
          last_name: string | null
          native_contact_id: string | null
          notes: string | null
          organization: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birthday?: string | null
          contact_type?: string
          created_at?: string
          display_name: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_contacted_at?: string | null
          last_name?: string | null
          native_contact_id?: string | null
          notes?: string | null
          organization?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birthday?: string | null
          contact_type?: string
          created_at?: string
          display_name?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_contacted_at?: string | null
          last_name?: string | null
          native_contact_id?: string | null
          notes?: string | null
          organization?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_calendar: {
        Row: {
          content_type: string
          created_at: string
          id: string
          notes: string | null
          platform: string | null
          scheduled_date: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          id?: string
          notes?: string | null
          platform?: string | null
          scheduled_date?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          notes?: string | null
          platform?: string | null
          scheduled_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credential_vault: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
          url: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      credit_card_benefits: {
        Row: {
          benefit_name: string
          benefit_period: string
          benefit_type: string
          benefit_value: number
          category_match: string | null
          created_at: string
          credit_card_id: string
          id: string
          is_active: boolean | null
          merchant_keywords: string[] | null
          notes: string | null
          reset_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          benefit_name: string
          benefit_period?: string
          benefit_type: string
          benefit_value?: number
          category_match?: string | null
          created_at?: string
          credit_card_id: string
          id?: string
          is_active?: boolean | null
          merchant_keywords?: string[] | null
          notes?: string | null
          reset_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          benefit_name?: string
          benefit_period?: string
          benefit_type?: string
          benefit_value?: number
          category_match?: string | null
          created_at?: string
          credit_card_id?: string
          id?: string
          is_active?: boolean | null
          merchant_keywords?: string[] | null
          notes?: string | null
          reset_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_benefits_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          account_id: string | null
          annual_fee: number | null
          annual_fee_due_date: string | null
          card_issuer: string | null
          card_name: string
          created_at: string
          id: string
          payment_due_day: number | null
          statement_close_day: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          annual_fee?: number | null
          annual_fee_due_date?: string | null
          card_issuer?: string | null
          card_name: string
          created_at?: string
          id?: string
          payment_due_day?: number | null
          statement_close_day?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          annual_fee?: number | null
          annual_fee_due_date?: string | null
          card_issuer?: string | null
          card_name?: string
          created_at?: string
          id?: string
          payment_due_day?: number | null
          statement_close_day?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_health_metrics: {
        Row: {
          active_energy_cal: number | null
          avg_heart_rate: number | null
          bedtime: string | null
          calories_consumed: number | null
          carbs_grams: number | null
          created_at: string
          distance_km: number | null
          fat_grams: number | null
          id: string
          max_heart_rate: number | null
          metric_date: string
          notes: string | null
          protein_grams: number | null
          resting_heart_rate: number | null
          sleep_hours: number | null
          sleep_quality: string | null
          source: string
          steps: number | null
          updated_at: string
          user_id: string
          wake_time: string | null
          water_ml: number | null
        }
        Insert: {
          active_energy_cal?: number | null
          avg_heart_rate?: number | null
          bedtime?: string | null
          calories_consumed?: number | null
          carbs_grams?: number | null
          created_at?: string
          distance_km?: number | null
          fat_grams?: number | null
          id?: string
          max_heart_rate?: number | null
          metric_date: string
          notes?: string | null
          protein_grams?: number | null
          resting_heart_rate?: number | null
          sleep_hours?: number | null
          sleep_quality?: string | null
          source?: string
          steps?: number | null
          updated_at?: string
          user_id: string
          wake_time?: string | null
          water_ml?: number | null
        }
        Update: {
          active_energy_cal?: number | null
          avg_heart_rate?: number | null
          bedtime?: string | null
          calories_consumed?: number | null
          carbs_grams?: number | null
          created_at?: string
          distance_km?: number | null
          fat_grams?: number | null
          id?: string
          max_heart_rate?: number | null
          metric_date?: string
          notes?: string | null
          protein_grams?: number | null
          resting_heart_rate?: number | null
          sleep_hours?: number | null
          sleep_quality?: string | null
          source?: string
          steps?: number | null
          updated_at?: string
          user_id?: string
          wake_time?: string | null
          water_ml?: number | null
        }
        Relationships: []
      }
      device_inventory: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          serial_number: string | null
          type: string
          updated_at: string
          user_id: string
          warranty_end: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          type?: string
          updated_at?: string
          user_id: string
          warranty_end?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          warranty_end?: string | null
        }
        Relationships: []
      }
      digital_subscriptions: {
        Row: {
          billing_cycle: string
          category: string
          cost: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          next_billing_date: string | null
          notes: string | null
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          billing_cycle?: string
          category?: string
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          next_billing_date?: string | null
          notes?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          billing_cycle?: string
          category?: string
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          next_billing_date?: string | null
          notes?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          end_date: string | null
          event_date: string | null
          id: string
          is_active: boolean | null
          is_joint: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          event_date?: string | null
          id?: string
          is_active?: boolean | null
          is_joint?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          event_date?: string | null
          id?: string
          is_active?: boolean | null
          is_joint?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_goals: {
        Row: {
          category: string
          color: string | null
          created_at: string
          current_amount: number
          deadline: string | null
          icon: string | null
          id: string
          is_active: boolean
          last_milestone_pct: number | null
          linked_account_id: string | null
          name: string
          target_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          color?: string | null
          created_at?: string
          current_amount?: number
          deadline?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          last_milestone_pct?: number | null
          linked_account_id?: string | null
          name: string
          target_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          current_amount?: number
          deadline?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          last_milestone_pct?: number | null
          linked_account_id?: string | null
          name?: string
          target_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_goals_linked_account_id_fkey"
            columns: ["linked_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      gifts: {
        Row: {
          amount: number | null
          contact_id: string | null
          created_at: string
          description: string
          direction: string
          gift_date: string
          id: string
          notes: string | null
          occasion: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          contact_id?: string | null
          created_at?: string
          description: string
          direction?: string
          gift_date?: string
          id?: string
          notes?: string | null
          occasion?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          contact_id?: string | null
          created_at?: string
          description?: string
          direction?: string
          gift_date?: string
          id?: string
          notes?: string | null
          occasion?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gifts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gifts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          calendar_id: string | null
          created_at: string
          id: string
          last_synced_at: string | null
          refresh_token: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          calendar_id?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          refresh_token: string
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          calendar_id?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      grocery_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_checked: boolean | null
          meal_plan_id: string | null
          name: string
          quantity: number | null
          recipe_id: string | null
          unit: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_checked?: boolean | null
          meal_plan_id?: string | null
          name: string
          quantity?: number | null
          recipe_id?: string | null
          unit?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_checked?: boolean | null
          meal_plan_id?: string | null
          name?: string
          quantity?: number | null
          recipe_id?: string | null
          unit?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grocery_items_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_holdings: {
        Row: {
          account_id: string | null
          asset_class: string
          cost_basis: number
          created_at: string
          current_value: number
          id: string
          name: string
          notes: string | null
          quantity: number
          ticker: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          asset_class?: string
          cost_basis?: number
          created_at?: string
          current_value?: number
          id?: string
          name: string
          notes?: string | null
          quantity?: number
          ticker?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          asset_class?: string
          cost_basis?: number
          created_at?: string
          current_value?: number
          id?: string
          name?: string
          notes?: string | null
          quantity?: number
          ticker?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_holdings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_entries: {
        Row: {
          created_at: string
          custom_meal_name: string | null
          day_of_week: number
          id: string
          meal_plan_id: string
          meal_type: string
          notes: string | null
          recipe_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_meal_name?: string | null
          day_of_week: number
          id?: string
          meal_plan_id: string
          meal_type?: string
          notes?: string | null
          recipe_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          custom_meal_name?: string | null
          day_of_week?: number
          id?: string
          meal_plan_id?: string
          meal_type?: string
          notes?: string | null
          recipe_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          id: string
          is_joint: boolean | null
          name: string | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_joint?: boolean | null
          name?: string | null
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          is_joint?: boolean | null
          name?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      networking_log: {
        Row: {
          company: string | null
          contact_name: string
          created_at: string
          follow_up_date: string | null
          id: string
          meeting_date: string
          met_at: string | null
          notes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          contact_name: string
          created_at?: string
          follow_up_date?: string | null
          id?: string
          meeting_date?: string
          met_at?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          contact_name?: string
          created_at?: string
          follow_up_date?: string | null
          id?: string
          meeting_date?: string
          met_at?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      non_gaap_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      partner_links: {
        Row: {
          created_at: string
          id: string
          linked_at: string | null
          pairing_code: string
          partner_user_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          linked_at?: string | null
          pairing_code: string
          partner_user_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          linked_at?: string | null
          pairing_code?: string
          partner_user_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      partner_profiles: {
        Row: {
          created_at: string
          default_ownership_pct: number
          id: string
          partner_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_ownership_pct?: number
          id?: string
          partner_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_ownership_pct?: number
          id?: string
          partner_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plaid_items: {
        Row: {
          access_token: string
          created_at: string
          cursor: string | null
          id: string
          institution_id: string | null
          institution_name: string | null
          item_id: string
          last_synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          cursor?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          item_id: string
          last_synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          cursor?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          item_id?: string
          last_synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          show_partner_mode: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          show_partner_mode?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          show_partner_mode?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          name: string
          quantity: number | null
          recipe_id: string
          sort_order: number | null
          unit: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          quantity?: number | null
          recipe_id: string
          sort_order?: number | null
          unit?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          quantity?: number | null
          recipe_id?: string
          sort_order?: number | null
          unit?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          calories_per_serving: number | null
          carbs_grams: number | null
          cook_time_minutes: number | null
          created_at: string
          description: string | null
          fat_grams: number | null
          id: string
          instructions: string | null
          is_favorite: boolean | null
          name: string
          prep_time_minutes: number | null
          protein_grams: number | null
          servings: number | null
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calories_per_serving?: number | null
          carbs_grams?: number | null
          cook_time_minutes?: number | null
          created_at?: string
          description?: string | null
          fat_grams?: number | null
          id?: string
          instructions?: string | null
          is_favorite?: boolean | null
          name: string
          prep_time_minutes?: number | null
          protein_grams?: number | null
          servings?: number | null
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calories_per_serving?: number | null
          carbs_grams?: number | null
          cook_time_minutes?: number | null
          created_at?: string
          description?: string | null
          fat_grams?: number | null
          id?: string
          instructions?: string | null
          is_favorite?: boolean | null
          name?: string
          prep_time_minutes?: number | null
          protein_grams?: number | null
          servings?: number | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_transactions: {
        Row: {
          category: string | null
          created_at: string
          expected_amount: number
          frequency: string
          id: string
          is_active: boolean
          is_auto_detected: boolean
          last_amount: number | null
          last_seen_date: string | null
          merchant_name: string | null
          name: string
          next_expected_date: string | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          expected_amount: number
          frequency?: string
          id?: string
          is_active?: boolean
          is_auto_detected?: boolean
          last_amount?: number | null
          last_seen_date?: string | null
          merchant_name?: string | null
          name: string
          next_expected_date?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          expected_amount?: number
          frequency?: string
          id?: string
          is_active?: boolean
          is_auto_detected?: boolean
          last_amount?: number | null
          last_seen_date?: string | null
          merchant_name?: string | null
          name?: string
          next_expected_date?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_accounts: {
        Row: {
          created_at: string
          follower_count: number
          handle: string | null
          id: string
          last_updated: string
          platform: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          follower_count?: number
          handle?: string | null
          id?: string
          last_updated?: string
          platform: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          follower_count?: number
          handle?: string | null
          id?: string
          last_updated?: string
          platform?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transaction_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      transaction_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_offsets: {
        Row: {
          created_at: string
          id: string
          offset_transaction_id: string
          parent_transaction_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          offset_transaction_id: string
          parent_transaction_id: string
        }
        Update: {
          created_at?: string
          id?: string
          offset_transaction_id?: string
          parent_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_offsets_offset_transaction_id_fkey"
            columns: ["offset_transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_offsets_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_rules: {
        Row: {
          amortize_months: number | null
          amortize_type: string | null
          cash_flow_type: string | null
          category: string | null
          created_at: string
          id: string
          income_type: string | null
          is_active: boolean | null
          is_one_time_expense: boolean | null
          match_text: string
          match_type: string
          name: string
          priority: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amortize_months?: number | null
          amortize_type?: string | null
          cash_flow_type?: string | null
          category?: string | null
          created_at?: string
          id?: string
          income_type?: string | null
          is_active?: boolean | null
          is_one_time_expense?: boolean | null
          match_text: string
          match_type?: string
          name: string
          priority?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amortize_months?: number | null
          amortize_type?: string | null
          cash_flow_type?: string | null
          category?: string | null
          created_at?: string
          id?: string
          income_type?: string | null
          is_active?: boolean | null
          is_one_time_expense?: boolean | null
          match_text?: string
          match_type?: string
          name?: string
          priority?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string | null
          account_name: string | null
          amount: number
          cash_flow_type:
            | Database["public"]["Enums"]["cash_flow_category"]
            | null
          category: string | null
          created_at: string
          date: string
          id: string
          income_type: string | null
          is_amortized: boolean | null
          is_non_gaap_adjustment: boolean | null
          is_one_time_expense: boolean | null
          is_transfer_exception: boolean | null
          linked_transfer_id: string | null
          merchant_name: string | null
          name: string
          needs_review: boolean
          non_gaap_category: string | null
          notes: string | null
          ownership_pct: number | null
          pending: boolean | null
          plaid_transaction_id: string | null
          recognition_date: string | null
          subcategory: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          amount: number
          cash_flow_type?:
            | Database["public"]["Enums"]["cash_flow_category"]
            | null
          category?: string | null
          created_at?: string
          date: string
          id?: string
          income_type?: string | null
          is_amortized?: boolean | null
          is_non_gaap_adjustment?: boolean | null
          is_one_time_expense?: boolean | null
          is_transfer_exception?: boolean | null
          linked_transfer_id?: string | null
          merchant_name?: string | null
          name: string
          needs_review?: boolean
          non_gaap_category?: string | null
          notes?: string | null
          ownership_pct?: number | null
          pending?: boolean | null
          plaid_transaction_id?: string | null
          recognition_date?: string | null
          subcategory?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          amount?: number
          cash_flow_type?:
            | Database["public"]["Enums"]["cash_flow_category"]
            | null
          category?: string | null
          created_at?: string
          date?: string
          id?: string
          income_type?: string | null
          is_amortized?: boolean | null
          is_non_gaap_adjustment?: boolean | null
          is_one_time_expense?: boolean | null
          is_transfer_exception?: boolean | null
          linked_transfer_id?: string | null
          merchant_name?: string | null
          name?: string
          needs_review?: boolean
          non_gaap_category?: string | null
          notes?: string | null
          ownership_pct?: number | null
          pending?: boolean | null
          plaid_transaction_id?: string | null
          recognition_date?: string | null
          subcategory?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_linked_transfer_id_fkey"
            columns: ["linked_transfer_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          target_price: number | null
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          target_price?: number | null
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          target_price?: number | null
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_exercises: {
        Row: {
          created_at: string
          distance: number | null
          distance_unit: string | null
          duration_seconds: number | null
          id: string
          name: string
          reps: number | null
          sets: number | null
          sort_order: number | null
          user_id: string
          weight: number | null
          weight_unit: string | null
          workout_id: string
        }
        Insert: {
          created_at?: string
          distance?: number | null
          distance_unit?: string | null
          duration_seconds?: number | null
          id?: string
          name: string
          reps?: number | null
          sets?: number | null
          sort_order?: number | null
          user_id: string
          weight?: number | null
          weight_unit?: string | null
          workout_id: string
        }
        Update: {
          created_at?: string
          distance?: number | null
          distance_unit?: string | null
          duration_seconds?: number | null
          id?: string
          name?: string
          reps?: number | null
          sets?: number | null
          sort_order?: number | null
          user_id?: string
          weight?: number | null
          weight_unit?: string | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          calories_burned: number | null
          created_at: string
          duration_minutes: number | null
          id: string
          name: string
          notes: string | null
          source: string | null
          updated_at: string
          user_id: string
          workout_date: string
          workout_type: string
        }
        Insert: {
          calories_burned?: number | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          name: string
          notes?: string | null
          source?: string | null
          updated_at?: string
          user_id: string
          workout_date?: string
          workout_type?: string
        }
        Update: {
          calories_burned?: number | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          name?: string
          notes?: string | null
          source?: string | null
          updated_at?: string
          user_id?: string
          workout_date?: string
          workout_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      google_calendar_status: {
        Row: {
          calendar_id: string | null
          created_at: string | null
          last_synced_at: string | null
          user_id: string | null
        }
        Insert: {
          calendar_id?: string | null
          created_at?: string | null
          last_synced_at?: string | null
          user_id?: string | null
        }
        Update: {
          calendar_id?: string | null
          created_at?: string | null
          last_synced_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      plaid_items_safe: {
        Row: {
          created_at: string | null
          cursor: string | null
          id: string | null
          institution_id: string | null
          institution_name: string | null
          item_id: string | null
          last_synced_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          cursor?: string | null
          id?: string | null
          institution_id?: string | null
          institution_name?: string | null
          item_id?: string | null
          last_synced_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          cursor?: string | null
          id?: string | null
          institution_id?: string | null
          institution_name?: string | null
          item_id?: string | null
          last_synced_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_partner_user_id: { Args: { _user_id: string }; Returns: string }
      redeem_partner_code: { Args: { _code: string }; Returns: Json }
    }
    Enums: {
      amortization_type:
        | "prepaid_expense"
        | "capital_expenditure"
        | "intangible_asset"
        | "deferred_income"
      cash_flow_category: "operating" | "investing" | "financing" | "other"
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
      amortization_type: [
        "prepaid_expense",
        "capital_expenditure",
        "intangible_asset",
        "deferred_income",
      ],
      cash_flow_category: ["operating", "investing", "financing", "other"],
    },
  },
} as const

