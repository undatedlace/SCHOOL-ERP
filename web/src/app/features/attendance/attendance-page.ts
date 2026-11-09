import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import {
  AttendanceDivision,
  AttendanceDivisionReport,
  AttendanceOverview,
  AttendanceRoster,
  AttendanceStatus,
} from '../../core/models';
import { formatDate, toIsoDate } from '../../shared/dates';
import { PageHeader } from '../../shared/ui/page-header';
import {
  Drafts,
  STATUSES,
  changes,
  draftsFrom,
  isLow,
  percentText,
  unmarkedCount,
} from './attendance-utils';

type Tab = 'take' | 'report';

@Component({
  selector: 'app-attendance-page',
  imports: [FormsModule, ButtonModule, MessageModule, SelectModule, TableModule, PageHeader],
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
              <button
                type="button"
                class="rounded-md border px-3 py-1.5 text-left text-sm hover:bg-accent"
                [class.bg-accent]="d.id === divisionId()"
                (click)="pick(d.id)"
              >
                <span class="font-medium">{{ d.class.name }}-{{ d.name }}</span>
                <span class="block text-xs text-muted-foreground">
                  @if (d.done) {
                    {{ d.counts.present + d.counts.late }} in, {{ d.counts.absent }} absent
                  } @else {
                    Not marked yet
                  }
                </span>
              </button>
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
          <label class="flex flex-col gap-1 text-xs text-muted-foreground">
            Date
            <input
              type="date"
              class="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
              [max]="today"
              [ngModel]="date()"
              (ngModelChange)="onDate($event)"
              aria-label="Date"
            />
          </label>
        } @else {
          <label class="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <input
              type="date"
              class="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
              [max]="today"
              [ngModel]="from()"
              (ngModelChange)="onRange('from', $event)"
              aria-label="From"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <input
              type="date"
              class="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
              [max]="today"
              [ngModel]="to()"
              (ngModelChange)="onRange('to', $event)"
              aria-label="To"
            />
          </label>
        }
        <div class="ml-auto flex gap-1 rounded-md border p-1" role="tablist">
          <button
            type="button"
            role="tab"
            class="rounded px-3 py-1 text-sm"
            [class.bg-primary]="tab() === 'take'"
            [class.text-primary-foreground]="tab() === 'take'"
            [attr.aria-selected]="tab() === 'take'"
            (click)="setTab('take')"
          >
            Take attendance
          </button>
          <button
            type="button"
            role="tab"
            class="rounded px-3 py-1 text-sm"
            [class.bg-primary]="tab() === 'report'"
            [class.text-primary-foreground]="tab() === 'report'"
            [attr.aria-selected]="tab() === 'report'"
            (click)="setTab('report')"
          >
            Report
          </button>
        </div>
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

          <ul class="divide-y rounded-lg border bg-card">
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
                  @for (o of statuses; track o.value) {
                    <button
                      type="button"
                      class="h-9 rounded-md border px-3 text-sm disabled:cursor-default"
                      [class.bg-primary]="
                        draft(s.studentId).status === o.value && o.value === 'PRESENT'
                      "
                      [class.text-primary-foreground]="
                        draft(s.studentId).status === o.value && o.value === 'PRESENT'
                      "
                      [class.bg-destructive]="
                        draft(s.studentId).status === o.value && o.value === 'ABSENT'
                      "
                      [class.text-background]="
                        draft(s.studentId).status === o.value && o.value === 'ABSENT'
                      "
                      [class.bg-accent]="
                        draft(s.studentId).status === o.value &&
                        (o.value === 'LATE' || o.value === 'ON_LEAVE')
                      "
                      [class.font-semibold]="draft(s.studentId).status === o.value"
                      [class.border-foreground]="draft(s.studentId).status === o.value"
                      [attr.aria-pressed]="draft(s.studentId).status === o.value"
                      [disabled]="!r.canMark"
                      (click)="set(s.studentId, o.value)"
                    >
                      {{ o.label }}
                    </button>
                  }
                </div>
                @if (draft(s.studentId).status && draft(s.studentId).status !== 'PRESENT') {
                  <input
                    class="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-56"
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
        <p class="mb-3 text-sm text-muted-foreground">
          {{ rep.daysMarked }} day{{ rep.daysMarked === 1 ? '' : 's' }} marked between
          {{ dateText(rep.from) }} and {{ dateText(rep.to) }}. Present and late count as attended;
          approved leave is left out.
        </p>
        <p-table [value]="rep.students">
          <ng-template #header>
            <tr>
              <th>Student</th>
              <th class="text-right">Present</th>
              <th class="text-right">Late</th>
              <th class="text-right">Absent</th>
              <th class="text-right">Leave</th>
              <th class="text-right">Attendance</th>
            </tr>
          </ng-template>
          <ng-template #body let-s>
            <tr>
              <td>
                {{ s.name }}
                <div class="text-xs text-muted-foreground">Admission no. {{ s.admissionNo }}</div>
              </td>
              <td class="text-right">{{ s.present }}</td>
              <td class="text-right">{{ s.late }}</td>
              <td class="text-right">{{ s.absent }}</td>
              <td class="text-right">{{ s.onLeave }}</td>
              <td class="text-right font-medium" [class.text-destructive]="low(s)">
                {{ percent(s) }}
                @if (low(s)) {
                  <span class="block text-xs font-normal">Low</span>
                }
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr>
              <td colspan="6" class="p-4 text-center text-muted-foreground">No students.</td>
            </tr>
          </ng-template>
        </p-table>
      } @else {
        <p class="text-muted-foreground">Loading...</p>
      }
    }
  `,
})
export class AttendancePage {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

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
