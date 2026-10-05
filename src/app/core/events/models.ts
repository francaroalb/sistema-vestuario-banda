export type Uniform = {
  id: string;
  name: string;
  type_ids: string[];
  archived: boolean;
  version: number;
  updated_at: string;
  updated_by: string;
};
export type BandEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  planned_from: string;
  planned_until: string;
  uniform_id: string;
  uniform_name: string;
  type_ids: string[];
  notes: string | null;
  cancelled: boolean;
  version: number;
  updated_at: string;
  updated_by: string;
};
export type EventPerson = {
  event_id: string;
  person_id: string;
  full_name: string;
  instrument: string | null;
  kind: 'BANDA' | 'REFUERZO';
  archived_at: string | null;
};
export type Preparation = {
  event_id: string;
  person_id: string;
  full_name: string;
  instrument: string | null;
  kind: string;
  person_archived_at: string | null;
  type_id: string;
  type_name: string;
  garment_id: string | null;
  code: string | null;
  size: string | null;
  physical_state: string | null;
  archived_at: string | null;
  holder_id: string | null;
  holder_name: string | null;
  loan_id: string | null;
  due_at: string | null;
  returned_at: string | null;
  status:
    | 'SIN_ASIGNAR'
    | 'CONFLICTO'
    | 'EN_SU_PODER'
    | 'PENDIENTE_DEVOLUCION'
    | 'DEVUELTA'
    | 'ASIGNADA';
};
export type Reservation = {
  event_id: string;
  person_id: string;
  garment_id: string;
  title: string;
  planned_from: string;
  planned_until: string;
  full_name: string;
};
export type EventChoice = {
  id: string;
  code: string;
  size: string;
  holder_name: string | null;
  blocked: string | null;
  situation: string;
};
export const preparationLabel = {
  SIN_ASIGNAR: 'Pendiente de asignar',
  CONFLICTO: 'Revisar disponibilidad',
  EN_SU_PODER: 'En su poder',
  PENDIENTE_DEVOLUCION: 'Pendiente de devolución',
  DEVUELTA: 'Devuelta',
  ASIGNADA: 'Asignada · pendiente de entrega',
};
export function madridLocal(value: string) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function planningError(error: unknown): string {
  const e = error as { message?: string; code?: string };
  const messages: Record<string, string> = {
    PLAN_CHANGED:
      'La planificación ha cambiado. Recarga los datos antes de continuar.',
    REQUEST_ALREADY_USED:
      'Esta operación ya se confirmó con otros datos. Recarga antes de continuar.',
    RESERVATION_OVERLAP:
      'La prenda ya está reservada durante parte de ese periodo. Revisa las fechas o elige otra.',
    INVALID_EVENT_DATE:
      'Revisa las fechas de Madrid: inicio anterior a fin y periodo de entrega y devolución que incluya la actuación. Evita horas repetidas o inexistentes del cambio horario.',
    INVALID_PLAN: 'Revisa los campos obligatorios y los tipos de prenda.',
    UNIFORM_HAS_ASSIGNMENTS:
      'Quita las asignaciones antes de cambiar de uniforme.',
    GARMENT_IN_CUSTODY:
      'La prenda está cedida y su devolución no permite esta asignación.',
    GARMENT_NOT_READY: 'La prenda ya no está disponible. Revisa su estado.',
    PERSON_ARCHIVED: 'La persona está archivada. Reactívala desde su ficha.',
    INSTRUMENT_REQUIRED: 'Indica el instrumento para crear el refuerzo.',
    SIGNATURE_REQUIRED: 'Falta la firma para confirmar la entrega.',
    EVENT_CANCELLED: 'Esta actuación está cancelada.',
    EVENT_FINISHED:
      'El periodo previsto ya ha terminado. Revisa las fechas antes de entregar.',
    ADMIN_REQUIRED: 'Tu sesión no tiene acceso. Vuelve a iniciar sesión.',
  };
  return (
    messages[e?.message ?? ''] ??
    (e?.code === 'PT409'
      ? 'Los datos han cambiado. Recarga antes de continuar.'
      : 'No hemos podido guardar o cargar los datos. Comprueba tu conexión y reintenta.')
  );
}
