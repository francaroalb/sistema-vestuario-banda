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
        path: 'inventario/importar',
        title: 'Importar prendas · Gestión de trajes',
        data: { kind: 'garments' },
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/productivity/import-page').then(
            (m) => m.ImportPage,
          ),
      },
      {
        path: 'personas/importar',
        title: 'Importar personas · Gestión de trajes',
        data: { kind: 'people' },
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/productivity/import-page').then(
            (m) => m.ImportPage,
          ),
      },
      {
        path: 'actuaciones/series/:id/duplicar',
        title: 'Duplicar serie · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/productivity/copy-series').then(
            (m) => m.CopySeries,
          ),
      },
      {
        path: 'conflictos',
        title: 'Conflictos · Gestión de trajes',
        loadComponent: () =>
          import('./features/conflicts/conflict-list').then(
            (m) => m.ConflictList,
          ),
      },
      {
        path: 'inicio',
        title: 'Inicio · Gestión de trajes',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
      },
      {
        path: 'inventario/carpetas/mantenimiento',
        title: 'Mantenimiento · Gestión de trajes',
        loadComponent: () =>
          import('./features/maintenance/maintenance-list').then(
            (m) => m.MaintenanceList,
          ),
      },
      {
        path: 'inventario/carpetas/incidencias/:family/nueva',
        title: 'Nueva incidencia · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/maintenance/issue-form').then((m) => m.IssueForm),
      },
      {
        path: 'inventario/carpetas/incidencias/:family/:id',
        title: 'Incidencia · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/maintenance/issue-form').then((m) => m.IssueForm),
      },
      {
        path: 'inventario/carpetas/repertorio/nueva',
        title: 'Nueva obra · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/repertoire/work-form').then((m) => m.WorkForm),
      },
      {
        path: 'inventario/carpetas/repertorio/:id/editar',
        title: 'Editar obra · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/repertoire/work-form').then((m) => m.WorkForm),
      },
      {
        path: 'inventario/carpetas/repertorio/:id',
        title: 'Ficha de obra · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/repertoire/work-detail').then((m) => m.WorkDetail),
      },
      {
        path: 'inventario/carpetas/repertorio',
        title: 'Repertorio · Gestión de trajes',
        loadComponent: () =>
          import('./features/repertoire/repertoire-list').then(
            (m) => m.RepertoireList,
          ),
      },
      {
        path: 'inventario/carpetas/:id/contenido',
        title: 'Contenido de carpeta · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/repertoire/folder-content').then(
            (m) => m.FolderContent,
          ),
      },
      {
        path: 'inventario/carpetas/nueva',
        title: 'Nueva carpeta · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/folders/folder-form').then((m) => m.FolderForm),
      },
      {
        path: 'inventario/carpetas/:id/editar',
        title: 'Editar carpeta · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/folders/folder-form').then((m) => m.FolderForm),
      },
      {
        path: 'inventario/carpetas/:id',
        title: 'Ficha de carpeta · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/folders/folder-detail').then(
            (m) => m.FolderDetail,
          ),
      },
      {
        path: 'inventario/carpetas',
        title: 'Carpetas · Gestión de trajes',
        loadComponent: () =>
          import('./features/folders/folder-list').then((m) => m.FolderList),
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
        path: 'cesiones/carpetas/nueva',
        title: 'Cesiones de carpetas · Gestión de trajes',
        data: { action: 'DELIVER' },
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/folder-loans/folder-loan-operation').then(
            (m) => m.FolderLoanOperation,
          ),
      },
      {
        path: 'cesiones/carpetas/:id/entregar',
        title: 'Cesiones de carpetas · Gestión de trajes',
        data: { action: 'DELIVER' },
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/folder-loans/folder-loan-operation').then(
            (m) => m.FolderLoanOperation,
          ),
      },
      {
        path: 'cesiones/carpetas/:id/devolver',
        title: 'Cesiones de carpetas · Gestión de trajes',
        data: { action: 'RETURN' },
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/folder-loans/folder-loan-operation').then(
            (m) => m.FolderLoanOperation,
          ),
      },
      {
        path: 'cesiones/carpetas/:id/cancelar',
        title: 'Cesiones de carpetas · Gestión de trajes',
        data: { action: 'CANCEL' },
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/folder-loans/folder-loan-operation').then(
            (m) => m.FolderLoanOperation,
          ),
      },
      {
        path: 'cesiones/carpetas/:id',
        title: 'Cesiones de carpetas · Gestión de trajes',
        loadComponent: () =>
          import('./features/folder-loans/folder-loan-detail').then(
            (m) => m.FolderLoanDetail,
          ),
      },
      {
        path: 'cesiones/carpetas',
        title: 'Cesiones de carpetas · Gestión de trajes',
        loadComponent: () =>
          import('./features/folder-loans/folder-loan-list').then(
            (m) => m.FolderLoanList,
          ),
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
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
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
        path: 'actuaciones/series',
        title: 'Series · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/events/series-list').then((m) => m.SeriesList),
      },
      {
        path: 'actuaciones/series/:id',
        title: 'Preparar serie · Gestión de trajes',
        canDeactivate: [(c: { canLeave(): boolean }) => c.canLeave()],
        loadComponent: () =>
          import('./features/events/series-detail').then(
            (m) => m.SeriesDetailPage,
          ),
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
