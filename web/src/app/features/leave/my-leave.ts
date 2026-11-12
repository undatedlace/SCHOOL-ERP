import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { LeaveBalance, LeaveRequest, LeaveType } from '../../core/models';
import { formatDate, toIsoDate } from '../../shared/dates';
import { PageHeader } from '../../shared/ui/page-header';
import { LeaveApplyDialog } from './leave-apply-dialog';
import { STATUS_LABEL, STATUS_SEVERITY, canWithdraw, daysText } from './leave-utils';
import { Badge } from '../../shared/ui/badge';

/** A member of staff's own leave: what is left, what they asked for, and a way to ask. */
@Component({
  selector: 'app-my-leave',
  imports: [RouterLink, ButtonModule, PageHeader, LeaveApplyDialog, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="My leave"
      subtitle="What you have left this year, and your requests. An administrator approves them."
    >
      <p-button
        label="Ask for leave"
        [disabled]="types().length === 0"
        (onClick)="dialog().open()"
      />
    </app-page-header>

    @if (error()) {
      <p class="mb-3 text-sm text-destructive" role="alert">{{ error() }}</p>
    }

    @if (balance(); as b) {
      <p class="mb-3 text-sm text-muted-foreground">Academic year {{ b.academicYear.name }}</p>
      @if (b.balances.length === 0) {
        <p class="mb-6 rounded-xl bg-card p-4 text-sm shadow-sm">
          The school has not set up leave for this year yet. An administrator does this before the
          year starts.
        </p>
      } @else {
        <section class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Balances">
          @for (row of b.balances; track row.leaveType.id) {
            <div class="rounded-xl bg-lavender p-4">
              <div class="text-sm font-medium">{{ row.leaveType.name }}</div>
              <div class="text-2xl font-semibold">
                @if (row.remaining === null) {
                  No limit
                } @else {
                  {{ row.remaining }}
                  <span class="text-sm font-normal"
                    >of {{ row.entitled + row.carriedOver }} left</span
                  >
                }
              </div>
              @if (row.carriedOver > 0) {
                <div class="mt-1 text-xs">
                  Includes {{ row.carriedOver }} day(s) carried over from last year
                </div>
              }
              <div class="mt-1 text-xs">
                Taken {{ row.taken }} &middot; Coming up {{ row.upcoming }} &middot; Waiting
                {{ row.pending }}
              </div>
            </div>
          }
        </section>
      }
    }

    <div class="overflow-x-auto rounded-xl border-0 bg-card shadow-sm">
      <table class="app-table w-full min-w-[40rem] text-sm">
        <thead>
          <tr class="bg-accent text-left">
            <th scope="col" class="px-4 py-3">Dates</th>
            <th scope="col" class="px-4 py-3">Kind</th>
            <th scope="col" class="px-4 py-3">Days</th>
            <th scope="col" class="px-4 py-3">Status</th>
            <th scope="col" class="px-4 py-3">Note</th>
            <th scope="col" class="px-4 py-3"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (r of requests(); track r.id) {
            <tr class="border-t">
              <td class="px-4 py-3 whitespace-nowrap">
                {{ format(r.startsOn) }}
                @if (r.endsOn !== r.startsOn) {
                  - {{ format(r.endsOn) }}
                }
              </td>
              <td class="px-4 py-3">{{ r.leaveType.name }}</td>
              <td class="px-4 py-3">{{ daysText(r.days) }}</td>
              <td class="px-4 py-3">
                <app-badge [label]="label[r.status]" [severity]="severity[r.status]" />
              </td>
              <td class="px-4 py-3 text-muted-foreground">{{ r.decisionNote || r.reason }}</td>
              <td class="px-4 py-3 text-right">
                @if (withdrawable(r)) {
                  <p-button
                    label="Withdraw"
                    size="small"
                    [text]="true"
                    severity="danger"
                    [ariaLabel]="'Withdraw leave from ' + format(r.startsOn)"
                    (onClick)="withdraw(r)"
                  />
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6" class="p-4 text-center text-muted-foreground">
                {{ loaded() ? 'You have not asked for any leave.' : 'Loading...' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <p class="mt-3 text-xs text-muted-foreground">
      Your leave also appears on the <a routerLink="/app/calendar" class="app-link">calendar</a>.
    </p>

    <app-leave-apply-dialog [types]="types()" (saved)="reload()" />
  `,
})
export class MyLeave {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly dialog = viewChild.required(LeaveApplyDialog);

  protected readonly label = STATUS_LABEL;
  protected readonly severity = STATUS_SEVERITY;
  protected readonly daysText = daysText;
  protected readonly format = formatDate;
  private readonly today = toIsoDate(new Date());

  protected readonly balance = signal<LeaveBalance | null>(null);
  protected readonly types = signal<LeaveType[]>([]);
  protected readonly requests = signal<LeaveRequest[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.reload();
  }

  protected withdrawable = (r: LeaveRequest) => canWithdraw(r.status, r.endsOn, this.today);

  protected async reload() {
    this.error.set(null);
    try {
      const [balance, types, requests] = await Promise.all([
        firstValueFrom(this.api.leaveBalance()),
        firstValueFrom(this.api.leaveTypes()),
        firstValueFrom(this.api.leaveRequests({ page: 1, pageSize: 50 })),
      ]);
      this.balance.set(balance);
      this.types.set(types);
      this.requests.set(requests.items);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }

  protected withdraw(r: LeaveRequest) {
    this.confirm.confirm({
      header: 'Withdraw this leave?',
      message: `${r.leaveType.name}, ${formatDate(r.startsOn)}. The days go back to your balance.`,
      acceptLabel: 'Withdraw',
      rejectLabel: 'Keep it',
      accept: async () => {
        try {
          await firstValueFrom(this.api.cancelLeave(r.id));
          this.toast.add({ severity: 'success', summary: 'Leave withdrawn' });
          await this.reload();
        } catch (error) {
          this.toast.add({
            severity: 'error',
            summary: 'Could not withdraw',
            detail: apiError(error),
          });
        }
      },
    });
  }
}
