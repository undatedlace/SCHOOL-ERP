import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { SchoolClass } from '../../core/models';
import { FilterBar, FilterField, FilterValues } from '../../shared/ui/filter-bar';
import { PageHeader } from '../../shared/ui/page-header';
import { Avatar } from '../../shared/ui/avatar';
import { Badge, ClassPill } from '../../shared/ui/badge';
import { StudentLeave, StudentLeaveApi, StudentLeaveStatus } from './student-leave.service';
import { STATUS_LABEL, STATUS_SEVERITY, daysText, rangeText } from './student-leave-utils';

const STATUSES: StudentLeaveStatus[] = ['PENDING', 'APPROVED', 'REFUSED', 'WITHDRAWN'];

/**
 * Absences that families have reported. The class teacher (and the school admin) approve or refuse;
 * office staff can look. What each person sees is decided by the API.
 */
@Component({
  selector: 'app-student-leave-page',
  imports: [
    ButtonModule,
    DialogModule,
    FormsModule,
    RouterLink,
    SelectButtonModule,
    TextareaModule,
    FilterBar,
    PageHeader,
    Avatar,
    Badge,
    ClassPill,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Student leave"
      [crumbs]="[{ label: 'Dashboard', link: '/app/dashboard' }, { label: 'Student leave' }]"
      subtitle="Absences reported by parents and students. Approved leave is suggested when attendance is taken."
    />

    <section class="overflow-hidden rounded-xl bg-card shadow-sm">
      <div class="flex flex-col gap-4 border-b p-5 pb-1">
        <p-selectbutton
          [options]="tabs()"
          optionLabel="label"
          optionValue="value"
          [allowEmpty]="false"
          [ngModel]="tab()"
          (ngModelChange)="setTab($event)"
          aria-label="Show requests by status"
        >
          <ng-template #item let-item>
            <span>{{ item.label }}</span>
            <span
              class="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-muted-foreground tabular-nums"
              >{{ item.count }}</span
            >
          </ng-template>
        </p-selectbutton>
        <app-filter-bar [fields]="fields()" (changed)="onFilters($event)" />
      </div>

      @if (error()) {
        <p class="p-5 text-sm text-destructive" role="alert">{{ error() }}</p>
      }

      <div class="overflow-x-auto">
        <table class="app-table w-full min-w-[52rem] text-sm">
          <thead>
            <tr class="text-left">
              <th scope="col" class="!pl-5">Student</th>
              <th scope="col">Dates</th>
              <th scope="col">Days</th>
              <th scope="col">Reason</th>
              <th scope="col">Status</th>
              <th scope="col" class="!pr-5"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr class="border-t">
                <td class="!pl-5">
                  <div class="flex items-center gap-3">
                    <app-avatar [name]="r.student.name" />
                    <div class="min-w-0 leading-tight">
                      <a
                        class="font-semibold app-link"
                        [routerLink]="['/app/students', r.student.id]"
                        >{{ r.student.name }}</a
                      >
                      <p class="mt-1 text-xs text-muted-foreground">
                        @if (r.student.className) {
                          <app-class-pill
                            [label]="r.student.className + '-' + r.student.divisionName"
                          />
                        }
                        Asked by {{ r.requestedBy.name }}
                      </p>
                    </div>
                  </div>
                </td>
                <td class="whitespace-nowrap">{{ range(r) }}</td>
                <td class="whitespace-nowrap">{{ daysText(r.days) }}</td>
                <td class="max-w-xs text-muted-foreground">
                  {{ r.reason }}
                  @if (r.decisionNote) {
                    <span class="mt-1 block text-xs"
                      >{{ r.decidedBy?.name ?? 'The school' }}: {{ r.decisionNote }}</span
                    >
                  }
                </td>
                <td><app-badge [label]="label[r.status]" [severity]="severity[r.status]" /></td>
                <td class="space-x-2 !pr-5 text-right whitespace-nowrap">
                  @if (r.canDecide) {
                    <p-button
                      label="Approve"
                      size="small"
                      [text]="true"
                      [ariaLabel]="'Approve leave for ' + r.student.name"
                      (onClick)="approve(r)"
                    />
                    <p-button
                      label="Refuse"
                      size="small"
                      [text]="true"
                      severity="danger"
                      [ariaLabel]="'Refuse leave for ' + r.student.name"
                      (onClick)="startRefuse(r)"
                    />
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="p-8 text-center text-muted-foreground">
                  {{ loaded() ? 'No leave requests here.' : 'Loading...' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (total() > rows().length) {
        <p class="border-t p-4 text-sm text-muted-foreground">
          Showing the first {{ rows().length }} of {{ total() }}. Use the filters to narrow it down.
        </p>
      }
    </section>

    <p-dialog
      header="Leave not approved"
      [visible]="refusing() !== null"
      (visibleChange)="!$event && refusing.set(null)"
      [modal]="true"
      [style]="{ width: '28rem', 'max-width': '95vw' }"
    >
      <label class="mb-3 flex flex-col gap-1 text-sm" for="refuse-note">
        Why? (the family sees this)
        <textarea
          id="refuse-note"
          rows="3"
          maxlength="300"
          pTextarea
          [fluid]="true"
          [value]="note()"
          (input)="note.set($any($event.target).value)"
        ></textarea>
      </label>
      <div class="flex justify-end gap-2">
        <p-button label="Cancel" severity="secondary" (onClick)="refusing.set(null)" />
        <p-button
          label="Do not approve"
          severity="danger"
          [disabled]="note().trim().length < 1"
          (onClick)="refuse()"
        />
      </div>
    </p-dialog>
  `,
})
export class StudentLeavePage {
  private readonly leave = inject(StudentLeaveApi);
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly label = STATUS_LABEL;
  protected readonly severity = STATUS_SEVERITY;
  protected readonly daysText = daysText;
  protected readonly range = rangeText;

  protected readonly tab = signal<StudentLeaveStatus | 'ALL'>('PENDING');
  protected readonly rows = signal<StudentLeave[]>([]);
  protected readonly total = signal(0);
  protected readonly counts = signal<Record<StudentLeaveStatus, number> | null>(null);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly classes = signal<SchoolClass[]>([]);
  protected readonly refusing = signal<StudentLeave | null>(null);
  protected readonly note = signal('');
  private filters: FilterValues = {};

  protected readonly tabs = computed(() => {
    const c = this.counts();
    const sum = c ? STATUSES.reduce((n, s) => n + c[s], 0) : 0;
    return [
      ...STATUSES.map((s) => ({
        label: STATUS_LABEL[s],
        value: s as StudentLeaveStatus | 'ALL',
        count: c?.[s] ?? 0,
      })),
      { label: 'All', value: 'ALL' as StudentLeaveStatus | 'ALL', count: sum },
    ];
  });

  protected readonly fields = computed<FilterField[]>(() => [
    {
      key: 'divisionId',
      label: 'Class and division',
      type: 'select',
      placeholder: 'Any class',
      options: this.classes().flatMap((c) =>
        c.divisions.map((d) => ({ label: `${c.name}-${d.name}`, value: d.id })),
      ),
    },
    { key: 'from', label: 'From', type: 'date' },
    { key: 'to', label: 'To', type: 'date' },
  ]);

  constructor() {
    firstValueFrom(this.api.classes())
      .then((c) => this.classes.set(c))
      .catch(() => undefined);
    void this.reload();
  }

  private statusFilter(): StudentLeaveStatus | null {
    const t = this.tab();
    return t === 'ALL' ? null : t;
  }

  protected setTab(tab: StudentLeaveStatus | 'ALL') {
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
        this.leave.list({
          page: 1,
          pageSize: 50,
          status: this.statusFilter(),
          divisionId: this.filters['divisionId'],
          from: this.filters['from'],
          to: this.filters['to'],
        }),
      );
      this.rows.set(res.items);
      this.total.set(res.total);
      this.counts.set(res.counts);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }

  protected async approve(r: StudentLeave) {
    try {
      await firstValueFrom(this.leave.decide(r.id, true));
      this.toast.add({ severity: 'success', summary: `Approved for ${r.student.name}` });
      await this.reload();
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not approve', detail: apiError(error) });
    }
  }

  protected startRefuse(r: StudentLeave) {
    this.note.set('');
    this.refusing.set(r);
  }

  protected async refuse() {
    const r = this.refusing();
    if (!r) return;
    try {
      await firstValueFrom(this.leave.decide(r.id, false, this.note().trim()));
      this.refusing.set(null);
      this.toast.add({ severity: 'success', summary: `Not approved for ${r.student.name}` });
      await this.reload();
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: apiError(error) });
    }
  }
}
