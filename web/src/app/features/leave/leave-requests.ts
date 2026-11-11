import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { LeaveRequest, LeaveStatus, LeaveType } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { FilterBar, FilterField, FilterValues } from '../../shared/ui/filter-bar';
import { PageHeader } from '../../shared/ui/page-header';
import { LeaveApplyDialog } from './leave-apply-dialog';
import { STATUS_LABEL, STATUS_SEVERITY, daysText } from './leave-utils';

const TABS: { id: LeaveStatus | 'ALL'; label: string }[] = [
  { id: 'PENDING', label: 'Waiting' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Refused' },
  { id: 'CANCELLED', label: 'Withdrawn' },
  { id: 'ALL', label: 'All' },
];

/** For administrators: leave waiting for a decision, everyone's leave, and recording leave for someone. */
@Component({
  selector: 'app-leave-requests',
  imports: [ButtonModule, DialogModule, TagModule, PageHeader, FilterBar, LeaveApplyDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Leave requests"
      subtitle="Approve or refuse staff leave, and record leave for someone who could not ask."
    >
      <p-button label="Record leave for someone" (onClick)="open()" />
    </app-page-header>

    <div class="mb-4 flex flex-wrap gap-1 rounded-md border p-1 w-fit" role="tablist">
      @for (t of tabs; track t.id) {
        <button
          type="button"
          role="tab"
          class="rounded px-3 py-1 text-sm"
          [class.bg-primary]="tab() === t.id"
          [class.text-primary-foreground]="tab() === t.id"
          [attr.aria-selected]="tab() === t.id"
          (click)="setTab(t.id)"
        >
          {{ t.label }}
        </button>
      }
    </div>

    <app-filter-bar [fields]="fields()" (changed)="onFilters($event)" />

    @if (error()) {
      <p class="mb-3 text-sm text-destructive" role="alert">{{ error() }}</p>
    }

    <div class="overflow-x-auto rounded-xl border-0 bg-card shadow-sm">
      <table class="w-full min-w-[48rem] text-sm">
        <thead>
          <tr class="bg-accent text-left">
            <th scope="col" class="px-4 py-3">Staff</th>
            <th scope="col" class="px-4 py-3">Dates</th>
            <th scope="col" class="px-4 py-3">Kind</th>
            <th scope="col" class="px-4 py-3">Days</th>
            <th scope="col" class="px-4 py-3">Reason</th>
            <th scope="col" class="px-4 py-3">Status</th>
            <th scope="col" class="px-4 py-3"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr class="border-t">
              <td class="px-4 py-3">
                <span class="font-medium">{{ r.staff.name }}</span>
                <span class="block text-xs text-muted-foreground">{{ r.staff.designation }}</span>
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                {{ format(r.startsOn) }}
                @if (r.endsOn !== r.startsOn) {
                  - {{ format(r.endsOn) }}
                }
              </td>
              <td class="px-4 py-3">{{ r.leaveType.name }}</td>
              <td class="px-4 py-3">{{ daysText(r.days) }}</td>
              <td class="px-4 py-3 text-muted-foreground">{{ r.decisionNote || r.reason }}</td>
              <td class="px-4 py-3">
                <p-tag [value]="label[r.status]" [severity]="severity[r.status]" />
              </td>
              <td class="space-x-3 px-4 py-3 text-right whitespace-nowrap">
                @if (r.status === 'PENDING') {
                  <button
                    type="button"
                    class="app-link"
                    [attr.aria-label]="'Approve leave for ' + r.staff.name"
                    (click)="approve(r)"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    class="app-link"
                    [attr.aria-label]="'Refuse leave for ' + r.staff.name"
                    (click)="startRefuse(r)"
                  >
                    Refuse
                  </button>
                } @else if (r.status === 'APPROVED') {
                  <button
                    type="button"
                    class="app-link"
                    [attr.aria-label]="'Withdraw leave for ' + r.staff.name"
                    (click)="withdraw(r)"
                  >
                    Withdraw
                  </button>
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="7" class="p-4 text-center text-muted-foreground">
                {{ loaded() ? 'Nothing here.' : 'Loading...' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    @if (total() > rows().length) {
      <p class="mt-3 text-sm text-muted-foreground">
        Showing the first {{ rows().length }} of {{ total() }}. Use the filters to narrow it down.
      </p>
    }

    <p-dialog
      header="Refuse this leave"
      [visible]="refusing() !== null"
      (visibleChange)="!$event && refusing.set(null)"
      [modal]="true"
      [style]="{ width: '28rem', 'max-width': '95vw' }"
    >
      <label class="mb-3 flex flex-col gap-1 text-sm" for="refuse-note">
        Why is it refused? (the person sees this)
        <textarea
          id="refuse-note"
          rows="3"
          maxlength="300"
          class="rounded-md border bg-background p-3"
          [value]="note()"
          (input)="note.set($any($event.target).value)"
        ></textarea>
      </label>
      <div class="flex justify-end gap-2">
        <p-button label="Cancel" severity="secondary" (onClick)="refusing.set(null)" />
        <p-button
          label="Refuse leave"
          severity="danger"
          [disabled]="note().trim().length < 3"
          (onClick)="refuse()"
        />
      </div>
    </p-dialog>

    <app-leave-apply-dialog [types]="types()" [staff]="people()" (saved)="reload()" />
  `,
})
export class LeaveRequests {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly dialog = viewChild.required(LeaveApplyDialog);

  protected readonly tabs = TABS;
  protected readonly label = STATUS_LABEL;
  protected readonly severity = STATUS_SEVERITY;
  protected readonly daysText = daysText;
  protected readonly format = formatDate;

  protected readonly tab = signal<LeaveStatus | 'ALL'>('PENDING');
  protected readonly rows = signal<LeaveRequest[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly types = signal<LeaveType[]>([]);
  protected readonly people = signal<{ id: string; name: string }[]>([]);
  protected readonly refusing = signal<LeaveRequest | null>(null);
  protected readonly note = signal('');
  private filters: FilterValues = {};

  protected readonly fields = computed<FilterField[]>(() => [
    {
      key: 'leaveTypeId',
      label: 'Kind of leave',
      type: 'select',
      placeholder: 'Any kind',
      options: this.types().map((t) => ({ label: t.name, value: t.id })),
    },
    {
      key: 'staffId',
      label: 'Person',
      type: 'select',
      placeholder: 'Anyone',
      options: this.people().map((p) => ({ label: p.name, value: p.id })),
    },
    { key: 'from', label: 'From', type: 'date' },
    { key: 'to', label: 'To', type: 'date' },
  ]);

  constructor() {
    firstValueFrom(this.api.leaveTypes(true))
      .then((t) => this.types.set(t))
      .catch(() => undefined);
    firstValueFrom(this.api.staffList({ page: 1, pageSize: 100, status: 'ACTIVE' }))
      .then((p) => this.people.set(p.items.map((s) => ({ id: s.id, name: s.fullName }))))
      .catch(() => undefined);
    void this.reload();
  }

  protected open() {
    this.dialog().open();
  }

  protected setTab(tab: LeaveStatus | 'ALL') {
    this.tab.set(tab);
    void this.reload();
  }

  protected onFilters(values: FilterValues) {
    this.filters = values;
    void this.reload();
  }

  protected async reload() {
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.api.leaveRequests({
          page: 1,
          pageSize: 50,
          status: this.tab() === 'ALL' ? null : this.tab(),
          leaveTypeId: this.filters['leaveTypeId'],
          staffId: this.filters['staffId'],
          from: this.filters['from'],
          to: this.filters['to'],
        }),
      );
      this.rows.set(res.items);
      this.total.set(res.total);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }

  protected async approve(r: LeaveRequest) {
    try {
      await firstValueFrom(this.api.decideLeave(r.id, 'APPROVED'));
      this.toast.add({ severity: 'success', summary: `Approved for ${r.staff.name}` });
      await this.reload();
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not approve', detail: apiError(error) });
    }
  }

  protected startRefuse(r: LeaveRequest) {
    this.note.set('');
    this.refusing.set(r);
  }

  protected async refuse() {
    const r = this.refusing();
    if (!r) return;
    try {
      await firstValueFrom(this.api.decideLeave(r.id, 'REJECTED', this.note().trim()));
      this.refusing.set(null);
      this.toast.add({ severity: 'success', summary: `Refused for ${r.staff.name}` });
      await this.reload();
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not refuse', detail: apiError(error) });
    }
  }

  protected withdraw(r: LeaveRequest) {
    this.confirm.confirm({
      header: 'Withdraw this leave?',
      message: `${r.staff.name}, ${r.leaveType.name}, ${formatDate(r.startsOn)}. The days go back to their balance.`,
      acceptLabel: 'Withdraw',
      rejectLabel: 'Keep it',
      accept: async () => {
        try {
          await firstValueFrom(this.api.cancelLeave(r.id));
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
