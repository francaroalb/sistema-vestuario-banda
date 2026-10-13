import { MaintenanceTask } from '../../core/music/models';
export const maintenanceRoot = '/inventario/carpetas/mantenimiento';
export const issueLabels: Record<MaintenanceTask['kind'], string> = {
  PENDING_ADD: 'Pendiente de incorporar',
  PENDING_REMOVE: 'Pendiente de retirar',
  MISSING: 'Partitura faltante',
  DAMAGED: 'Partitura dañada',
  REPLACE: 'Sustituir copia',
  REPAIR: 'Revisar o reparar copia',
  ELASTICS: 'Elásticos rotos',
  COVER: 'Cubierta deteriorada',
  RINGS: 'Anillas dañadas',
  REPLACE_FOLDER: 'Sustituir carpeta exterior',
  OTHER: 'Otro desperfecto',
};
export function maintenanceReturn(value: string | null) {
  return value &&
    /^\/inventario\/carpetas\/mantenimiento(?:\?[^#]*)?$/.test(value)
    ? value
    : maintenanceRoot;
}
