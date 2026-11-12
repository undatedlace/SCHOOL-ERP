import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { TableModule } from '@openng/optimus-ui/table';
import { apiError } from '../../core/api-error';
import { IssuedLogin, PlatformSchoolRow, PlatformService } from '../../core/platform.service';
import { formatDate } from '../../shared/dates';
import { Avatar } from '../../shared/ui/avatar';
import { Badge } from '../../shared/ui/badge';
import { PageHeader } from '../../shared/ui/page-header';
import { StatTile } from '../../shared/ui/stat-tile';
import { IssuedLoginsDialog } from './issued-logins-dialog';
import { OnboardDialog, Onboarded } from './onboard-dialog';

/** Every school on the system, with counts only (an owner never opens a school's records). */
@Component({
  selector: 'app-platform-schools',
  imports: [
    RouterLink,
    ButtonModule,
    TableModule,
    Avatar,
    Badge,
    PageHeader,
    StatTile,
    OnboardDialog,
    IssuedLoginsDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Schools"
      [crumbs]="[{ label: 'Platform', link: '/platform' }, { label: 'Schools' }]"
      subtitle="Onboard a school and hand its first administrators their logins. Each school runs itself from there."
    >
      <p-button label="Onboard a school" (onClick)="onboardOpen.set(true)" />
    </app-page-header>

    <section aria-label="Totals" class="mb-6 grid gap-4 sm:grid-cols-3">
      <app-stat-tile
        label="Schools"
        icon="home"
        tone="primary"
        [value]="'' + rows().length"
        [hint]="active() + ' active'"
      />
      <app-stat-tile
        label="Students"
        icon="students"
        tone="info"
        [value]="'' + total('students')"
        hint="Studying now, all schools"
      />
      <app-stat-tile
        label="Staff"
        icon="teachers"
        tone="amber"
        [value]="'' + total('staff')"
        hint="Working now, all schools"
      />
    </section>

    <section class="overflow-hidden rounded-xl bg-card shadow-sm">
      @if (error(); as text) {
        <p class="p-5 text-sm text-destructive" role="alert">{{ text }}</p>
      }
      <p-table [value]="rows()" [loading]="loading()" [tableStyle]="{ 'min-width': '48rem' }">
        <ng-template #header>
          <tr>
            <th class="!pl-5">School</th>
            <th>Code</th>
            <th class="text-right">Students</th>
            <th class="text-right">Staff</th>
            <th class="text-right">Logins</th>
            <th>Onboarded</th>
            <th class="!pr-5">Status</th>
          </tr>
        </ng-template>
        <ng-template #body let-s>
          <tr>
            <td class="!pl-5">
              <div class="flex items-center gap-3">
                <app-avatar [name]="s.name" size="sm" />
                <div class="min-w-0 leading-tight">
                  <a class="app-link font-semibold" [routerLink]="['/platform/schools', s.id]">{{
                    s.name
                  }}</a>
                  @if (s.isHome) {
                    <p class="mt-1 text-xs text-muted-foreground">
                      Home school: signs in without a code
                    </p>
                  }
                </div>
              </div>
            </td>
            <td class="font-mono text-sm">{{ s.code }}</td>
            <td class="text-right tabular-nums">{{ s.students }}</td>
            <td class="text-right tabular-nums">{{ s.staff }}</td>
            <td class="text-right tabular-nums">{{ s.logins }}</td>
            <td class="text-sm whitespace-nowrap">{{ date(s.createdAt) }}</td>
            <td class="!pr-5">
              <app-badge
                [label]="s.status === 'ACTIVE' ? 'Active' : 'Paused'"
                [tone]="s.status === 'ACTIVE' ? 'good' : 'warn'"
              />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="7" class="p-8 text-center text-muted-foreground">No schools yet.</td>
          </tr>
        </ng-template>
      </p-table>
    </section>

    <app-onboard-dialog [(visible)]="onboardOpen" (done)="onboarded($event)" />
    <app-issued-logins-dialog
      [logins]="issued()"
      [schoolCode]="issuedCode()"
      (closed)="afterLogins()"
    />
  `,
})
export class PlatformSchoolsPage {
  private readonly platform = inject(PlatformService);
  private readonly router = inject(Router);

  protected readonly date = formatDate;
  protected readonly rows = signal<PlatformSchoolRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly onboardOpen = signal(false);
  protected readonly issued = signal<IssuedLogin[] | null>(null);
  protected readonly issuedCode = signal<string | null>(null);
  private newSchoolId: string | null = null;

  constructor() {
    void this.load();
  }

  protected active() {
    return this.rows().filter((s) => s.status === 'ACTIVE').length;
  }

  protected total(key: 'students' | 'staff') {
    return this.rows().reduce((n, s) => n + s[key], 0);
  }

  protected onboarded(result: Onboarded) {
    this.newSchoolId = result.school.id;
    this.issuedCode.set(result.school.code);
    this.issued.set(result.logins);
    void this.load();
  }

  protected async afterLogins() {
    this.issued.set(null);
    if (this.newSchoolId) {
      const id = this.newSchoolId;
      this.newSchoolId = null;
      await this.router.navigate(['/platform/schools', id]);
    }
  }

  private async load() {
    this.loading.set(true);
    try {
      this.rows.set(await firstValueFrom(this.platform.schools()));
      this.error.set(null);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loading.set(false);
    }
  }
}
