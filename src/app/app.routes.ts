import { Routes } from '@angular/router';
import { authGuard, childAuthGuard, guestGuard } from './core/auth/auth.guard';
export const routes: Routes = [
  {
    path: 'login',
    title: 'Acceso · Vestuario BML',
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
        title: 'Inicio · Vestuario BML',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
      },
      ...['actuaciones', 'inventario', 'personas', 'cesiones'].map((path) => ({
        path,
        title:
          path.charAt(0).toUpperCase() + path.slice(1) + ' · Vestuario BML',
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
