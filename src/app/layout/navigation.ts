import { IconName } from '../shared/ui/icon';
export interface NavigationItem {
  path: string;
  label: string;
  icon: IconName;
  description: string;
  shortLabel?: string;
}
export const navigation: NavigationItem[] = [
  {
    path: '/inicio',
    label: 'Inicio',
    icon: 'home',
    description: 'Tu espacio de trabajo',
  },
  {
    path: '/actuaciones',
    label: 'Actuaciones',
    shortLabel: 'Agenda',
    icon: 'calendar',
    description: 'El vestuario de cada actuación',
  },
  {
    path: '/inventario',
    label: 'Inventario',
    icon: 'hanger',
    description: 'Cada prenda, en su sitio',
  },
  {
    path: '/personas',
    label: 'Personas',
    icon: 'people',
    description: 'Músicos de la Banda y refuerzos',
  },
  {
    path: '/cesiones',
    label: 'Cesiones',
    icon: 'exchange',
    description: 'Entregas y devoluciones',
  },
  {
    path: '/carpetas',
    label: 'Carpetas',
    icon: 'folder',
    description: 'Material musical',
  },
];

export const folderNavigation: NavigationItem[] = [
  {
    path: '/carpetas',
    label: 'Resumen',
    icon: 'home',
    description: 'Carpetas musicales',
  },
  {
    path: '/inventario/carpetas',
    label: 'Inventario',
    icon: 'folder',
    description: 'Carpetas físicas, voces y contenido',
  },
  {
    path: '/inventario/carpetas/repertorio',
    label: 'Repertorio',
    icon: 'music',
    description: 'Obras y partituras de PRO y PMM',
  },
  {
    path: '/inventario/carpetas/mantenimiento',
    label: 'Mantenimiento',
    shortLabel: 'Avisos',
    icon: 'warning',
    description: 'Faltas, daños y tareas pendientes',
  },
  {
    path: '/cesiones/carpetas',
    label: 'Cesiones',
    icon: 'exchange',
    description: 'Reservas, entregas y devoluciones',
  },
];
// Keep existing deep links and return/filter URLs compatible.
export function folderSection(url: string): string | null {
  const path = url.split(/[?#]/)[0];
  const under = (root: string) => path === root || path.startsWith(root + '/');
  if (under('/carpetas')) return '/carpetas';
  if (under('/cesiones/carpetas')) return '/cesiones/carpetas';
  if (under('/inventario/carpetas/repertorio'))
    return '/inventario/carpetas/repertorio';
  if (
    under('/inventario/carpetas/mantenimiento') ||
    under('/inventario/carpetas/incidencias')
  )
    return '/inventario/carpetas/mantenimiento';
  if (under('/inventario/carpetas')) return '/inventario/carpetas';
  return null;
}
