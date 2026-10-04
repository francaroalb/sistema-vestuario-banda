// Phase 1 schema only. Regenerate from Supabase as future migrations are added.
export interface Database {
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          user_id: string;
          display_name: string;
          role: 'ADMIN';
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name: string;
          role?: 'ADMIN';
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          role?: 'ADMIN';
          active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
export type AdminProfile =
  Database['public']['Tables']['admin_profiles']['Row'];
