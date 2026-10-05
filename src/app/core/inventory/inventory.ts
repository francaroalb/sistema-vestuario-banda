import { GarmentRow, PhysicalState } from '../config/database.types';
export type Garment = GarmentRow & {
  loan_id?: string | null;
  holder_id?: string | null;
  holder_name?: string | null;
  garment_types: { name: string } | null;
};
export interface GarmentInput {
  code: string;
  garment_type_id: string;
  size: string;
  physical_state: PhysicalState;
  notes: string;
}
export interface InventoryFilters {
  location?: '' | 'held' | 'in_band';
  q: string;
  type: string;
  size: string;
  state: PhysicalState | '';
  archive: 'active' | 'archived' | 'all';
  page: number;
}
export const PAGE_SIZE = 24;
export const states: {
  value: PhysicalState;
  label: string;
  shortLabel: string;
}[] = [
  { value: 'DISPONIBLE', label: 'Disponible', shortLabel: 'Disponible' },
  {
    value: 'PENDIENTE_LAVANDERIA',
    label: 'Pendiente de lavandería',
    shortLabel: 'Lavandería',
  },
  { value: 'DANADA', label: 'Dañada', shortLabel: 'Dañada' },
];
export function stateLabel(state: PhysicalState): string {
  return states.find((item) => item.value === state)?.label ?? state;
}
export function literalSearch(value: string): string {
  return value.trim().replace(/[\\%_]/g, (character) => '\\' + character);
}
export function inventoryReturnUrl(value: string | null): string {
  return value && /^\/inventario(?:\?|$)/.test(value) && !value.includes('\\')
    ? value
    : '/inventario';
}
export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(new Date(value));
}
export class InventoryError extends Error {
  constructor(
    message: string,
    readonly conflict = false,
  ) {
    super(message);
  }
}
export function inventoryError(error: unknown): InventoryError {
  if (error instanceof InventoryError) return error;
  const failure = error as { code?: string; message?: string } | null;
  if (failure?.message === 'GARMENT_IN_CUSTODY')
    return new InventoryError(
      'Esta prenda está cedida. Registra su devolución antes de archivarla.',
    );
  if (failure?.code === '23505')
    return new InventoryError(
      'Ya existe una prenda con ese código. Comprueba también las prendas archivadas.',
    );
  if (failure?.code === 'PT409')
    return new InventoryError(
      'Otra persona ha cambiado esta prenda. Vuelve a cargar su ficha y revisa tus cambios antes de guardar.',
      true,
    );
  if (failure?.code === '42501' || failure?.code === 'PGRST301')
    return new InventoryError(
      'Tu sesión no tiene acceso a esta operación. Vuelve a iniciar sesión.',
    );
  if (failure?.code === 'P0002')
    return new InventoryError(
      'No encontramos esta prenda. Vuelve al inventario.',
    );
  if (failure?.message === 'GARMENT_ARCHIVED')
    return new InventoryError(
      'Esta prenda está archivada. Reactívala antes de editarla.',
    );
  if (failure?.message === 'INVALID_GARMENT_TYPE')
    return new InventoryError(
      'El tipo de prenda ya no está disponible. Selecciona otro tipo.',
    );
  if (
    failure?.code === '22023' ||
    failure?.code === '22P02' ||
    failure?.code === '23514'
  )
    return new InventoryError(
      'Revisa el código, el tipo y la talla de la prenda.',
    );
  return new InventoryError(
    'No hemos podido completar la operación. Comprueba tu conexión y vuelve a intentarlo.',
  );
}
