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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      account_movements: {
        Row: {
          account_id: string
          amount: number
          category: string | null
          client_id: string | null
          created_at: string
          date: string
          description: string
          financial_transaction_id: string | null
          id: string
          notes: string | null
          related_account_id: string | null
          supplier_id: string | null
          type: string
          work_order_id: string | null
        }
        Insert: {
          account_id: string
          amount: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          date?: string
          description: string
          financial_transaction_id?: string | null
          id?: string
          notes?: string | null
          related_account_id?: string | null
          supplier_id?: string | null
          type: string
          work_order_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          date?: string
          description?: string
          financial_transaction_id?: string | null
          id?: string
          notes?: string | null
          related_account_id?: string | null
          supplier_id?: string | null
          type?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_movements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_movements_related_account_id_fkey"
            columns: ["related_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          cpf_cnpj: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      commissions: {
        Row: {
          amount: number
          created_at: string
          employee_id: string
          id: string
          paid: boolean
          paid_date: string | null
          percentage: number | null
          work_order_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          employee_id: string
          id?: string
          paid?: boolean
          paid_date?: string | null
          percentage?: number | null
          work_order_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          employee_id?: string
          id?: string
          paid?: boolean
          paid_date?: string | null
          percentage?: number | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_production"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_absences: {
        Row: {
          calculated_value: number
          created_at: string
          daily_rate: number
          date: string
          day_quantity: number
          employee_id: string
          id: string
          month_ref: string
          reason: string | null
          weekly_closing_id: string | null
        }
        Insert: {
          calculated_value?: number
          created_at?: string
          daily_rate?: number
          date: string
          day_quantity?: number
          employee_id: string
          id?: string
          month_ref: string
          reason?: string | null
          weekly_closing_id?: string | null
        }
        Update: {
          calculated_value?: number
          created_at?: string
          daily_rate?: number
          date?: string
          day_quantity?: number
          employee_id?: string
          id?: string
          month_ref?: string
          reason?: string | null
          weekly_closing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_absences_weekly_closing_id_fkey"
            columns: ["weekly_closing_id"]
            isOneToOne: false
            referencedRelation: "weekly_closings"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_advances: {
        Row: {
          amount: number
          created_at: string
          date: string
          description: string | null
          employee_id: string
          id: string
          month_ref: string
          type: string
          weekly_closing_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          description?: string | null
          employee_id: string
          id?: string
          month_ref: string
          type?: string
          weekly_closing_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          description?: string | null
          employee_id?: string
          id?: string
          month_ref?: string
          type?: string
          weekly_closing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_advances_weekly_closing_id_fkey"
            columns: ["weekly_closing_id"]
            isOneToOne: false
            referencedRelation: "weekly_closings"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          date: string
          description: string | null
          employee_id: string
          id: string
          month_ref: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          date?: string
          description?: string | null
          employee_id: string
          id?: string
          month_ref: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          description?: string | null
          employee_id?: string
          id?: string
          month_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_expenses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_holidays: {
        Row: {
          calculated_value: number
          created_at: string
          daily_rate: number
          date: string
          day_quantity: number
          description: string | null
          employee_id: string
          holiday_name: string
          hours: number
          id: string
          month_ref: string
          weekly_closing_id: string | null
        }
        Insert: {
          calculated_value?: number
          created_at?: string
          daily_rate?: number
          date: string
          day_quantity?: number
          description?: string | null
          employee_id: string
          holiday_name: string
          hours?: number
          id?: string
          month_ref: string
          weekly_closing_id?: string | null
        }
        Update: {
          calculated_value?: number
          created_at?: string
          daily_rate?: number
          date?: string
          day_quantity?: number
          description?: string | null
          employee_id?: string
          holiday_name?: string
          hours?: number
          id?: string
          month_ref?: string
          weekly_closing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_holidays_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_holidays_weekly_closing_id_fkey"
            columns: ["weekly_closing_id"]
            isOneToOne: false
            referencedRelation: "weekly_closings"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_overtime: {
        Row: {
          calculated_value: number
          created_at: string
          date: string
          description: string | null
          employee_id: string
          hours: number
          id: string
          month_ref: string
          percentage: number
          weekly_closing_id: string | null
        }
        Insert: {
          calculated_value?: number
          created_at?: string
          date: string
          description?: string | null
          employee_id: string
          hours: number
          id?: string
          month_ref: string
          percentage?: number
          weekly_closing_id?: string | null
        }
        Update: {
          calculated_value?: number
          created_at?: string
          date?: string
          description?: string | null
          employee_id?: string
          hours?: number
          id?: string
          month_ref?: string
          percentage?: number
          weekly_closing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_overtime_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_overtime_weekly_closing_id_fkey"
            columns: ["weekly_closing_id"]
            isOneToOne: false
            referencedRelation: "weekly_closings"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_saturdays: {
        Row: {
          calculated_value: number
          created_at: string
          date: string
          description: string | null
          employee_id: string
          hours: number
          id: string
          month_ref: string
          weekly_closing_id: string | null
        }
        Insert: {
          calculated_value?: number
          created_at?: string
          date: string
          description?: string | null
          employee_id: string
          hours: number
          id?: string
          month_ref: string
          weekly_closing_id?: string | null
        }
        Update: {
          calculated_value?: number
          created_at?: string
          date?: string
          description?: string | null
          employee_id?: string
          hours?: number
          id?: string
          month_ref?: string
          weekly_closing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_saturdays_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_saturdays_weekly_closing_id_fkey"
            columns: ["weekly_closing_id"]
            isOneToOne: false
            referencedRelation: "weekly_closings"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_vacations: {
        Row: {
          base_salary: number
          constitutional_third: number
          created_at: string
          days: number
          employee_id: string
          end_date: string
          financial_transaction_id: string | null
          id: string
          notes: string | null
          reference_period: string | null
          start_date: string
          total_value: number
          vacation_value: number
        }
        Insert: {
          base_salary?: number
          constitutional_third?: number
          created_at?: string
          days: number
          employee_id: string
          end_date: string
          financial_transaction_id?: string | null
          id?: string
          notes?: string | null
          reference_period?: string | null
          start_date: string
          total_value?: number
          vacation_value?: number
        }
        Update: {
          base_salary?: number
          constitutional_third?: number
          created_at?: string
          days?: number
          employee_id?: string
          end_date?: string
          financial_transaction_id?: string | null
          id?: string
          notes?: string | null
          reference_period?: string | null
          start_date?: string
          total_value?: number
          vacation_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_vacations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_vacations_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          daily_rate: number | null
          email: string | null
          hire_date: string | null
          id: string
          name: string
          overtime_hourly_rate: number | null
          payment_notes: string | null
          payment_type: string | null
          payment_type_change_date: string | null
          phone: string | null
          role: string | null
          salary: number | null
          saturday_value: number | null
          updated_at: string
          user_id: string | null
          weekly_salary: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_rate?: number | null
          email?: string | null
          hire_date?: string | null
          id?: string
          name: string
          overtime_hourly_rate?: number | null
          payment_notes?: string | null
          payment_type?: string | null
          payment_type_change_date?: string | null
          phone?: string | null
          role?: string | null
          salary?: number | null
          saturday_value?: number | null
          updated_at?: string
          user_id?: string | null
          weekly_salary?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_rate?: number | null
          email?: string | null
          hire_date?: string | null
          id?: string
          name?: string
          overtime_hourly_rate?: number | null
          payment_notes?: string | null
          payment_type?: string | null
          payment_type_change_date?: string | null
          phone?: string | null
          role?: string | null
          salary?: number | null
          saturday_value?: number | null
          updated_at?: string
          user_id?: string | null
          weekly_salary?: number | null
        }
        Relationships: []
      }
      financial_accounts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          initial_balance: number
          name: string
          notes: string | null
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          initial_balance?: number
          name: string
          notes?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          initial_balance?: number
          name?: string
          notes?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_categories: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          account_id: string | null
          amount: number
          category: string | null
          client_id: string | null
          created_at: string
          description: string
          due_date: string
          id: string
          paid_date: string | null
          payment_method: string | null
          purchase_id: string | null
          purchase_order_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          sync_origin: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          description: string
          due_date: string
          id?: string
          paid_date?: string | null
          payment_method?: string | null
          purchase_id?: string | null
          purchase_order_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          sync_origin?: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          paid_date?: string | null
          payment_method?: string | null
          purchase_id?: string | null
          purchase_order_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          sync_origin?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_production"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_invoices: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          entity_cnpj: string | null
          entity_name: string
          file_url: string | null
          icms_amount: number | null
          id: string
          invoice_number: string
          issue_date: string
          payment_date: string | null
          payment_status: string | null
          purchase_id: string | null
          quote_id: string | null
          service_description: string | null
          status: string
          taxes: string | null
          type: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          entity_cnpj?: string | null
          entity_name: string
          file_url?: string | null
          icms_amount?: number | null
          id?: string
          invoice_number: string
          issue_date?: string
          payment_date?: string | null
          payment_status?: string | null
          purchase_id?: string | null
          quote_id?: string | null
          service_description?: string | null
          status?: string
          taxes?: string | null
          type: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          entity_cnpj?: string | null
          entity_name?: string
          file_url?: string | null
          icms_amount?: number | null
          id?: string
          invoice_number?: string
          issue_date?: string
          payment_date?: string | null
          payment_status?: string | null
          purchase_id?: string | null
          quote_id?: string | null
          service_description?: string | null
          status?: string
          taxes?: string | null
          type?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          amount_invested: number
          clicks: number | null
          created_at: string
          end_date: string | null
          financial_transaction_id: string | null
          id: string
          impressions: number | null
          leads_generated: number | null
          name: string
          notes: string | null
          objective: string | null
          payment_status: string | null
          platform: string
          start_date: string
          updated_at: string
        }
        Insert: {
          amount_invested?: number
          clicks?: number | null
          created_at?: string
          end_date?: string | null
          financial_transaction_id?: string | null
          id?: string
          impressions?: number | null
          leads_generated?: number | null
          name: string
          notes?: string | null
          objective?: string | null
          payment_status?: string | null
          platform?: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          amount_invested?: number
          clicks?: number | null
          created_at?: string
          end_date?: string | null
          financial_transaction_id?: string | null
          id?: string
          impressions?: number | null
          leads_generated?: number | null
          name?: string
          notes?: string | null
          objective?: string | null
          payment_status?: string | null
          platform?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_settings: {
        Row: {
          cac_limit: number | null
          id: string
          updated_at: string
        }
        Insert: {
          cac_limit?: number | null
          id?: string
          updated_at?: string
        }
        Update: {
          cac_limit?: number | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          created_at: string
          description: string | null
          id: string
          min_quantity: number
          name: string
          quantity: number
          supplier: string | null
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          min_quantity?: number
          name: string
          quantity?: number
          supplier?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          min_quantity?: number
          name?: string
          quantity?: number
          supplier?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      monthly_closings: {
        Row: {
          base_salary: number
          created_at: string
          employee_id: string
          id: string
          month_ref: string
          net_pay: number
          paid: boolean
          paid_date: string | null
          total_absences: number
          total_advances: number
          total_expenses: number
          total_holidays: number
          total_overtime: number
          total_saturdays: number
        }
        Insert: {
          base_salary?: number
          created_at?: string
          employee_id: string
          id?: string
          month_ref: string
          net_pay?: number
          paid?: boolean
          paid_date?: string | null
          total_absences?: number
          total_advances?: number
          total_expenses?: number
          total_holidays?: number
          total_overtime?: number
          total_saturdays?: number
        }
        Update: {
          base_salary?: number
          created_at?: string
          employee_id?: string
          id?: string
          month_ref?: string
          net_pay?: number
          paid?: boolean
          paid_date?: string | null
          total_absences?: number
          total_advances?: number
          total_expenses?: number
          total_holidays?: number
          total_overtime?: number
          total_saturdays?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_closings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      production: {
        Row: {
          created_at: string
          data_conclusao: string | null
          id: string
          observacoes: string | null
          os_id: string
          priority: string | null
          responsavel: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_conclusao?: string | null
          id?: string
          observacoes?: string | null
          os_id: string
          priority?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_conclusao?: string | null
          id?: string
          observacoes?: string | null
          os_id?: string
          priority?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: true
            referencedRelation: "work_orders_production"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_responsavel_fkey"
            columns: ["responsavel"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_counters: {
        Row: {
          last_number: number
          year: number
        }
        Insert: {
          last_number?: number
          year: number
        }
        Update: {
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          client_id: string | null
          created_at: string
          discount_amount: number | null
          due_date: string | null
          id: string
          invoice_number: string | null
          notes: string | null
          order_number: string | null
          original_total: number | null
          payment_method: string | null
          payment_status: string
          purchase_date: string
          supplier_id: string | null
          total: number
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          order_number?: string | null
          original_total?: number | null
          payment_method?: string | null
          payment_status?: string
          purchase_date?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          order_number?: string | null
          original_total?: number | null
          payment_method?: string | null
          payment_status?: string
          purchase_date?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_production"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          notes: string | null
          requested_at: string
          requested_by: string | null
          status: string
          work_order_id: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
          work_order_id: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_production"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          client_id: string | null
          created_at: string
          discount_amount: number | null
          discount_percentage: number | null
          due_date: string | null
          id: string
          invoice_number: string | null
          material: string
          notes: string | null
          order_id: string | null
          original_price: number | null
          payment_method: string | null
          payment_status: string
          purchase_date: string
          quantity: number
          supplier_id: string | null
          total: number
          unit: string
          unit_price: number
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          discount_amount?: number | null
          discount_percentage?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          material: string
          notes?: string | null
          order_id?: string | null
          original_price?: number | null
          payment_method?: string | null
          payment_status?: string
          purchase_date?: string
          quantity?: number
          supplier_id?: string | null
          total?: number
          unit?: string
          unit_price?: number
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          discount_amount?: number | null
          discount_percentage?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          material?: string
          notes?: string | null
          order_id?: string | null
          original_price?: number | null
          payment_method?: string | null
          payment_status?: string
          purchase_date?: string
          quantity?: number
          supplier_id?: string | null
          total?: number
          unit?: string
          unit_price?: number
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          quantity: number
          quote_id: string
          total: number
          unit: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          quantity?: number
          quote_id: string
          total?: number
          unit?: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          quote_id?: string
          total?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approved_at: string | null
          billing_date: string | null
          client_id: string
          created_at: string
          created_by: string | null
          delivery_deadline: string | null
          description: string | null
          down_payment: number | null
          down_payment_date: string | null
          financial_status: string | null
          id: string
          issue_date: string
          origem_venda: string | null
          payment_method: string | null
          payment_status: string | null
          payment_type: string | null
          remaining_amount: number | null
          seller_id: string | null
          status: Database["public"]["Enums"]["quote_status"]
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          approved_at?: string | null
          billing_date?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          delivery_deadline?: string | null
          description?: string | null
          down_payment?: number | null
          down_payment_date?: string | null
          financial_status?: string | null
          id?: string
          issue_date?: string
          origem_venda?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payment_type?: string | null
          remaining_amount?: number | null
          seller_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          billing_date?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          delivery_deadline?: string | null
          description?: string | null
          down_payment?: number | null
          down_payment_date?: string | null
          financial_status?: string | null
          id?: string
          issue_date?: string
          origem_venda?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payment_type?: string | null
          remaining_amount?: number | null
          seller_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_installments: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          employee_id: string
          expected_date: string | null
          financial_transaction_id: string | null
          id: string
          installment_number: number
          month_ref: string
          notes: string | null
          payable_transaction_id: string | null
          payment_date: string | null
          payment_method: string | null
          period_end: string | null
          period_start: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          created_at?: string
          employee_id: string
          expected_date?: string | null
          financial_transaction_id?: string | null
          id?: string
          installment_number: number
          month_ref: string
          notes?: string | null
          payable_transaction_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          employee_id?: string
          expected_date?: string | null
          financial_transaction_id?: string | null
          id?: string
          installment_number?: number
          month_ref?: string
          notes?: string | null
          payable_transaction_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      salary_payments: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          employee_id: string
          financial_transaction_id: string | null
          id: string
          month_ref: string
          notes: string | null
          payment_date: string
          payment_method: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          employee_id: string
          financial_transaction_id?: string | null
          id?: string
          month_ref: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          employee_id?: string
          financial_transaction_id?: string | null
          id?: string
          month_ref?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          delivery_deadline: string | null
          description: string
          id: string
          notes: string | null
          origem_venda: string | null
          seller_id: string
          status: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          amount?: number
          client_id: string
          created_at?: string
          delivery_deadline?: string | null
          description: string
          id?: string
          notes?: string | null
          origem_venda?: string | null
          seller_id: string
          status?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          delivery_deadline?: string | null
          description?: string
          id?: string
          notes?: string | null
          origem_venda?: string | null
          seller_id?: string
          status?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_production"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_commissions: {
        Row: {
          amount: number
          created_at: string
          id: string
          paid_date: string | null
          percentage: number
          sale_id: string
          seller_id: string
          status: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          paid_date?: string | null
          percentage?: number
          sale_id: string
          seller_id: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          paid_date?: string | null
          percentage?: number
          sale_id?: string
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_commissions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_goals: {
        Row: {
          created_at: string
          goal_amount: number
          id: string
          month_ref: string
          seller_id: string
        }
        Insert: {
          created_at?: string
          goal_amount?: number
          id?: string
          month_ref: string
          seller_id: string
        }
        Update: {
          created_at?: string
          goal_amount?: number
          id?: string
          month_ref?: string
          seller_id?: string
        }
        Relationships: []
      }
      seller_commission_rates: {
        Row: {
          created_at: string
          id: string
          percentage: number
          seller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          percentage?: number
          seller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          percentage?: number
          seller_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          products: string | null
          updated_at: string
        }
        Insert: {
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          products?: string | null
          updated_at?: string
        }
        Update: {
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          products?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      thirteenth_salary: {
        Row: {
          created_at: string
          employee_id: string
          financial_transaction_id: string | null
          first_installment: number
          first_installment_date: string | null
          first_installment_paid: boolean
          id: string
          monthly_provision: number
          second_installment: number
          second_installment_date: string | null
          second_installment_paid: boolean
          year: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          financial_transaction_id?: string | null
          first_installment?: number
          first_installment_date?: string | null
          first_installment_paid?: boolean
          id?: string
          monthly_provision?: number
          second_installment?: number
          second_installment_date?: string | null
          second_installment_paid?: boolean
          year: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          financial_transaction_id?: string | null
          first_installment?: number
          first_installment_date?: string | null
          first_installment_paid?: boolean
          id?: string
          monthly_provision?: number
          second_installment?: number
          second_installment_date?: string | null
          second_installment_paid?: boolean
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "thirteenth_salary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thirteenth_salary_financial_transaction_id_fkey"
            columns: ["financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_closings: {
        Row: {
          absence_value: number | null
          advances_value: number | null
          base_value: number | null
          created_at: string | null
          employee_id: string
          end_date: string
          financial_account_id: string | null
          holiday_value: number | null
          id: string
          month_ref: string
          net_pay: number | null
          overtime_value: number | null
          payment_date: string | null
          payment_method: string | null
          saturday_value: number | null
          start_date: string
          status: string | null
          updated_at: string | null
          week_number: number
          weeks_worked: number | null
        }
        Insert: {
          absence_value?: number | null
          advances_value?: number | null
          base_value?: number | null
          created_at?: string | null
          employee_id: string
          end_date: string
          financial_account_id?: string | null
          holiday_value?: number | null
          id?: string
          month_ref: string
          net_pay?: number | null
          overtime_value?: number | null
          payment_date?: string | null
          payment_method?: string | null
          saturday_value?: number | null
          start_date: string
          status?: string | null
          updated_at?: string | null
          week_number: number
          weeks_worked?: number | null
        }
        Update: {
          absence_value?: number | null
          advances_value?: number | null
          base_value?: number | null
          created_at?: string | null
          employee_id?: string
          end_date?: string
          financial_account_id?: string | null
          holiday_value?: number | null
          id?: string
          month_ref?: string
          net_pay?: number | null
          overtime_value?: number | null
          payment_date?: string | null
          payment_method?: string | null
          saturday_value?: number | null
          start_date?: string
          status?: string | null
          updated_at?: string | null
          week_number?: number
          weeks_worked?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_closings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_closings_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          quantity: number
          quote_item_id: string | null
          total: number
          unit: string
          unit_price: number
          work_order_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          quantity?: number
          quote_item_id?: string | null
          total?: number
          unit?: string
          unit_price?: number
          work_order_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          quote_item_id?: string | null
          total?: number
          unit?: string
          unit_price?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_items_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_production"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_materials: {
        Row: {
          created_at: string
          id: string
          material: string
          notes: string | null
          purchase_status: string
          quantity: number
          unit: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material: string
          notes?: string | null
          purchase_status?: string
          quantity?: number
          unit?: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material?: string
          notes?: string | null
          purchase_status?: string
          quantity?: number
          unit?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_materials_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_materials_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders_production"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          assigned_to: string | null
          billing_date: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          delivered_at: string | null
          description: string | null
          financial_status: string | null
          id: string
          internal_notes: string | null
          material_status: string | null
          origem_venda: string | null
          priority: string
          quote_id: string | null
          remaining_amount: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["work_order_status"]
          total: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          billing_date?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          financial_status?: string | null
          id?: string
          internal_notes?: string | null
          material_status?: string | null
          origem_venda?: string | null
          priority?: string
          quote_id?: string | null
          remaining_amount?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          total?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          billing_date?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          financial_status?: string | null
          id?: string
          internal_notes?: string | null
          material_status?: string | null
          origem_venda?: string | null
          priority?: string
          quote_id?: string | null
          remaining_amount?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      work_orders_production: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string | null
          delivered_at: string | null
          description: string | null
          id: string | null
          internal_notes: string | null
          priority: string | null
          quote_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["work_order_status"] | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          description?: string | null
          id?: string | null
          internal_notes?: string | null
          priority?: string | null
          quote_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["work_order_status"] | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          description?: string | null
          id?: string | null
          internal_notes?: string | null
          priority?: string | null
          quote_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["work_order_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_team_display_names: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_purchase_order_number: { Args: { _date?: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "funcionario"
        | "financeiro"
        | "producao"
        | "vendedor"
        | "compras"
        | "marketing"
      quote_status: "pendente" | "aprovado" | "rejeitado"
      transaction_status: "pendente" | "pago" | "atrasado" | "cancelado"
      transaction_type: "a_pagar" | "a_receber"
      work_order_status:
        | "aguardando"
        | "em_producao"
        | "aguardando_instalacao"
        | "entregue"
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
      app_role: [
        "admin",
        "funcionario",
        "financeiro",
        "producao",
        "vendedor",
        "compras",
        "marketing",
      ],
      quote_status: ["pendente", "aprovado", "rejeitado"],
      transaction_status: ["pendente", "pago", "atrasado", "cancelado"],
      transaction_type: ["a_pagar", "a_receber"],
      work_order_status: [
        "aguardando",
        "em_producao",
        "aguardando_instalacao",
        "entregue",
      ],
    },
  },
} as const
