export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

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
      availability_blocks: {
        Row: {
          court_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          kind: Database['public']['Enums']['block_kind']
          reason: string | null
          starts_at: string
        }
        Insert: {
          court_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          kind?: Database['public']['Enums']['block_kind']
          reason?: string | null
          starts_at: string
        }
        Update: {
          court_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          kind?: Database['public']['Enums']['block_kind']
          reason?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'availability_blocks_court_id_fkey'
            columns: ['court_id']
            isOneToOne: false
            referencedRelation: 'courts'
            referencedColumns: ['id']
          },
        ]
      }
      booking_courts: {
        Row: {
          booking_id: string
          court_id: string
          created_at: string
          ends_at: string
          id: string
          price_cents: number
          starts_at: string
          status: Database['public']['Enums']['booking_status']
        }
        Insert: {
          booking_id: string
          court_id: string
          created_at?: string
          ends_at: string
          id?: string
          price_cents: number
          starts_at: string
          status?: Database['public']['Enums']['booking_status']
        }
        Update: {
          booking_id?: string
          court_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          price_cents?: number
          starts_at?: string
          status?: Database['public']['Enums']['booking_status']
        }
        Relationships: [
          {
            foreignKeyName: 'booking_courts_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'booking_courts_court_id_fkey'
            columns: ['court_id']
            isOneToOne: false
            referencedRelation: 'courts'
            referencedColumns: ['id']
          },
        ]
      }
      booking_items: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          line_total_cents: number | null
          name_snapshot: string
          product_id: string | null
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          line_total_cents?: number | null
          name_snapshot: string
          product_id?: string | null
          quantity?: number
          unit_price_cents: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          line_total_cents?: number | null
          name_snapshot?: string
          product_id?: string | null
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: 'booking_items_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'booking_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      booking_players: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          name: string
          position: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: 'booking_players_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
        ]
      }
      bookings: {
        Row: {
          cancelled_at: string | null
          club_id: string
          confirmed_at: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          courts_subtotal_cents: number
          created_at: string
          customer_id: string | null
          ends_at: string
          extra_players_fee_cents: number
          id: string
          items_subtotal_cents: number
          notes: string | null
          party_size: number | null
          reference: string
          starts_at: string
          status: Database['public']['Enums']['booking_status']
          total_cents: number
          updated_at: string
          will_present_id: boolean
        }
        Insert: {
          cancelled_at?: string | null
          club_id: string
          confirmed_at?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          courts_subtotal_cents?: number
          created_at?: string
          customer_id?: string | null
          ends_at: string
          extra_players_fee_cents?: number
          id?: string
          items_subtotal_cents?: number
          notes?: string | null
          party_size?: number | null
          reference: string
          starts_at: string
          status?: Database['public']['Enums']['booking_status']
          total_cents?: number
          updated_at?: string
          will_present_id?: boolean
        }
        Update: {
          cancelled_at?: string | null
          club_id?: string
          confirmed_at?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          courts_subtotal_cents?: number
          created_at?: string
          customer_id?: string | null
          ends_at?: string
          extra_players_fee_cents?: number
          id?: string
          items_subtotal_cents?: number
          notes?: string | null
          party_size?: number | null
          reference?: string
          starts_at?: string
          status?: Database['public']['Enums']['booking_status']
          total_cents?: number
          updated_at?: string
          will_present_id?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'bookings_club_id_fkey'
            columns: ['club_id']
            isOneToOne: false
            referencedRelation: 'clubs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'bookings_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'customers'
            referencedColumns: ['id']
          },
        ]
      }
      clubs: {
        Row: {
          cancellation_window_hours: number
          closes_at: string
          created_at: string
          currency: string
          group_booking_note: string | null
          id: string
          max_duration_minutes: number
          min_duration_minutes: number
          name: string
          opens_at: string
          phone: string | null
          slot_minutes: number
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          cancellation_window_hours?: number
          closes_at?: string
          created_at?: string
          currency?: string
          group_booking_note?: string | null
          id?: string
          max_duration_minutes?: number
          min_duration_minutes?: number
          name: string
          opens_at?: string
          phone?: string | null
          slot_minutes?: number
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          cancellation_window_hours?: number
          closes_at?: string
          created_at?: string
          currency?: string
          group_booking_note?: string | null
          id?: string
          max_duration_minutes?: number
          min_duration_minutes?: number
          name?: string
          opens_at?: string
          phone?: string | null
          slot_minutes?: number
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      courts: {
        Row: {
          base_price_cents: number
          blurb: string | null
          club_id: string
          created_at: string
          environment: Database['public']['Enums']['court_environment']
          extra_player_fee_cents: number
          hero_image_url: string | null
          id: string
          included_players: number
          includes: string[]
          is_active: boolean
          is_tournament_grade: boolean
          max_players: number
          min_players: number
          name: string
          notes: string[]
          slug: string
          sort_order: number
          surface: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          base_price_cents: number
          blurb?: string | null
          club_id: string
          created_at?: string
          environment?: Database['public']['Enums']['court_environment']
          extra_player_fee_cents?: number
          hero_image_url?: string | null
          id?: string
          included_players?: number
          includes?: string[]
          is_active?: boolean
          is_tournament_grade?: boolean
          max_players?: number
          min_players?: number
          name: string
          notes?: string[]
          slug: string
          sort_order?: number
          surface: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          base_price_cents?: number
          blurb?: string | null
          club_id?: string
          created_at?: string
          environment?: Database['public']['Enums']['court_environment']
          extra_player_fee_cents?: number
          hero_image_url?: string | null
          id?: string
          included_players?: number
          includes?: string[]
          is_active?: boolean
          is_tournament_grade?: boolean
          max_players?: number
          min_players?: number
          name?: string
          notes?: string[]
          slug?: string
          sort_order?: number
          surface?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'courts_club_id_fkey'
            columns: ['club_id']
            isOneToOne: false
            referencedRelation: 'clubs'
            referencedColumns: ['id']
          },
        ]
      }
      customers: {
        Row: {
          auth_user_id: string | null
          bookings_count: number
          club_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          last_visit_at: string | null
          phone: string | null
          tier: Database['public']['Enums']['customer_tier']
          total_spend_cents: number
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          bookings_count?: number
          club_id: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          last_visit_at?: string | null
          phone?: string | null
          tier?: Database['public']['Enums']['customer_tier']
          total_spend_cents?: number
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          bookings_count?: number
          club_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          last_visit_at?: string | null
          phone?: string | null
          tier?: Database['public']['Enums']['customer_tier']
          total_spend_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'customers_club_id_fkey'
            columns: ['club_id']
            isOneToOne: false
            referencedRelation: 'clubs'
            referencedColumns: ['id']
          },
        ]
      }
      payment_methods: {
        Row: {
          account_name: string | null
          account_number: string | null
          club_id: string
          created_at: string
          id: string
          instructions: string | null
          is_active: boolean
          label: string
          method: Database['public']['Enums']['payment_method']
          qr_image_url: string | null
          requires_proof: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          club_id: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          label: string
          method: Database['public']['Enums']['payment_method']
          qr_image_url?: string | null
          requires_proof?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          club_id?: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          label?: string
          method?: Database['public']['Enums']['payment_method']
          qr_image_url?: string | null
          requires_proof?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payment_methods_club_id_fkey'
            columns: ['club_id']
            isOneToOne: false
            referencedRelation: 'clubs'
            referencedColumns: ['id']
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          booking_id: string
          created_at: string
          external_reference: string | null
          id: string
          method: Database['public']['Enums']['payment_method']
          paid_at: string | null
          proof_url: string | null
          recorded_by: string | null
          refunded_at: string | null
          status: Database['public']['Enums']['payment_status']
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          created_at?: string
          external_reference?: string | null
          id?: string
          method: Database['public']['Enums']['payment_method']
          paid_at?: string | null
          proof_url?: string | null
          recorded_by?: string | null
          refunded_at?: string | null
          status?: Database['public']['Enums']['payment_status']
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          created_at?: string
          external_reference?: string | null
          id?: string
          method?: Database['public']['Enums']['payment_method']
          paid_at?: string | null
          proof_url?: string | null
          recorded_by?: string | null
          refunded_at?: string | null
          status?: Database['public']['Enums']['payment_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_booking_id_fkey'
            columns: ['booking_id']
            isOneToOne: false
            referencedRelation: 'bookings'
            referencedColumns: ['id']
          },
        ]
      }
      pricing_rules: {
        Row: {
          applies_to_tier: Database['public']['Enums']['customer_tier'] | null
          club_id: string
          court_id: string | null
          created_at: string
          days_of_week: number[]
          ends_at_time: string | null
          id: string
          is_active: boolean
          kind: Database['public']['Enums']['rate_kind']
          label: string
          min_duration_minutes: number | null
          priority: number
          starts_at_time: string | null
          updated_at: string
          value_cents: number | null
          value_percent: number | null
        }
        Insert: {
          applies_to_tier?: Database['public']['Enums']['customer_tier'] | null
          club_id: string
          court_id?: string | null
          created_at?: string
          days_of_week?: number[]
          ends_at_time?: string | null
          id?: string
          is_active?: boolean
          kind: Database['public']['Enums']['rate_kind']
          label: string
          min_duration_minutes?: number | null
          priority?: number
          starts_at_time?: string | null
          updated_at?: string
          value_cents?: number | null
          value_percent?: number | null
        }
        Update: {
          applies_to_tier?: Database['public']['Enums']['customer_tier'] | null
          club_id?: string
          court_id?: string | null
          created_at?: string
          days_of_week?: number[]
          ends_at_time?: string | null
          id?: string
          is_active?: boolean
          kind?: Database['public']['Enums']['rate_kind']
          label?: string
          min_duration_minutes?: number | null
          priority?: number
          starts_at_time?: string | null
          updated_at?: string
          value_cents?: number | null
          value_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'pricing_rules_club_id_fkey'
            columns: ['club_id']
            isOneToOne: false
            referencedRelation: 'clubs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pricing_rules_court_id_fkey'
            columns: ['court_id']
            isOneToOne: false
            referencedRelation: 'courts'
            referencedColumns: ['id']
          },
        ]
      }
      products: {
        Row: {
          club_id: string
          created_at: string
          description: string | null
          has_quantity: boolean
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price_cents: number
          sort_order: number
          type: Database['public']['Enums']['product_type']
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          description?: string | null
          has_quantity?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price_cents: number
          sort_order?: number
          type: Database['public']['Enums']['product_type']
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          description?: string | null
          has_quantity?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price_cents?: number
          sort_order?: number
          type?: Database['public']['Enums']['product_type']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'products_club_id_fkey'
            columns: ['club_id']
            isOneToOne: false
            referencedRelation: 'clubs'
            referencedColumns: ['id']
          },
        ]
      }
      staff: {
        Row: {
          club_id: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          role: Database['public']['Enums']['staff_role']
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          role?: Database['public']['Enums']['staff_role']
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database['public']['Enums']['staff_role']
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'staff_club_id_fkey'
            columns: ['club_id']
            isOneToOne: false
            referencedRelation: 'clubs'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      court_day_busy: {
        Args: {
          p_club_id: string
          p_from: string
          p_to: string
        }
        Returns: {
          court_id: string
          starts_at: string
          ends_at: string
          is_block: boolean
        }[]
      }
      create_booking: {
        Args: {
          p_club_id: string
          p_contact_email: string
          p_contact_name: string
          p_contact_phone: string
          p_courts: Json
          p_items?: Json
          p_notes: string
          p_will_present_id: boolean
        }
        Returns: {
          cancelled_at: string | null
          club_id: string
          confirmed_at: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          courts_subtotal_cents: number
          created_at: string
          customer_id: string | null
          ends_at: string
          id: string
          items_subtotal_cents: number
          notes: string | null
          reference: string
          starts_at: string
          status: Database['public']['Enums']['booking_status']
          total_cents: number
          updated_at: string
          will_present_id: boolean
        }
        SetofOptions: {
          from: '*'
          to: 'bookings'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      find_booking_by_reference: {
        Args: { p_email: string; p_reference: string }
        Returns: {
          cancelled_at: string | null
          club_id: string
          confirmed_at: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          courts_subtotal_cents: number
          created_at: string
          customer_id: string | null
          ends_at: string
          id: string
          items_subtotal_cents: number
          notes: string | null
          reference: string
          starts_at: string
          status: Database['public']['Enums']['booking_status']
          total_cents: number
          updated_at: string
          will_present_id: boolean
        }
        SetofOptions: {
          from: '*'
          to: 'bookings'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_booking_reference: { Args: never; Returns: string }
      is_club_admin: { Args: { p_club_id: string }; Returns: boolean }
      is_staff: { Args: { p_club_id: string }; Returns: boolean }
      move_payment_method: {
        Args: { p_direction: string; p_method_id: string }
        Returns: undefined
      }
      set_payment_method_active: {
        Args: {
          p_acknowledge_checkout_pause?: boolean
          p_is_active: boolean
          p_method_id: string
        }
        Returns: Database['public']['Tables']['payment_methods']['Row']
      }
    }
    Enums: {
      block_kind: 'maintenance' | 'league' | 'private' | 'closed'
      booking_status: 'pending' | 'awaiting_payment' | 'confirmed' | 'cancelled' | 'completed'
      court_environment: 'indoor' | 'outdoor'
      customer_tier: 'standard' | 'regular' | 'pro'
      payment_method: 'cash' | 'card' | 'bank_transfer' | 'gcash' | 'online'
      payment_status: 'pending' | 'paid' | 'refunded' | 'failed'
      product_type: 'addon' | 'cafe'
      rate_kind: 'fixed' | 'amount_delta' | 'percent_delta'
      staff_role: 'admin' | 'staff'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      block_kind: ['maintenance', 'league', 'private', 'closed'],
      booking_status: ['pending', 'awaiting_payment', 'confirmed', 'cancelled', 'completed'],
      court_environment: ['indoor', 'outdoor'],
      customer_tier: ['standard', 'regular', 'pro'],
      payment_method: ['cash', 'card', 'bank_transfer', 'gcash', 'online'],
      payment_status: ['pending', 'paid', 'refunded', 'failed'],
      product_type: ['addon', 'cafe'],
      rate_kind: ['fixed', 'amount_delta', 'percent_delta'],
      staff_role: ['admin', 'staff'],
    },
  },
} as const
