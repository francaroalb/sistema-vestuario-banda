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
      {
        path: 'personas/nueva',
        title: 'Nueva persona · Gestión de trajes',
        canDeactivate: [
          (component: { canLeave(): boolean }) => component.canLeave(),
        ],
        loadComponent: () =>
          import('./features/people/person-form').then((m) => m.PersonForm),
      },
      {
        path: 'personas/:id/editar',
        title: 'Editar persona · Gestión de trajes',
        canDeactivate: [
          (component: { canLeave(): boolean }) => component.canLeave(),
        ],
        loadComponent: () =>
          import('./features/people/person-form').then((m) => m.PersonForm),
      },
      {
        path: 'personas/:id',
        title: 'Ficha de persona · Gestión de trajes',
        loadComponent: () =>
          import('./features/people/person-detail').then((m) => m.PersonDetail),
      },
      {
        path: 'personas',
        title: 'Personas · Gestión de trajes',
        loadComponent: () =>
          import('./features/people/people-list').then((m) => m.PeopleList),
      },
      {
        path: 'cesiones/nueva',
        title: 'Nueva cesión · Gestión de trajes',
        data: { kind: 'ENTREGA' },
        canDeactivate: [
          (component: { canLeave(): boolean }) => component.canLeave(),
        ],
        loadComponent: () =>
          import('./features/loans/loan-operation').then(
            (m) => m.LoanOperation,
          ),
      },
      {
        path: 'cesiones/:id/devolver',
        title: 'Devolver prendas · Gestión de trajes',
        data: { kind: 'DEVOLUCION' },
        canDeactivate: [
          (component: { canLeave(): boolean }) => component.canLeave(),
        ],
        loadComponent: () =>
          import('./features/loans/loan-operation').then(
            (m) => m.LoanOperation,
          ),
      },
      {
        path: 'cesiones/:id/cambiar',
        title: 'Cambiar prenda · Gestión de trajes',
        data: { kind: 'CAMBIO' },
        canDeactivate: [
          (component: { canLeave(): boolean }) => component.canLeave(),
        ],
        loadComponent: () =>
          import('./features/loans/loan-operation').then(
            (m) => m.LoanOperation,
          ),
      },
      {
        path: 'cesiones/:id',
        title: 'Detalle de cesión · Gestión de trajes',
        loadComponent: () =>
          import('./features/loans/loan-detail').then((m) => m.LoanDetail),
      },
      {
        path: 'cesiones',
        title: 'Cesiones · Gestión de trajes',
        loadComponent: () =>
          import('./features/loans/loan-list').then((m) => m.LoanList),
      },
      {
        path: 'actuaciones/uniformes',
        title: 'Uniformes · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/events/uniforms').then((m) => m.Uniforms),
      },
      {
        path: 'actuaciones/nueva',
        title: 'Nueva actuación · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/events/event-form').then((m) => m.EventForm),
      },
      {
        path: 'actuaciones/:id/editar',
        title: 'Editar actuación · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/events/event-form').then((m) => m.EventForm),
      },
      {
        path: 'actuaciones/:id',
        title: 'Preparación · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/events/event-detail').then((m) => m.EventDetail),
      },
      {
        path: 'actuaciones',
        title: 'Actuaciones · Gestión de trajes',
        loadComponent: () =>
          import('./features/events/event-list').then((m) => m.EventList),
      },
    ],
  },
  { path: '**', redirectTo: 'inicio' },
];
