import { Json } from '../config/database.types';
export type FolderLoanAction = 'RESERVE' | 'CANCEL' | 'DELIVER' | 'RETURN';
export type FolderLoan = {
  id: string;
  person_id: string;
  person_name: string;
  folder_id: string;
  folder_code: string;
  voice_name: string;
  repertoire_code: 'PRO' | 'PMM';
  starts_at: string;
  due_at: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  folder_version: number;
  usable: boolean;
  status: 'RESERVED' | 'CANCELLED' | 'ACTIVE' | 'RETURNED';
  overdue: boolean;
  conflict: boolean;
  awaiting_return: boolean;
};
export type FolderLoanPreview = {
  action: FolderLoanAction;
  id: string;
  version: number | null;
  data: Json;
  folder_code: string;
  voice_name: string;
  person_name: string;
  person_version: number;
  warnings: string[];
  conflicts: string[];
  reservations: {
    id: string;
    version: number;
    person_name: string;
    starts_at: string;
    due_at: string | null;
  }[];
  custody: { person_name: string; due_at: string | null } | null;
};
export type FolderLoanMovement = {
  id: string;
  loan_id: string;
  item_id: string;
  operation_id: string;
  kind: 'DELIVER' | 'RETURN';
  occurred_at: string;
  actor_id: string;
  actor_name: string;
  signature_confirmed: boolean;
  notes: string | null;
};
export const folderLoanStatus = {
  RESERVED: 'Reservada · pendiente de entregar',
  CANCELLED: 'Reserva cancelada',
  ACTIVE: 'En su poder',
  RETURNED: 'Devuelta',
};
export const folderLoanNotices: Record<string, string> = {
  NOT_USABLE: 'Esta carpeta no es utilizable. Revisa su bloqueo o archivado.',
  PERSON_ARCHIVED: 'La persona está archivada. Reactívala antes de continuar.',
  RESERVATION_OVERLAP: 'El periodo coincide con otra reserva de esta carpeta.',
  IN_CUSTODY:
    'La carpeta sigue en poder de una persona. Registra primero su devolución real.',
  CUSTODY_OVERLAP:
    'La cesión actual no tiene una devolución prevista compatible, o ya está vencida.',
  AWAIT_RETURN:
    'La devolución prevista es compatible. Esta reserva depende de que la carpeta se devuelva físicamente antes de entregarla.',
  OPEN_ENDED_RESERVATIONS:
    'Entregas sin fecha de devolución y hay reservas posteriores. Coordina la devolución antes de esas fechas; el conflicto seguirá visible hasta resolverlo.',
  REPERTOIRE_PENDING:
    'Hay partituras faltantes, por incorporar o por retirar. Revisa las tareas de repertorio.',
  MAINTENANCE_PENDING:
    'Hay incidencias de conservación pendientes. La devolución no las resuelve automáticamente.',
};
export const folderLoansRoot = '/cesiones/carpetas';
