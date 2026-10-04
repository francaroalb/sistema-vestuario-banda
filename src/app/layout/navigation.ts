import { IconName } from '../shared/ui/icon';
export const navigation: {
  path: string;
  label: string;
  icon: IconName;
  description: string;
}[] = [
  {
    path: '/inicio',
    label: 'Inicio',
    icon: 'home',
    description: 'Tu espacio de trabajo',
  },
  {
    path: '/actuaciones',
    label: 'Actuaciones',
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
];
