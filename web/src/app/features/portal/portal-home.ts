import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-portal-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-2 text-xl font-semibold">Welcome, {{ auth.me()?.fullName }}</h1>
    <p class="text-sm text-slate-600">
      Attendance, homework, results, report cards, notices and fees will appear here once the school
      starts using those features.
    </p>
  `,
})
export class PortalHome {
  protected readonly auth = inject(AuthService);
}
