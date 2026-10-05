import { GarmentRow, Json, PhysicalState } from '../config/database.types';
export type LoanRow = {
  id: string;
  person_id: string;
  person_name: string;
  opened_at: string;
  due_at: string | null;
  closed_at: string | null;
  notes: string | null;
  created_by: string;
  version: number;
};
export type LoanOverview = LoanRow & {
  held_count: number;
  item_count: number;
  garment_ids: string[];
};
export type LoanItem = {
  id: string;
  loan_id: string;
  garment_id: string;
  code: string;
  garment_type_id: string;
  type_name: string;
  size: string;
  delivered_at: string;
  returned_at: string | null;
  returned_state: PhysicalState | null;
};
export type MovementKind = 'ENTREGA' | 'DEVOLUCION' | 'CAMBIO';
export type LoanMovement = {
  id: string;
  loan_id: string;
  kind: MovementKind;
  actor_id: string;
  actor_name: string;
  occurred_at: string;
  signature_confirmed: boolean;
  details: {
    person_id: string;
    person_name: string;
    delivered: LoanItem[];
    returned: LoanItem[];
  };
  request_payload: Json;
};
export type StockGarment = GarmentRow & {
  type_name: string;
  loan_id: string | null;
  holder_id: string | null;
  holder_name: string | null;
};
export type LoanCommand = {
  p_request_id: string;
  p_kind: MovementKind;
  p_loan_id: string;
  p_expected_version: number | null;
  p_person_id: string | null;
  p_garment_ids: string[];
  p_returns: { item_id: string; state: PhysicalState }[];
  p_due_local: string | null;
  p_notes: string | null;
  p_signature_confirmed: boolean;
};
export type Choice = {
  id: string;
  label: string;
  subtitle: string;
  type_id?: string;
};
export type LoanFilters = {
  q: string;
  status: 'active' | 'closed' | 'all' | 'overdue';
  person: string;
  garment: string;
  page: number;
};
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const movementLabel = (kind: MovementKind) =>
  ({
    ENTREGA: 'Entrega',
    DEVOLUCION: 'Devolución',
    CAMBIO: 'Cambio de prenda',
  })[kind];
export function loanReturnUrl(value: string | null): string {
  return value && /^\/cesiones(?:\?|$)/.test(value) && !value.includes('\\')
    ? value
    : '/cesiones';
}
export class LoanError extends Error {
  constructor(
    message: string,
    readonly conflict = false,
  ) {
    super(message);
  }
}
export function loanError(error: unknown): LoanError {
  if (error instanceof LoanError) return error;
  const e = error as { message?: string; code?: string } | null;
  const messages: Record<string, string> = {
    SIGNATURE_REQUIRED: 'Falta la firma. Dibuja la firma antes de confirmar.',
    GARMENT_IN_CUSTODY:
      'Una de las prendas ya está cedida. Revisa la selección y vuelve a cargar los datos.',
    GARMENT_NOT_READY:
      'Una prenda ya no está disponible en la Banda. Revisa su estado y la selección.',
    PERSON_ARCHIVED:
      'Esta persona está archivada. Reactiva su ficha antes de entregar prendas.',
    INVALID_DUE_DATE:
      'Revisa la devolución prevista: debe ser futura y una hora válida de Madrid, fuera de la hora repetida del cambio horario.',
    EXCHANGE_TYPE_MISMATCH:
      'La prenda nueva debe ser del mismo tipo que la que se devuelve.',
    REQUEST_ALREADY_USED:
      'Esta operación ya fue confirmada con otros datos. Consulta la cesión antes de repetirla.',
    LOAN_CHANGED:
      'La cesión ha cambiado en otra sesión. Recarga la ficha antes de continuar.',
    ITEM_NOT_OPEN:
      'Una prenda seleccionada ya no está pendiente en esta cesión. Recarga la ficha.',
  };
  if (e?.message && messages[e.message])
    return new LoanError(messages[e.message], e.code === 'PT409');
  if (e?.code === '42501' || e?.code === 'PGRST301')
    return new LoanError('Tu sesión no tiene acceso. Vuelve a iniciar sesión.');
  if (e?.code === 'P0002')
    return new LoanError(
      'No encontramos la persona o la cesión. Vuelve al listado.',
    );
  if (e?.code === 'PT409' || e?.code === '23505')
    return new LoanError(
      'La operación entra en conflicto con otro cambio. Recarga los datos antes de continuar.',
      true,
    );
  if (['22023', '22P02', '22007', '22008'].includes(e?.code ?? ''))
    return new LoanError(
      'Revisa las prendas seleccionadas y la fecha de devolución.',
    );
  return new LoanError(
    'No hemos podido confirmar la operación. Comprueba tu conexión. Puedes reintentar sin duplicar el movimiento.',
  );
}
