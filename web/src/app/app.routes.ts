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
        path: 'notices',
        canActivate: [permissionGuard('notices.read')],
        loadComponent: () => import('./features/notices/notices-page').then((m) => m.NoticesPage),
      },
      {
        path: 'staff-attendance',
        canActivate: [permissionGuard('staff_attendance.read_all')],
        loadComponent: () =>
          import('./features/staff-attendance/staff-attendance-page').then(
            (m) => m.StaffAttendancePage,
          ),
      },
      {
        path: 'my-attendance',
        canActivate: [permissionGuard('staff_attendance.read')],
        loadComponent: () =>
          import('./features/staff-attendance/my-attendance-page').then((m) => m.MyAttendancePage),
      },
      {
        path: 'calendar',
        canActivate: [permissionGuard('calendar.read')],
        loadComponent: () =>
          import('./features/calendar/calendar-page').then((m) => m.CalendarPage),
      },
      {
        path: 'promotion',
        canActivate: [permissionGuard('students.promote')],
        loadComponent: () =>
          import('./features/promotion/promotion-page').then((m) => m.PromotionPage),
      },
      {
        path: 'attendance',
        canActivate: [permissionGuard('attendance.read')],
        loadComponent: () =>
          import('./features/attendance/attendance-page').then((m) => m.AttendancePage),
      },
      {
        path: 'fees/dues',
        canActivate: [permissionGuard('fees.read_all')],
        loadComponent: () => import('./features/fees/dues-page').then((m) => m.DuesPage),
      },
      {
        path: 'fees/collection',
        canActivate: [permissionGuard('fees.read_all')],
        loadComponent: () =>
          import('./features/fees/collection-page').then((m) => m.CollectionPage),
      },
      {
        path: 'fees/setup',
        canActivate: [permissionGuard('fees.read_all')],
        loadComponent: () => import('./features/fees/fees-setup').then((m) => m.FeesSetup),
      },
      {
        path: 'students',
        canActivate: [permissionGuard('students.read')],
        loadComponent: () =>
          import('./features/students/students-list').then((m) => m.StudentsList),
      },
      {
        path: 'students/:id',
        canActivate: [permissionGuard('students.read')],
        loadComponent: () => import('./features/students/student-page').then((m) => m.StudentPage),
      },
      {
        path: 'staff',
        canActivate: [permissionGuard('staff.read_all')],
        loadComponent: () => import('./features/staff/staff-list').then((m) => m.StaffList),
      },
      {
        path: 'staff/:id',
        canActivate: [permissionGuard('staff.read_all')],
        loadComponent: () => import('./features/staff/staff-page').then((m) => m.StaffPage),
      },
      {
        path: 'leave',
        canActivate: [permissionGuard('leave.manage')],
        loadComponent: () => import('./features/leave/leave-requests').then((m) => m.LeaveRequests),
      },
      {
        path: 'my-leave',
        canActivate: [permissionGuard('leave.apply')],
        loadComponent: () => import('./features/leave/my-leave').then((m) => m.MyLeave),
      },
      {
        path: 'settings/leave',
        canActivate: [permissionGuard('leave.manage')],
        loadComponent: () =>
          import('./features/settings/leave-settings').then((m) => m.LeaveSettings),
      },
      {
        path: 'settings/staff-types',
        canActivate: [permissionGuard('forms.manage')],
        loadComponent: () => import('./features/settings/staff-types').then((m) => m.StaffTypes),
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
      {
        path: 'attendance',
        data: { kind: 'attendance' },
        loadComponent: () =>
          import('./features/portal/portal-child-page').then((m) => m.PortalChildPage),
      },
      {
        path: 'fees',
        data: { kind: 'fees' },
        loadComponent: () =>
          import('./features/portal/portal-child-page').then((m) => m.PortalChildPage),
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./features/calendar/calendar-page').then((m) => m.CalendarPage),
      },
      {
        path: 'notices',
        loadComponent: () =>
          import('./features/portal/portal-notices').then((m) => m.PortalNotices),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
