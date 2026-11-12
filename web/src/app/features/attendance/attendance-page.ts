import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { apiError } from '../../core/api-error';
import {
  AttendanceDivision,
  AttendanceDivisionReport,
  AttendanceOverview,
  AttendanceRoster,
  AttendanceStatus,
} from '../../core/models';
import { formatDate, toIsoDate } from '../../shared/dates';
import { DateField } from '../../shared/ui/date-field';
import { PageHeader } from '../../shared/ui/page-header';
import { AttendanceGrid } from './attendance-grid';
import {
  Drafts,
  STATUSES,
  changes,
  draftsFrom,
  isLow,
  monthBounds,
  percentText,
  unmarkedCount,
} from './attendance-utils';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { InputTextModule } from '@openng/optimus-ui/inputtext';

type Tab = 'take' | 'report';

@Component({
  selector: 'app-attendance-page',
  imports: [
    DateField,
    FormsModule,
    ButtonModule,
    MessageModule,
    SelectModule,
    TableModule,
    PageHeader,
    AttendanceGrid,
    SelectButtonModule,
    InputTextModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Attendance"
      subtitle="Mark the day for a division, and see the totals."
    />

    @if (overview(); as o) {
      @if (o.divisions.length > 0) {
        <section class="mb-6" aria-label="Today">
          <h2 class="mb-2 text-sm font-semibold">Marked today</h2>
          <div class="flex flex-wrap gap-2">
            @for (d of o.divisions; track d.id) {
              <p-button
                severity="secondary"
                [outlined]="d.id !== divisionId()"
                [ariaLabel]="d.class.name + '-' + d.name"
                (onClick)="pick(d.id)"
              >
                <span class="text-left">
                  <span class="block font-semibold">{{ d.class.name }}-{{ d.name }}</span>
                  <span class="block text-xs font-normal opacity-80">
                    @if (d.done) {
                      {{ d.counts.present + d.counts.late }} in, {{ d.counts.absent }} absent
                    } @else {
                      Not marked yet
                    }
                  </span>
                </span>
              </p-button>
            }
          </div>
        </section>
      }
    }

    @if (divisions().length === 0 && loaded()) {
      <p-message
        severity="info"
        text="You have no divisions to take attendance for. A class teacher or subject teacher is set in Academic setup."
      />
    } @else {
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <p-select
          [options]="divisionOptions()"
          optionLabel="label"
          optionValue="id"
          placeholder="Choose a division"
          [ngModel]="divisionId()"
          (ngModelChange)="pick($event)"
          aria-label="Division"
          class="w-56"
        />
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
          optionValue="value"
          [allowEmpty]="false"
          [ngModel]="tab()"
          (ngModelChange)="setTab($event)"
          aria-label="Take attendance or see the report"
        />
      </div>

      @if (error()) {
        <p-message severity="error" [text]="error()!" />
      } @else if (!divisionId()) {
        <p class="text-muted-foreground">Choose a division to begin.</p>
      } @else if (tab() === 'take') {
        @if (roster(); as r) {
          <div class="mb-3 flex flex-wrap items-center gap-3">
            <p class="text-sm text-muted-foreground">
              {{ r.division.class.name }}-{{ r.division.name }} on {{ dateText(r.date) }}.
              @if (r.marked && r.markedBy) {
                Last saved by {{ r.markedBy }}.
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
              text="You can look at this day but not change it."
            />
          }

          <ul class="divide-y rounded-xl border-0 bg-card shadow-sm">
            @for (s of r.students; track s.studentId) {
              <li class="flex flex-wrap items-center gap-3 p-3">
                <div class="min-w-40 flex-1">
                  <div class="font-medium">
                    @if (s.rollNo) {
                      <span class="mr-2 text-muted-foreground">{{ s.rollNo }}</span>
                    }
                    {{ s.name }}
                  </div>
                  <div class="text-xs text-muted-foreground">Admission no. {{ s.admissionNo }}</div>
                </div>
                <div class="flex gap-1" role="group" [attr.aria-label]="'Attendance for ' + s.name">
                  <p-selectbutton
                    [options]="statuses"
                    optionLabel="label"
                    optionValue="value"
                    [allowEmpty]="false"
                    [disabled]="!r.canMark"
                    [ngModel]="draft(s.studentId).status"
                    (ngModelChange)="set(s.studentId, $event)"
                    [attr.aria-label]="'Attendance for ' + s.name"
                    size="small"
                  />
                </div>
                @if (s.status && r.canMark && auth.has('attendance.mark_all')) {
                  <p-button
                    label="Remove mark"
                    size="small"
                    severity="danger"
                    [text]="true"
                    [ariaLabel]="'Remove the saved mark for ' + s.name"
                    (onClick)="remove(s.studentId, s.name)"
                  />
                }
                @if (draft(s.studentId).status && draft(s.studentId).status !== 'PRESENT') {
                  <input
                    pInputText
                    pSize="small"
                    class="w-full sm:w-56"
                    placeholder="Note (optional)"
                    maxlength="200"
                    [attr.aria-label]="'Note for ' + s.name"
                    [disabled]="!r.canMark"
                    [ngModel]="draft(s.studentId).note"
                    (ngModelChange)="setNote(s.studentId, $event)"
                  />
                }
              </li>
            } @empty {
              <li class="p-4 text-center text-muted-foreground">
                No students are enrolled in this division on that date.
              </li>
            }
          </ul>

          @if (r.canMark && r.students.length > 0) {
            <div
              class="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t bg-background py-3"
            >
              <p-button
                label="Save attendance"
                [loading]="saving()"
                [disabled]="pending().length === 0"
                (onClick)="save()"
              />
              <span class="text-sm text-muted-foreground">
                @if (unmarked() > 0) {
                  {{ unmarked() }} not marked.
                }
                @if (pending().length > 0) {
                  {{ pending().length }} to save.
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
        <app-attendance-grid [report]="rep" />
      } @else {
        <p class="text-muted-foreground">Loading...</p>
      }
    }
  `,
})
export class AttendancePage {
  private readonly api = inject(Api);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);

  protected readonly tabs = [
    { label: 'Take attendance', value: 'take' as Tab },
    { label: 'Report', value: 'report' as Tab },
  ];
  protected readonly statuses = STATUSES;
  protected readonly today = toIsoDate(new Date());
  protected readonly dateText = formatDate;
  protected readonly percent = percentText;
  protected readonly low = isLow;

  protected readonly divisions = signal<AttendanceDivision[]>([]);
  protected readonly loaded = signal(false);
  protected readonly overview = signal<AttendanceOverview | null>(null);
  protected readonly divisionId = signal<string | null>(null);
  protected readonly tab = signal<Tab>('take');
  protected readonly date = signal(this.today);
  protected readonly from = signal(this.today.slice(0, 8) + '01');
  protected readonly to = signal(this.today);
  protected readonly roster = signal<AttendanceRoster | null>(null);
  protected readonly report = signal<AttendanceDivisionReport | null>(null);
  protected readonly drafts = signal<Drafts>({});
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly divisionOptions = computed(() =>
    this.divisions().map((d) => ({ id: d.id, label: `${d.class.name}-${d.name}` })),
  );
  protected readonly pending = computed(() => {
    const r = this.roster();
    return r ? changes(r, this.drafts()) : [];
  });
  protected readonly unmarked = computed(() => {
    const r = this.roster();
    return r ? unmarkedCount(r, this.drafts()) : 0;
  });

  constructor() {
    void this.start();
  }

  private async start() {
    try {
      const divisions = await firstValueFrom(this.api.attendanceDivisions());
      this.divisions.set(divisions);
      if (divisions.length === 1) this.divisionId.set(divisions[0].id);
      this.overview.set(await firstValueFrom(this.api.attendanceOverview()));
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
    if (this.divisionId()) await this.load();
  }

  protected draft(id: string) {
    return this.drafts()[id] ?? { status: null, note: '' };
  }

  protected pick(id: string | null) {
    this.divisionId.set(id);
    void this.load();
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
  /** This month so far (0) or the whole of last month (1). */
  protected preset(monthsBack: number) {
    const b = monthBounds(this.today, monthsBack);
    this.from.set(b.from);
    this.to.set(monthsBack === 0 ? this.today : b.to);
    void this.load();
  }

  protected onRange(which: 'from' | 'to', value: string) {
    if (!value) return;
    (which === 'from' ? this.from : this.to).set(value);
    void this.load();
  }

  protected set(studentId: string, status: AttendanceStatus) {
    this.drafts.update((d) => ({ ...d, [studentId]: { ...this.draft(studentId), status } }));
  }
  protected setNote(studentId: string, note: string) {
    this.drafts.update((d) => ({ ...d, [studentId]: { ...this.draft(studentId), note } }));
  }
  protected allPresent() {
    const r = this.roster();
    if (!r) return;
    this.drafts.update((d) => {
      const next = { ...d };
      for (const s of r.students) {
        // Anyone already marked keeps their mark; only the blanks become present.
        if (!next[s.studentId]?.status) next[s.studentId] = { status: 'PRESENT', note: '' };
      }
      return next;
    });
  }

  /** The admin only: takes a saved mark away, so the student shows as not marked. */
  protected async remove(studentId: string, name: string) {
    const id = this.divisionId();
    if (!id) return;
    try {
      const roster = await firstValueFrom(this.api.clearAttendance(id, studentId, this.date()));
      this.roster.set(roster);
      this.drafts.set(draftsFrom(roster));
      this.toast.add({ severity: 'success', summary: `Mark removed for ${name}` });
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not remove', detail: apiError(error) });
    }
  }

  protected async save() {
    const id = this.divisionId();
    const entries = this.pending();
    if (!id || entries.length === 0) return;
    this.saving.set(true);
    try {
      const roster = await firstValueFrom(this.api.markAttendance(id, this.date(), entries));
      this.roster.set(roster);
      this.drafts.set(draftsFrom(roster));
      this.toast.add({ severity: 'success', summary: 'Attendance saved' });
      this.overview.set(await firstValueFrom(this.api.attendanceOverview()));
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: apiError(error) });
    } finally {
      this.saving.set(false);
    }
  }

  private async load() {
    const id = this.divisionId();
    this.error.set(null);
    if (!id) return;
    try {
      if (this.tab() === 'take') {
        this.roster.set(null);
        const roster = await firstValueFrom(this.api.attendanceRoster(id, this.date()));
        this.roster.set(roster);
        this.drafts.set(draftsFrom(roster));
      } else {
        this.report.set(null);
        this.report.set(
          await firstValueFrom(this.api.attendanceReport(id, { from: this.from(), to: this.to() })),
        );
      }
    } catch (error) {
      this.error.set(apiError(error));
    }
  }
}
