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
      clients: {
        Row: {
          address: string | null
          city: string | null
          cpf_cnpj: string | null
          created_at: string
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
        }
        Relationships: [
          {
            foreignKeyName: "employee_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
        }
        Relationships: [
          {
            foreignKeyName: "employee_overtime_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
        }
        Relationships: [
          {
            foreignKeyName: "employee_saturdays_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          hire_date: string | null
          id: string
          name: string
          overtime_hourly_rate: number | null
          payment_notes: string | null
          phone: string | null
          role: string | null
          salary: number | null
          saturday_value: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          hire_date?: string | null
          id?: string
          name: string
          overtime_hourly_rate?: number | null
          payment_notes?: string | null
          phone?: string | null
          role?: string | null
          salary?: number | null
          saturday_value?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          hire_date?: string | null
          id?: string
          name?: string
          overtime_hourly_rate?: number | null
          payment_notes?: string | null
          phone?: string | null
          role?: string | null
          salary?: number | null
          saturday_value?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          amount: number
          category: string | null
          client_id: string | null
          created_at: string
          description: string
          due_date: string
          id: string
          paid_date: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          description: string
          due_date: string
          id?: string
          paid_date?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          paid_date?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
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
          total_advances: number
          total_expenses: number
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
          total_advances?: number
          total_expenses?: number
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
          total_advances?: number
          total_expenses?: number
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
      quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          quantity: number
          quote_id: string
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          quantity?: number
          quote_id: string
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          quote_id?: string
          total?: number
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
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          status: Database["public"]["Enums"]["quote_status"]
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: Database["public"]["Enums"]["quote_status"]
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
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
      sales: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          delivery_deadline: string | null
          description: string
          id: string
          notes: string | null
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
      thirteenth_salary: {
        Row: {
          created_at: string
          employee_id: string
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
      work_orders: {
        Row: {
          assigned_to: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          delivered_at: string | null
          description: string | null
          id: string
          internal_notes: string | null
          priority: string
          quote_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["work_order_status"]
          total: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          id?: string
          internal_notes?: string | null
          priority?: string
          quote_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          total?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          id?: string
          internal_notes?: string | null
          priority?: string
          quote_id?: string | null
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "funcionario" | "financeiro" | "producao" | "vendedor"
      quote_status: "pendente" | "aprovado" | "rejeitado"
      transaction_status: "pendente" | "pago" | "atrasado" | "cancelado"
      transaction_type: "a_pagar" | "a_receber"
      work_order_status: "aguardando" | "em_producao" | "concluido" | "entregue"
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
      app_role: ["admin", "funcionario", "financeiro", "producao", "vendedor"],
      quote_status: ["pendente", "aprovado", "rejeitado"],
      transaction_status: ["pendente", "pago", "atrasado", "cancelado"],
      transaction_type: ["a_pagar", "a_receber"],
      work_order_status: ["aguardando", "em_producao", "concluido", "entregue"],
    },
  },
} as const
