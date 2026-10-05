import { Routes } from '@angular/router';
import { authGuard, childAuthGuard, guestGuard } from './core/auth/auth.guard';
export const routes: Routes = [
  {
    path: 'login',
    title: 'Acceso · Gestión de trajes',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [childAuthGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio · Gestión de trajes',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
      },
      {
        path: 'inventario/nueva',
        title: 'Nueva prenda · Gestión de trajes',
        canDeactivate: [
          (component: { canLeave(): boolean }) => component.canLeave(),
        ],
        loadComponent: () =>
          import('./features/inventory/garment-form').then(
            (m) => m.GarmentForm,
          ),
      },
      {
        path: 'inventario/:id/editar',
        title: 'Editar prenda · Gestión de trajes',
        canDeactivate: [
          (component: { canLeave(): boolean }) => component.canLeave(),
        ],
        loadComponent: () =>
          import('./features/inventory/garment-form').then(
            (m) => m.GarmentForm,
          ),
      },
      {
        path: 'inventario/:id',
        title: 'Ficha de prenda · Gestión de trajes',
        loadComponent: () =>
          import('./features/inventory/garment-detail').then(
            (m) => m.GarmentDetail,
          ),
      },
      {
        path: 'inventario',
        title: 'Inventario · Gestión de trajes',
        loadComponent: () =>
          import('./features/inventory/inventory-list').then(
            (m) => m.InventoryList,
          ),
      },
      ...['actuaciones', 'personas', 'cesiones'].map((path) => ({
        path,
        title:
          path.charAt(0).toUpperCase() + path.slice(1) + ' · Gestión de trajes',
        data: { section: path },
        loadComponent: () =>
          import('./features/home/section-placeholder').then(
            (m) => m.SectionPlaceholder,
          ),
      })),
    ],
  },
  { path: '**', redirectTo: 'inicio' },
];
