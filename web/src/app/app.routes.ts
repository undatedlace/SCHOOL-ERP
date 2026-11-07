import { Routes } from '@angular/router';
import {
  authGuard,
  guestGuard,
  homeGuard,
  loggedInGuard,
  permissionGuard,
  portalGuard,
  staffGuard,
} from './core/auth.guards';
import { AuthShell } from './layouts/auth-shell';
import { PortalShell } from './layouts/portal-shell';
import { StaffShell } from './layouts/staff-shell';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },

  {
    path: '',
    component: AuthShell,
    children: [
      {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/login').then((m) => m.Login),
      },
      {
        path: 'change-password',
        canActivate: [loggedInGuard],
        loadComponent: () =>
          import('./features/auth/change-password').then((m) => m.ChangePassword),
      },
    ],
  },

  {
    path: 'app',
    component: StaffShell,
    canActivate: [authGuard, staffGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'academic-setup',
        canActivate: [permissionGuard('academics.read')],
        loadComponent: () =>
          import('./features/academic-setup/academic-setup').then((m) => m.AcademicSetup),
      },
      {
        path: 'settings/school',
        canActivate: [permissionGuard('settings.manage')],
        loadComponent: () =>
          import('./features/settings/school-settings').then((m) => m.SchoolSettings),
      },
      {
        path: 'settings/users',
        canActivate: [permissionGuard('users.manage')],
        loadComponent: () => import('./features/settings/users').then((m) => m.Users),
      },
      {
        path: 'audit-log',
        canActivate: [permissionGuard('audit.read')],
        loadComponent: () => import('./features/audit/audit-log').then((m) => m.AuditLog),
      },
    ],
  },

  {
    path: 'portal',
    component: PortalShell,
    canActivate: [authGuard, portalGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/portal/portal-home').then((m) => m.PortalHome),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
