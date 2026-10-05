export const conflictReason = {
  ARCHIVED: 'Prenda archivada',
  PERSON_ARCHIVED: 'Persona archivada',
  WRONG_TYPE: 'El tipo de prenda ha cambiado',
  DAMAGED: 'Prenda dañada',
  LAUNDRY: 'Pendiente de lavandería',
  RETAINED: 'La persona mantiene la prenda',
  IN_CUSTODY: 'Cedida sin devolución compatible',
  PENDING_RETURN: 'Depende de una devolución prevista',
  OVERLAP: 'Reservas con periodos incompatibles',
};
export type Conflict = {
  event_id: string;
  series_id: string | null;
  block_id: string | null;
  person_id: string;
  full_name: string;
  type_id: string;
  type_name: string;
  garment_id: string;
  code: string;
  size: string;
  title: string;
  planned_from: string;
  planned_until: string;
  starts_at: string;
  holder_id: string | null;
  holder_name: string | null;
  loan_id: string | null;
  due_at: string | null;
  reasons: (keyof typeof conflictReason)[];
  critical: boolean;
};
export type ConflictSummary = { conflicts: number; pending: number };
export type RetentionPreview = {
  loan_id: string;
  version: number;
  due_at: string;
  person_name: string;
  items: { id: string; garment_id: string; code: string; size: string }[];
  impacts: {
    event_id: string;
    series_id: string | null;
    block_id: string | null;
    person_id: string;
    full_name: string;
    garment_id: string;
    code: string;
    title: string;
    planned_from: string;
    planned_until: string;
  }[];
};
export type RetentionDecision = {
  id: string;
  loan_id: string;
  actor_id: string;
  actor_name: string;
  occurred_at: string;
  preview: RetentionPreview;
};
