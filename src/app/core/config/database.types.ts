import type { HeldMaterial } from '../material/material-repository';
import type { FolderLoan, FolderLoanMovement } from '../folder-loans/models';
import type {
  MusicalVoice,
  MusicRepertoire,
  RepertoireWork,
  WorkPeriod,
  MusicFolder,
  WorkPresence,
  WorkMovement,
  ScoreIssue,
  PhysicalIssue,
  FolderInventory,
  FolderWorkState,
  MaintenanceTask,
  MaintenanceEntry,
} from '../music/models';
type ReadOnlyTable<T> = {
  Row: T;
  Insert: never;
  Update: never;
  Relationships: [];
};
import type { Conflict, RetentionDecision } from '../conflicts/models';
import type {
  EventSeries,
  Uniform,
  BandEvent,
  EventPerson,
  Preparation,
  Reservation,
} from '../events/models';
import type {
  LoanRow,
  LoanOverview,
  LoanItem,
  LoanMovement,
  StockGarment,
  LoanCommand,
} from '../loans/models';
export type PersonKind = 'BANDA' | 'REFUERZO';
export type PersonRow = {
  id: string;
  full_name: string;
  kind: PersonKind;
  instrument: string | null;
  phone: string | null;
  notes: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  version: number;
};
export type PhysicalState =
  | 'DISPONIBLE'
  | 'PENDIENTE_LAVANDERIA'
  | 'DANADA'
  | 'NO_DISPONIBLE';
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type GarmentType = {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
};
export type GarmentRow = {
  id: string;
  code: string;
  garment_type_id: string;
  size: string;
  physical_state: PhysicalState;
  notes: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  version: number;
};
export type InventorySummary = {
  held_count: number;
  active_count: number;
  available_count: number;
  laundry_count: number;
  damaged_count: number;
  archived_count: number;
};
export interface Database {
  public: {
    Tables: {
      event_participants: ReadOnlyTable<{
        event_id: string;
        person_id: string;
        active: boolean;
        block_id: string | null;
        voice_id: string | null;
      }>;
      musical_voices: ReadOnlyTable<MusicalVoice>;
      folder_loan_movements: ReadOnlyTable<FolderLoanMovement>;
      music_repertoires: ReadOnlyTable<MusicRepertoire>;
      repertoire_works: ReadOnlyTable<RepertoireWork>;
      repertoire_work_periods: ReadOnlyTable<WorkPeriod>;
      music_folders: ReadOnlyTable<MusicFolder>;
      folder_work_presence: ReadOnlyTable<WorkPresence>;
      folder_work_movements: ReadOnlyTable<WorkMovement>;
      folder_score_issues: ReadOnlyTable<ScoreIssue>;
      folder_physical_issues: ReadOnlyTable<PhysicalIssue>;
      music_requests: ReadOnlyTable<{
        id: string;
        actor_id: string;
        occurred_at: string;
        payload: Json;
        result: Json;
      }>;
      loan_retention_decisions: {
        Row: RetentionDecision;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      event_series: {
        Row: EventSeries;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      uniforms: {
        Row: Uniform;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      events: {
        Row: BandEvent;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      loans: { Row: LoanRow; Insert: never; Update: never; Relationships: [] };
      loan_items: {
        Row: LoanItem;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      loan_movements: {
        Row: LoanMovement;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      people: {
        Row: PersonRow;
        Insert: Partial<PersonRow>;
        Update: Partial<PersonRow>;
        Relationships: [];
      };
      garment_types: {
        Row: GarmentType;
        Insert: Partial<GarmentType> & { name: string };
        Update: Partial<GarmentType>;
        Relationships: [];
      };
      garments: {
        Row: GarmentRow;
        Insert: Partial<GarmentRow>;
        Update: Partial<GarmentRow>;
        Relationships: [
          {
            foreignKeyName: 'garments_garment_type_id_fkey';
            columns: ['garment_type_id'];
            isOneToOne: false;
            referencedRelation: 'garment_types';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string;
          actor_name: string;
          occurred_at: string;
          action: string;
          entity_type: string;
          entity_id: string;
          garment_id: string | null;
          person_id: string | null;
          loan_id: string | null;
          music_folder_id: string | null;
          music_voice_id: string | null;
          music_work_id: string | null;
          before_data: Json;
          after_data: Json;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
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
    Views: {
      material_held: { Row: HeldMaterial; Relationships: [] };
      folder_work_state: { Row: FolderWorkState; Relationships: [] };
      folder_loan_overview: { Row: FolderLoan; Relationships: [] };
      music_folder_inventory: { Row: FolderInventory; Relationships: [] };
      music_maintenance_index: { Row: MaintenanceEntry; Relationships: [] };
      music_maintenance_tasks: { Row: MaintenanceTask; Relationships: [] };
      wardrobe_conflicts: { Row: Conflict; Relationships: [] };
      event_people: { Row: EventPerson; Relationships: [] };
      event_preparation: { Row: Preparation; Relationships: [] };
      garment_reservations: { Row: Reservation; Relationships: [] };
      loan_overview: { Row: LoanOverview; Relationships: [] };
      garment_inventory: { Row: StockGarment; Relationships: [] };
    };
    Functions: {
      music_voice_suggestion: { Args: { p_person: string }; Returns: Json };
      music_planning_detail: {
        Args: {
          p_scope: string;
          p_id: string;
          p_page: number;
          p_person: string | null;
        };
        Returns: Json;
      };
      recommend_music_folders: {
        Args: { p_key: string; p_page: number; p_q: string };
        Returns: Json;
      };
      music_planning_command: {
        Args: {
          p_request: string;
          p_action: string;
          p_scope: string;
          p_id: string;
          p_data: Json;
        };
        Returns: Json;
      };
      plan_music_participant: {
        Args: {
          p_request: string;
          p_scope: string;
          p_id: string;
          p_version: number;
          p_data: Json;
          p_voice: string | null;
          p_apply_voice: boolean;
        };
        Returns: Json;
      };
      music_planning_alerts: {
        Args: { p_event: string | null; p_page: number };
        Returns: Json;
      };
      preview_material_operation: { Args: { p_data: Json }; Returns: Json };
      apply_material_operation: {
        Args: {
          p_request: string;
          p_preview: Json;
          p_signature: boolean;
          p_acknowledged: boolean;
        };
        Returns: Json;
      };
      preview_folder_loan: {
        Args: {
          p_action: string;
          p_id: string;
          p_version: number | null;
          p_data: Json;
        };
        Returns: Json;
      };
      apply_folder_loan: {
        Args: {
          p_request: string;
          p_preview: Json;
          p_signature: boolean;
          p_acknowledged: boolean;
        };
        Returns: Json;
      };
      music_command: {
        Args: {
          p_request: string;
          p_action: string;
          p_id: string;
          p_expected_version: number | null;
          p_data: Json;
        };
        Returns: Json;
      };
      preview_music_presence: {
        Args: { p_action: string; p_work: string; p_folders: string[] };
        Returns: Json;
      };
      apply_music_presence: {
        Args: { p_request: string; p_preview: Json };
        Returns: Json;
      };
      preview_import: { Args: { p_kind: string; p_rows: Json }; Returns: Json };
      apply_import: {
        Args: { p_request: string; p_preview: Json };
        Returns: Json;
      };
      preview_series_copy: {
        Args: { p_source: string; p_name: string; p_first_date: string };
        Returns: Json;
      };
      apply_series_copy: {
        Args: { p_request: string; p_preview: Json };
        Returns: Json;
      };
      conflict_summary: { Args: Record<string, never>; Returns: Json };
      preview_retention: {
        Args: { p_loan: string; p_items: string[] };
        Returns: Json;
      };
      confirm_retention: {
        Args: { p_request: string; p_preview: Json };
        Returns: Json;
      };
      garment_recommendation: {
        Args: { p_event: string; p_person: string; p_type: string };
        Returns: Json;
      };
      preview_assisted_plan: {
        Args: { p_scope: string; p_id: string };
        Returns: Json;
      };
      apply_assisted_plan: {
        Args: { p_request_id: string; p_preview: Json };
        Returns: Json;
      };
      plan_series: {
        Args: {
          p_request_id: string;
          p_action: string;
          p_id: string;
          p_expected_version: number | null;
          p_data: Json;
        };
        Returns: Json;
      };
      series_detail: { Args: { p_id: string }; Returns: Json };

      plan_event: {
        Args: {
          p_request_id: string;
          p_action: string;
          p_id: string;
          p_expected_version: number | null;
          p_data: Json;
        };
        Returns: Json;
      };
      event_garment_choices: {
        Args: {
          p_event: string;
          p_person: string;
          p_type: string;
          p_q: string;
          p_page: number;
        };
        Returns: Json;
      };
      record_loan_movement: { Args: LoanCommand; Returns: LoanRow[] };
      save_person: {
        Args: {
          p_id: string;
          p_expected_version: number | null;
          p_full_name: string;
          p_kind: PersonKind;
          p_instrument: string | null;
          p_phone: string | null;
          p_notes: string | null;
        };
        Returns: PersonRow[];
      };
      set_person_archived: {
        Args: { p_id: string; p_expected_version: number; p_archived: boolean };
        Returns: PersonRow[];
      };
      save_garment: {
        Args: {
          p_id: string;
          p_expected_version: number | null;
          p_code: string;
          p_garment_type_id: string;
          p_size: string;
          p_physical_state: PhysicalState;
          p_notes: string | null;
        };
        Returns: GarmentRow[];
      };
      set_garment_archived: {
        Args: { p_id: string; p_expected_version: number; p_archived: boolean };
        Returns: GarmentRow[];
      };
      inventory_summary: {
        Args: Record<string, never>;
        Returns: InventorySummary[];
      };
    };
    Enums: { garment_state: PhysicalState; person_kind: PersonKind };
    CompositeTypes: Record<string, never>;
  };
}
export type AdminProfile =
  Database['public']['Tables']['admin_profiles']['Row'];
