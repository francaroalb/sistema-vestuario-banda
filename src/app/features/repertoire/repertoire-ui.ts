import { PresenceState } from '../../core/music/models';
export const repertoireRoot = '/inventario/carpetas/repertorio';
export function repertoireReturn(value: string | null) {
  return value && /^\/inventario\/carpetas\/repertorio(?:\?[^#]*)?$/.test(value)
    ? value
    : repertoireRoot;
}
export const presenceLabels: Record<PresenceState, string> = {
  PRESENT: 'Presente',
  MISSING: 'Faltante',
  PENDING_ADD: 'Pendiente de incorporar',
  PENDING_REMOVE: 'Pendiente de retirar',
  ABSENT_RETIRED: 'Retirada y ausente',
};
export const movementLabels: Record<string, string> = {
  INCORPORATE: 'Incorporación confirmada',
  REMOVE: 'Retirada física confirmada',
  MISSING: 'Partitura faltante registrada',
  RECOVER: 'Partitura recuperada',
  REPLACE: 'Copia sustituida',
  CONFIRM_ABSENT: 'Ausencia confirmada',
};
export function safePage(value: string | null) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 10000) : 1;
}
