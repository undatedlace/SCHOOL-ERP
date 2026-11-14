import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import {
  AttendanceDivisionReport,
  AttendanceStatus,
  StaffAttendanceRoster,
} from '../../core/models';
import { formatDate, toIsoDate } from '../../shared/dates';
import { DateField } from '../../shared/ui/date-field';
import { PageHeader } from '../../shared/ui/page-header';
import { AttendanceGrid } from '../attendance/attendance-grid';
import { STATUSES, monthBounds } from '../attendance/attendance-utils';
import { StaffDrafts, asGridReport, staffChanges, staffDraftsFrom } from './staff-grid';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { HasPermission } from '../../shared/has-permission.directive';
import { StaffAttendanceImport } from '../imports/import-launchers';

type Tab = 'take' | 'report';

/** Attendance of teachers and other staff. The admin marks it; the office can look. */
@Component({
  selector: 'app-staff-attendance-page',
  imports: [
    DateField,
    FormsModule,
    ButtonModule,
    MessageModule,
    PageHeader,
    AttendanceGrid,
    SelectButtonModule,
    InputTextModule,
    HasPermission,
    StaffAttendanceImport,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Staff attendance"
      subtitle="Attendance of teachers and other staff. Students' attendance is under Attendance, Students."
    >
      <app-staff-attendance-import
        *appHasPermission="'staff_attendance.manage'"
        (imported)="afterImport()"
      />
    </app-page-header>

    <div class="mb-4 flex flex-wrap items-end gap-3">
      @if (tab() === 'take') {
        <div class="flex flex-col gap-1 text-xs text-muted-foreground">
          <span aria-hidden="true">Date</span
          ><app-date-field
            label="Date"
            [max]="today"
            [value]="date()"
            (valueChange)="onDate($event)"
          />
        </div>
      } @else {
        <div class="flex flex-col gap-1 text-xs text-muted-foreground">
          <span aria-hidden="true">From</span
          ><app-date-field
            label="From"
            [max]="today"
            [value]="from()"
            (valueChange)="onRange('from', $event)"
          />
        </div>
        <div class="flex flex-col gap-1 text-xs text-muted-foreground">
          <span aria-hidden="true">To</span
          ><app-date-field
            label="To"
            [max]="today"
            [value]="to()"
            (valueChange)="onRange('to', $event)"
          />
        </div>
        <div class="flex gap-1" role="group" aria-label="Quick range">
          <p-button
            label="This month"
            severity="secondary"
            [outlined]="true"
            (onClick)="preset(0)"
          />
          <p-button
            label="Last month"
            severity="secondary"
            [outlined]="true"
            (onClick)="preset(1)"
          />
        </div>
      }
      <p-selectbutton
        class="ml-auto"
        [options]="tabs"
        optionLabel="label"
        optionValue="id"
        [allowEmpty]="false"
        [ngModel]="tab()"
        (ngModelChange)="setTab($event)"
        aria-label="Take attendance or see the report"
      />
    </div>

    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else if (tab() === 'take') {
      @if (roster(); as r) {
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <p class="text-sm text-muted-foreground">
            {{ dateText(r.date) }}.
            @if (r.marked) {
              {{ r.counts.present }} present, {{ r.counts.late }} late,
              {{ r.counts.absent }} absent, {{ r.counts.onLeave }} on leave.
            } @else {
              Not marked yet.
            }
          </p>
          @if (r.canMark) {
            <p-button
              label="Mark everyone present"
              size="small"
              severity="secondary"
              [outlined]="true"
              (onClick)="allPresent()"
            />
          }
        </div>
        @if (!r.canMark) {
          <p-message
            class="mb-3 block"
            severity="info"
            text="You can look at this day but not change it. The school admin marks staff attendance."
          />
        }

        <ul class="divide-y rounded-xl border-0 bg-card shadow-sm">
          @for (s of r.staff; track s.staffId) {
            <li class="flex flex-wrap items-center gap-3 p-3">
              <div class="min-w-40 flex-1">
                <div class="font-medium">{{ s.name }}</div>
                @if (s.fromLeave) {
                  <div class="text-xs text-muted-foreground">
                    On approved leave: {{ s.fromLeave }}
                  </div>
                }
                <div class="text-xs text-muted-foreground">
                  {{ s.designation }} &middot; No. {{ s.employeeNo }}
                </div>
              </div>
              <p-selectbutton
                [options]="statuses"
                optionLabel="label"
                optionValue="value"
                [allowEmpty]="false"
                [disabled]="!r.canMark"
                [ngModel]="draft(s.staffId).status"
                (ngModelChange)="set(s.staffId, $event)"
                [attr.aria-label]="'Attendance for ' + s.name"
                size="small"
              />
              @if (r.canMark && s.status && !s.fromLeave) {
                <p-button
                  label="Remove mark"
                  size="small"
                  severity="danger"
                  [text]="true"
                  [ariaLabel]="'Remove the saved mark for ' + s.name"
                  (onClick)="remove(s.staffId, s.name)"
                />
              }
              @if (draft(s.staffId).status && draft(s.staffId).status !== 'PRESENT') {
                <input
                  pInputText
                  pSize="small"
                  class="w-full sm:w-56"
                  placeholder="Note (optional), for example the reason"
                  maxlength="200"
                  [attr.aria-label]="'Note for ' + s.name"
                  [disabled]="!r.canMark"
                  [ngModel]="draft(s.staffId).note"
                  (ngModelChange)="setNote(s.staffId, $event)"
                />
              }
            </li>
          } @empty {
            <li class="p-4 text-center text-muted-foreground">
              No staff were working on this day.
            </li>
          }
        </ul>

        @if (r.canMark) {
          <div
            class="sticky bottom-0 mt-3 flex items-center gap-3 rounded-xl bg-card p-3 shadow-md"
          >
            <p-button
              label="Save attendance"
              [disabled]="pending().length === 0"
              [loading]="saving()"
              (onClick)="save()"
            />
            <span class="text-sm text-muted-foreground">
              @if (pending().length) {
                {{ pending().length }} change{{ pending().length === 1 ? '' : 's' }} to save.
              } @else if (r.marked) {
                Everything shown is saved.
              }
            </span>
          </div>
        }
      } @else {
        <p class="text-muted-foreground">Loading...</p>
      }
    } @else if (report(); as rep) {
      <app-attendance-grid [report]="rep" nameHeader="Name" numberLabel="Emp. no." />
    } @else {
      <p class="text-muted-foreground">Loading...</p>
    }
  `,
})
export class StaffAttendancePage {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly statuses = STATUSES;
  protected readonly today = toIsoDate(new Date());
  protected readonly dateText = formatDate;
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'take', label: 'Take attendance' },
    { id: 'report', label: 'Report' },
  ];

  protected readonly tab = signal<Tab>('take');
  protected readonly date = signal(this.today);
  protected readonly from = signal(this.today.slice(0, 8) + '01');
  protected readonly to = signal(this.today);
  protected readonly roster = signal<StaffAttendanceRoster | null>(null);
  protected readonly report = signal<AttendanceDivisionReport | null>(null);
  protected readonly drafts = signal<StaffDrafts>({});
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly pending = computed(() => {
    const r = this.roster();
    return r ? staffChanges(r, this.drafts()) : [];
  });

  constructor() {
    void this.load();
  }

  protected draft(id: string) {
    return this.drafts()[id] ?? { status: null, note: '' };
  }

  protected set(id: string, status: AttendanceStatus) {
    this.drafts.update((d) => ({ ...d, [id]: { ...this.draft(id), status } }));
  }

  protected setNote(id: string, note: string) {
    this.drafts.update((d) => ({ ...d, [id]: { ...this.draft(id), note } }));
  }

  protected allPresent() {
    const r = this.roster();
    if (!r) return;
    this.drafts.update((d) => ({
      ...d,
      ...Object.fromEntries(
        r.staff
          .filter((s) => !d[s.staffId]?.status)
          .map((s) => [s.staffId, { status: 'PRESENT' as AttendanceStatus, note: '' }]),
      ),
    }));
  }

  protected setTab(tab: Tab) {
    this.tab.set(tab);
    void this.load();
  }

  protected onDate(value: string) {
    if (!value) return;
    this.date.set(value);
    void this.load();
  }

  protected onRange(which: 'from' | 'to', value: string) {
    if (!value) return;
    (which === 'from' ? this.from : this.to).set(value);
    void this.load();
  }

  /** This month so far (0) or the whole of last month (1). */
  protected preset(monthsBack: number) {
    const b = monthBounds(this.today, monthsBack);
    this.from.set(b.from);
    this.to.set(monthsBack === 0 ? this.today : b.to);
    void this.load();
  }

  protected async save() {
    const entries = this.pending();
    if (entries.length === 0) return;
    this.saving.set(true);
    try {
      const roster = await firstValueFrom(this.api.markStaffAttendance(this.date(), entries));
      this.roster.set(roster);
      this.drafts.set(staffDraftsFrom(roster));
      this.toast.add({ severity: 'success', summary: 'Attendance saved' });
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: apiError(error) });
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(staffId: string, name: string) {
    try {
      const roster = await firstValueFrom(this.api.clearStaffAttendance(staffId, this.date()));
      this.roster.set(roster);
      this.drafts.set(staffDraftsFrom(roster));
      this.toast.add({ severity: 'success', summary: `Mark removed for ${name}` });
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not remove', detail: apiError(error) });
    }
  }

  /** After an Excel import: show the marks that came in. */
  protected afterImport() {
    void this.load();
  }

  private async load() {
    this.error.set(null);
    try {
      if (this.tab() === 'take') {
        this.roster.set(null);
        const roster = await firstValueFrom(this.api.staffAttendance(this.date()));
        this.roster.set(roster);
        this.drafts.set(staffDraftsFrom(roster));
      } else {
        this.report.set(null);
        this.report.set(
          asGridReport(
            await firstValueFrom(
              this.api.staffAttendanceReport({ from: this.from(), to: this.to() }),
            ),
          ),
        );
      }
    } catch (error) {
      this.error.set(apiError(error));
    }
  }
}
