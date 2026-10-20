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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_sessions: {
        Row: {
          created_at: string
          csrf_token: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          csrf_token: string
          expires_at: string
          id: string
          user_id: string
        }
        Update: {
          created_at?: string
          csrf_token?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          request_id: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          request_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          request_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      change_requests: {
        Row: {
          applied_at: string | null
          created_at: string
          decided_at: string | null
          decision_reason: string | null
          entity_id: string
          entity_type: string
          id: string
          operation: string
          payload: Json | null
          reason: string
          requester_id: string
          reviewer_id: string | null
          status: string
          target_version: number | null
          workspace_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          decided_at?: string | null
          decision_reason?: string | null
          entity_id: string
          entity_type: string
          id?: string
          operation: string
          payload?: Json | null
          reason: string
          requester_id: string
          reviewer_id?: string | null
          status?: string
          target_version?: number | null
          workspace_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          decided_at?: string | null
          decision_reason?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          operation?: string
          payload?: Json | null
          reason?: string
          requester_id?: string
          reviewer_id?: string | null
          status?: string
          target_version?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          id: string
          lifetime_value: number
          name: string
          phone: string
          visits: number
          workspace_id: string
        }
        Insert: {
          id?: string
          lifetime_value?: number
          name: string
          phone?: string
          visits?: number
          workspace_id: string
        }
        Update: {
          id?: string
          lifetime_value?: number
          name?: string
          phone?: string
          visits?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          actor_id: string | null
          actor_name: string
          amount: number
          category: string
          created_at: string
          date: string
          description: string
          id: string
          payment: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string
          amount?: number
          category?: string
          created_at?: string
          date?: string
          description: string
          id?: string
          payment?: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string
          amount?: number
          category?: string
          created_at?: string
          date?: string
          description?: string
          id?: string
          payment?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          customer: string
          customer_phone: string
          description: string
          due_date: string
          id: string
          number: string
          qty: number
          status: string
          total: number
          unit_price: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          customer: string
          customer_phone?: string
          description?: string
          due_date?: string
          id?: string
          number: string
          qty?: number
          status?: string
          total?: number
          unit_price?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          customer?: string
          customer_phone?: string
          description?: string
          due_date?: string
          id?: string
          number?: string
          qty?: number
          status?: string
          total?: number
          unit_price?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string
          category: string
          cost: number
          created_at: string
          id: string
          name: string
          price: number
          reorder_level: number
          sku: string
          stock: number
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          barcode?: string
          category?: string
          cost?: number
          created_at?: string
          id?: string
          name: string
          price: number
          reorder_level?: number
          sku: string
          stock?: number
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          barcode?: string
          category?: string
          cost?: number
          created_at?: string
          id?: string
          name?: string
          price?: number
          reorder_level?: number
          sku?: string
          stock?: number
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          id: string
          name: string
          role: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          id: string
          name: string
          role: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string
          role?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          expected_date: string
          id: string
          number: string
          product_id: string | null
          product_name: string
          qty: number
          status: string
          supplier_id: string | null
          supplier_name: string
          total: number
          unit_cost: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expected_date?: string
          id?: string
          number: string
          product_id?: string | null
          product_name?: string
          qty?: number
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          total?: number
          unit_cost?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          expected_date?: string
          id?: string
          number?: string
          product_id?: string | null
          product_name?: string
          qty?: number
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          total?: number
          unit_cost?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          id: string
          issued_at: string
          receipt_number: string
          sale_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          issued_at?: string
          receipt_number: string
          sale_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          issued_at?: string
          receipt_number?: string
          sale_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: true
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lines: {
        Row: {
          id: string
          product_id: string
          product_name: string
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          product_id: string
          product_name: string
          quantity: number
          sale_id: string
          unit_price: number
        }
        Update: {
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          actor_id: string | null
          created_at: string
          customer: string
          id: string
          idempotency_key: string
          number: string
          payment: string
          refund_reason: string
          refunded_at: string | null
          refunded_by: string | null
          total: number
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          customer?: string
          id?: string
          idempotency_key: string
          number: string
          payment: string
          refund_reason?: string
          refunded_at?: string | null
          refunded_by?: string | null
          total: number
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          customer?: string
          id?: string
          idempotency_key?: string
          number?: string
          payment?: string
          refund_reason?: string
          refunded_at?: string | null
          refunded_by?: string | null
          total?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_ledger: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          movement_type: string
          product_id: string
          quantity: number
          reason: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          movement_type: string
          product_id: string
          quantity: number
          reason?: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          movement_type?: string
          product_id?: string
          quantity?: number
          reason?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string
          contact: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          tax_id: string
          workspace_id: string
        }
        Insert: {
          address?: string
          contact?: string
          created_at?: string
          email?: string
          id?: string
          name: string
          phone?: string
          tax_id?: string
          workspace_id: string
        }
        Update: {
          address?: string
          contact?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          tax_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          receipt_address: string
          receipt_footer: string
          receipt_logo_url: string
          receipt_phone: string
          setup_completed: boolean
          tax_inclusive: boolean
          tax_label: string
          tax_rate: number
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          name: string
          receipt_address?: string
          receipt_footer?: string
          receipt_logo_url?: string
          receipt_phone?: string
          setup_completed?: boolean
          tax_inclusive?: boolean
          tax_label?: string
          tax_rate?: number
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          receipt_address?: string
          receipt_footer?: string
          receipt_logo_url?: string
          receipt_phone?: string
          setup_completed?: boolean
          tax_inclusive?: boolean
          tax_label?: string
          tax_rate?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_workspace_id: { Args: never; Returns: string }
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
    Enums: {},
  },
} as const
