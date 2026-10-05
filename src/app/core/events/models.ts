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
  series_id?: string | null;
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
  block_id?: string | null;
  block_from?: string | null;
  block_until?: string | null;
  last_in_block?: boolean | null;
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
  PENDIENTE_DEVOLUCION: 'Asignada · devolución prevista',
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
    RECOMMENDATION_CHANGED:
      'Han cambiado el histórico, las prendas o la planificación. Pulsa Ver propuestas para revisar una propuesta actualizada. No se ha aplicado ninguna asignación.',
    NOTHING_TO_ASSIGN:
      'No hay coincidencias claras para asignar. Revisa las prendas manualmente.',
    ASSIST_LIMIT:
      'La preparación asistida admite hasta 200 líneas pendientes. Reduce las pendientes mediante asignación manual antes de volver a proponer.',
    GAP_DECISION_REQUIRED:
      'Hay actuaciones intermedias sin participar. Elige mantener la prenda o dividir el periodo.',
    USE_SERIES:
      'Gestiona la participación y las prendas desde la preparación de la serie.',
    SERIES_PLAN_EXISTS:
      'Antes de cambiar las actuaciones o sus horarios, retira las participaciones de la serie. Esto libera sus reservas; después tendrás que volver a preparar los periodos.',
    SERIES_IN_CUSTODY:
      'Este periodo tiene prendas entregadas. Registra su devolución real antes de cambiar las participaciones.',
    EVENT_HAS_PLAN:
      'Esta actuación ya tiene participantes, está cancelada o pertenece a otra serie. Revisa su preparación antes de incorporarla.',
    SPLIT_PERIOD_OVERLAP:
      'Los periodos separados se solapan. Ajusta la recogida/devolución de las actuaciones o elige mantener la prenda.',
    SERIES_LIMIT: 'Una serie admite hasta 60 actuaciones y 200 participantes.',
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

export type EventSeries = {
  id: string;
  name: string;
  version: number;
  updated_at: string;
  updated_by: string;
};
export type SeriesBlock = {
  id: string;
  series_id: string;
  person_id: string;
  full_name: string;
  instrument: string | null;
  event_ids: string[];
  type_ids: string[];
  planned_from: string;
  planned_until: string;
  gap_choice: 'KEEP' | 'SPLIT' | 'CONSECUTIVE';
};
export type SeriesDetail = {
  series: EventSeries;
  events: BandEvent[];
  blocks: SeriesBlock[];
  rows: Preparation[];
};
export function hasParticipationGap(
  events: BandEvent[],
  selected: string[],
): boolean {
  const indexes = events
    .filter((e) => !e.cancelled)
    .map((e, i) => (selected.includes(e.id) ? i : -1))
    .filter((i) => i >= 0);
  return indexes.some((value, i) => i > 0 && value > indexes[i - 1] + 1);
}

export const recommendationReason = {
  NO_HISTORY: 'Sin histórico de vestuario. Selecciona la prenda manualmente.',
  TIED_HISTORY:
    'Varias tallas tienen la misma frecuencia. Se muestra primero la más reciente; comprueba la talla antes de elegir.',
  NO_AVAILABLE:
    'No hay prendas de la talla histórica o de una talla superior comparable disponibles durante todo el periodo.',
  LARGER_SIZE:
    'No hay prendas de la talla histórica disponibles. Esta es la siguiente talla mayor disponible; requiere revisión.',
  SAME_SIZE:
    'Coincide con la talla más utilizada y está disponible durante todo el periodo.',
};
export type Recommendation = {
  event_id: string;
  person_id: string;
  type_id: string;
  block_id: string | null;
  from: string;
  until: string;
  historical_size: string | null;
  history: { size: string; uses: number; recent: string }[];
  ambiguous: boolean;
  review: boolean;
  reason: keyof typeof recommendationReason;
  candidates: {
    id: string;
    code: string;
    size: string;
    own_custody: boolean;
    size_step: number;
    loan_id: string | null;
  }[];
};
export type AssistedPlan = {
  scope: 'event' | 'series';
  id: string;
  version: number;
  preserved: number;
  existing_review: number;
  suggested: number;
  review: number;
  lines: (Recommendation & {
    full_name: string;
    type_name: string;
    garment_id: string | null;
  })[];
};
