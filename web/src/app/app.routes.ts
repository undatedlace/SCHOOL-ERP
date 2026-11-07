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
        path: 'admissions',
        canActivate: [permissionGuard('admissions.read')],
        loadComponent: () =>
          import('./features/admissions/applications').then((m) => m.Applications),
      },
      {
        // Before ':id', so "new" is not read as an id.
        path: 'admissions/new',
        canActivate: [permissionGuard('admissions.manage')],
        loadComponent: () =>
          import('./features/admissions/application-new').then((m) => m.ApplicationNew),
      },
      {
        path: 'admissions/:id',
        canActivate: [permissionGuard('admissions.read')],
        loadComponent: () =>
          import('./features/admissions/application-page').then((m) => m.ApplicationPage),
      },
      {
        path: 'students',
        canActivate: [permissionGuard('students.read_all')],
        loadComponent: () =>
          import('./features/students/students-list').then((m) => m.StudentsList),
      },
      {
        path: 'students/:id',
        canActivate: [permissionGuard('students.read_all')],
        loadComponent: () => import('./features/students/student-page').then((m) => m.StudentPage),
      },
      {
        path: 'settings/forms',
        canActivate: [permissionGuard('forms.manage')],
        loadComponent: () => import('./features/forms/forms-list').then((m) => m.FormsList),
      },
      {
        path: 'settings/forms/:key',
        canActivate: [permissionGuard('forms.manage')],
        loadComponent: () => import('./features/forms/form-builder').then((m) => m.FormBuilder),
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
