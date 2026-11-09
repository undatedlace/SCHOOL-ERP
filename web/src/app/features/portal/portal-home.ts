import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { Notice, StudentAttendance, StudentLedger } from '../../core/models';
import { inr } from '../../shared/money';
import { percentText } from '../attendance/attendance-utils';
import { NoticeCard } from '../notices/notice-card';
import { ChildSwitcher } from './child-switcher';
import { PortalChildren } from './portal-children';

/** The first screen: a child's attendance and fees at a glance, and the latest notices. */
@Component({
  selector: 'app-portal-home',
  imports: [RouterLink, ChildSwitcher, NoticeCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-3 text-xl font-semibold">Welcome, {{ auth.me()?.fullName }}</h1>
    <app-child-switcher />

    @if (portal.selected(); as child) {
      <p class="mb-3 text-sm text-muted-foreground">
        {{ child.fullName }}
        @if (child.current) {
          , {{ child.current.class.name }}-{{ child.current.division.name }}
        }
      </p>
      <div class="mb-6 grid grid-cols-2 gap-3">
        <a routerLink="/portal/attendance" class="rounded-lg border bg-card p-4">
          <div class="text-xs text-muted-foreground">Attendance</div>
          <div class="text-2xl font-semibold">
            {{ attendance() ? percent(attendance()!.summary) : '-' }}
          </div>
          <div class="text-xs text-muted-foreground">this year</div>
        </a>
        <a routerLink="/portal/fees" class="rounded-lg border bg-card p-4">
          <div class="text-xs text-muted-foreground">Fees to pay</div>
          <div class="text-2xl font-semibold">
            {{ ledger() ? money(ledger()!.totals.pending) : '-' }}
          </div>
          <div class="text-xs text-muted-foreground">pay at the school office</div>
        </a>
      </div>
    } @else if (portal.loaded()) {
      <p class="mb-6 text-sm text-muted-foreground">
        No student is linked to this login yet. Please ask the school office.
      </p>
    }

    <div class="mb-2 flex items-baseline justify-between">
      <h2 class="font-semibold">Latest notices</h2>
      <a routerLink="/portal/notices" class="text-sm underline">See all</a>
    </div>
    <div class="flex flex-col gap-3">
      @for (n of notices(); track n.id) {
        <app-notice-card [notice]="n" />
      } @empty {
        <p class="text-sm text-muted-foreground">There are no notices right now.</p>
      }
    </div>
  `,
})
export class PortalHome {
  protected readonly auth = inject(AuthService);
  protected readonly portal = inject(PortalChildren);
  private readonly api = inject(Api);

  protected readonly money = inr;
  protected readonly percent = percentText;
  protected readonly attendance = signal<StudentAttendance | null>(null);
  protected readonly ledger = signal<StudentLedger | null>(null);
  protected readonly notices = signal<Notice[]>([]);

  constructor() {
    void this.portal.load();
    firstValueFrom(this.api.notices({ page: 1, pageSize: 3 }))
      .then((p) => this.notices.set(p.items))
      .catch(() => undefined);

    // A glance is best effort: a number that cannot load stays a dash.
    effect(() => {
      const id = this.portal.selected()?.id;
      this.attendance.set(null);
      this.ledger.set(null);
      if (!id) return;
      if (this.auth.has('attendance.read')) {
        firstValueFrom(this.api.studentAttendance(id))
          .then((a) => this.attendance.set(a))
          .catch(() => undefined);
      }
      if (this.auth.has('fees.read')) {
        firstValueFrom(this.api.studentFees(id))
          .then((l) => this.ledger.set(l))
          .catch(() => undefined);
      }
    });
  }
}
