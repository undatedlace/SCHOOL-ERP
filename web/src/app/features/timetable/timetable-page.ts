import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { Subject } from '../../core/models';
import { PageHeader } from '../../shared/ui/page-header';
import { ImportWizard } from '../imports/import-wizard';
import { time12 } from './time12';
import { TimetableApi } from './timetable-api';
import { CellPick, TimetableGrid } from './timetable-grid';
import {
  DivisionOption,
  DivisionWeek,
  FreeTeachers,
  PersonRef,
  StaffWeek,
  WEEKDAY_LONG,
  addDays,
  shortDate,
  weekTitle,
} from './timetable-models';
import { loadAllStaff } from './timetable-staff';

type Mode = 'class' | 'teacher';

/**
 * The week for a class (or, for administrators, a teacher), like a school timetable on the wall.
 * Administrators change a box by pressing it, hand a subject to another teacher for good, and change
 * one day (substitute, cancel) from the same box.
 */
@Component({
  selector: 'app-timetable-page',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    PageHeader,
    TimetableGrid,
    ImportWizard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Timetable"
      subtitle="The regular week repeats every week. Today's column is highlighted; changes for a single day show in that day's box."
    >
      <p-button label="Print" severity="secondary" [outlined]="true" (onClick)="print()" />
      @if (canManage) {
        <p-button
          label="Import from Excel"
          severity="secondary"
          [outlined]="true"
          (onClick)="importOpen.set(true)"
        />
        <a routerLink="/app/timetable/today" class="no-print">
          <p-button label="Daily changes" tabindex="-1" />
        </a>
      }
    </app-page-header>

    <section
      class="no-print mb-4 rounded-2xl bg-card p-4 shadow-sm"
      aria-label="Choose a timetable"
    >
      <div class="flex flex-wrap items-end gap-4">
        @if (canManage) {
          <div class="flex flex-col gap-1 text-sm">
            <span id="tt-mode">Show the timetable for</span>
            <p-selectbutton
              [options]="modes"
              optionLabel="label"
              optionValue="value"
              [allowEmpty]="false"
              [ngModel]="mode()"
              (ngModelChange)="setMode($event)"
              ariaLabelledBy="tt-mode"
            />
          </div>
        }
        @if (mode() === 'class') {
          <div class="flex min-w-56 flex-col gap-1 text-sm">
            <label for="tt-division">Class</label>
            <p-select
              inputId="tt-division"
              [options]="divisions()"
              optionLabel="label"
              optionValue="id"
              [filter]="divisions().length > 10"
              placeholder="Choose a class"
              [ngModel]="divisionId()"
              (ngModelChange)="chooseDivision($event)"
              [fluid]="true"
            />
          </div>
        } @else {
          <div class="flex min-w-64 flex-col gap-1 text-sm">
            <label for="tt-teacher">Teacher</label>
            <p-select
              inputId="tt-teacher"
              [options]="teachers()"
              optionLabel="fullName"
              optionValue="id"
              [filter]="true"
              placeholder="Choose a teacher"
              [ngModel]="staffId()"
              (ngModelChange)="chooseTeacher($event)"
              [fluid]="true"
            />
          </div>
        }
        <div class="ml-auto flex flex-wrap items-center gap-2" role="group" aria-label="Week">
          <p-button
            label="Previous"
            severity="secondary"
            [text]="true"
            ariaLabel="Previous week"
            (onClick)="step(-7)"
          />
          <p-button
            label="This week"
            severity="secondary"
            [outlined]="true"
            (onClick)="thisWeek()"
          />
          <p-button
            label="Next"
            severity="secondary"
            [text]="true"
            ariaLabel="Next week"
            (onClick)="step(7)"
          />
          <span class="text-sm font-medium tabular-nums" aria-live="polite">{{ title() }}</span>
        </div>
      </div>
    </section>

    @if (error()) {
      <p-message severity="error" [text]="error()!" styleClass="mb-4" />
    }

    <div class="print-area">
      @if (mode() === 'class' && classWeek(); as w) {
        <div class="grid gap-4 xl:grid-cols-[1fr_18rem]">
          <section
            class="rounded-2xl bg-card shadow-sm"
            [attr.aria-label]="'Timetable for ' + w.division.label"
          >
            <header
              class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border p-4"
            >
              <h2 class="text-lg font-semibold">Class {{ w.division.label }}</h2>
              <p class="text-sm text-muted-foreground">
                @if (w.classTeacher) {
                  Class teacher {{ w.classTeacher.fullName }} ·
                }
                {{ w.schedule ? 'Timings: ' + w.schedule.name : 'No timings chosen yet' }} ·
                {{ title() }}
              </p>
              @if (canManage) {
                <div class="no-print ml-auto flex gap-2">
                  <p-button
                    label="Hand a subject to another teacher"
                    size="small"
                    severity="secondary"
                    [text]="true"
                    (onClick)="openReassign()"
                  />
                  <p-button
                    label="Clear the week"
                    size="small"
                    severity="danger"
                    [text]="true"
                    (onClick)="clearWeek()"
                  />
                </div>
              }
            </header>
            @if (!w.schedule) {
              <p class="p-6 text-sm text-muted-foreground">
                {{ w.division.class.name }} has no timings yet.
                @if (canManage) {
                  Choose them in
                  <a class="text-primary underline" routerLink="/app/timetable/timings">Timings</a>.
                } @else {
                  The school has not set them up yet.
                }
              </p>
            } @else {
              <app-timetable-grid
                [view]="w"
                [editable]="canManage"
                [caption]="'Weekly timetable for class ' + w.division.label"
                [emptyText]="'No periods in these timings.'"
                (pick)="openBox($event)"
              />
            }
          </section>

          <aside class="flex flex-col gap-4">
            <section class="rounded-2xl bg-card p-4 shadow-sm" aria-labelledby="tt-per-week">
              <h2 id="tt-per-week" class="mb-3 font-semibold">Periods per week</h2>
              @for (p of w.periodsPerWeek; track p.subject.id) {
                <div class="mb-2 text-sm">
                  <div class="flex justify-between">
                    <span>{{ p.subject.name }}</span
                    ><span class="tabular-nums">{{ p.count }}</span>
                  </div>
                  <div class="mt-1 h-1.5 rounded-full bg-muted" aria-hidden="true">
                    <div
                      class="h-1.5 rounded-full bg-primary"
                      [style.width.%]="(p.count / maxPerWeek()) * 100"
                    ></div>
                  </div>
                </div>
              } @empty {
                <p class="text-sm text-muted-foreground">No lessons yet.</p>
              }
            </section>
            <section class="rounded-2xl bg-card p-4 shadow-sm" aria-labelledby="tt-team">
              <h2 id="tt-team" class="mb-3 font-semibold">Teaching team</h2>
              <dl class="text-sm">
                @for (t of w.team; track t.subject.id) {
                  <div
                    class="flex justify-between gap-3 border-b border-border py-1.5 last:border-0"
                  >
                    <dt class="text-muted-foreground">{{ t.subject.name }}</dt>
                    <dd class="text-right">{{ names(t.staff) }}</dd>
                  </div>
                } @empty {
                  <p class="text-muted-foreground">No teachers yet.</p>
                }
              </dl>
            </section>
          </aside>
        </div>
      } @else if (mode() === 'teacher' && teacherWeek(); as w) {
        <section
          class="rounded-2xl bg-card shadow-sm"
          [attr.aria-label]="'Timetable for ' + w.staff.fullName"
        >
          <header class="flex flex-wrap items-baseline gap-x-4 border-b border-border p-4">
            <h2 class="text-lg font-semibold">{{ w.staff.fullName }}</h2>
            <p class="text-sm text-muted-foreground">
              {{ w.periodsPerWeek }} periods a week · {{ title() }}
            </p>
          </header>
          <app-timetable-grid
            [view]="w"
            mode="staff"
            [staffId]="w.staff.id"
            [caption]="'Weekly timetable for ' + w.staff.fullName"
            emptyText="No lessons this week."
          />
        </section>
      } @else if (loaded() && !error()) {
        <p class="text-sm text-muted-foreground">
          {{
            mode() === 'class'
              ? divisions().length
                ? 'Choose a class.'
                : 'There are no classes yet.'
              : 'Choose a teacher.'
          }}
        </p>
      }
    </div>

    <!-- A box: the regular week, and this one day. -->
    <p-dialog
      [header]="boxTitle()"
      [visible]="!!box()"
      (visibleChange)="!$event && box.set(null)"
      [modal]="true"
      [style]="{ width: '36rem', 'max-width': '95vw' }"
    >
      @if (box(); as b) {
        <h3 class="mb-2 text-sm font-semibold">Every {{ weekdayName(b.day.weekday) }}</h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1 text-sm">
            <label for="tt-subject">Subject</label>
            <p-select
              inputId="tt-subject"
              [options]="subjects()"
              optionLabel="name"
              optionValue="id"
              [filter]="subjects().length > 10"
              [showClear]="true"
              placeholder="Free period"
              [ngModel]="form().subjectId"
              (ngModelChange)="patch({ subjectId: $event ?? null })"
              appendTo="body"
              [fluid]="true"
            />
          </div>
          <div class="flex flex-col gap-1 text-sm">
            <label for="tt-staff">Teacher</label>
            <p-select
              inputId="tt-staff"
              [options]="teachers()"
              optionLabel="fullName"
              optionValue="id"
              [filter]="true"
              [showClear]="true"
              placeholder="The subject teacher"
              [ngModel]="form().staffId"
              (ngModelChange)="patch({ staffId: $event ?? null })"
              appendTo="body"
              [fluid]="true"
            />
          </div>
          <div class="flex flex-col gap-1 text-sm sm:col-span-2">
            <label for="tt-room">Room (optional)</label>
            <input
              id="tt-room"
              pInputText
              maxlength="40"
              [fluid]="true"
              [ngModel]="form().room"
              (ngModelChange)="patch({ room: $event })"
            />
          </div>
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          Leave the teacher empty to use the subject teacher from Academic setup. Clear the subject
          for a free period. A teacher already in another class at this time is refused.
        </p>
        <div class="mt-3 flex justify-end gap-2">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="box.set(null)" />
          <p-button label="Save for every week" [loading]="saving()" (onClick)="saveBox()" />
        </div>

        @if (b.cell && (b.cell.subject || b.cell.staff)) {
          <hr class="my-4 border-border" />
          <h3 class="mb-2 text-sm font-semibold">Only on {{ shortDate(b.day.date) }}</h3>
          @if (b.change; as ch) {
            <p class="mb-2 text-sm">
              {{
                ch.kind === 'CANCELLED'
                  ? 'This period is cancelled that day.'
                  : ch.substitute?.fullName + ' takes it that day.'
              }}
              @if (ch.reason) {
                <span class="text-muted-foreground">({{ ch.reason }})</span>
              }
            </p>
            <p-button
              label="Undo the change for that day"
              severity="secondary"
              [outlined]="true"
              [loading]="saving()"
              (onClick)="undoChange(ch.id)"
            />
          } @else {
            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1 text-sm">
                <label for="tt-reason">Reason (required)</label>
                <input
                  id="tt-reason"
                  pInputText
                  maxlength="300"
                  [fluid]="true"
                  [ngModel]="reason()"
                  (ngModelChange)="reason.set($event)"
                  placeholder="For example: teacher on leave"
                />
              </div>
              <div class="flex flex-col gap-1 text-sm">
                <label for="tt-sub">Substitute</label>
                <p-select
                  inputId="tt-sub"
                  [options]="free()?.teachers ?? []"
                  optionLabel="fullName"
                  optionValue="id"
                  [filter]="true"
                  [loading]="freeLoading()"
                  [placeholder]="
                    freeLoading() ? 'Finding free teachers...' : 'Choose a free teacher'
                  "
                  emptyMessage="Nobody is free then"
                  [ngModel]="substituteId()"
                  (ngModelChange)="substituteId.set($event)"
                  appendTo="body"
                  [fluid]="true"
                >
                  <ng-template let-t #item>
                    <span>{{ t.fullName }}</span>
                    <span class="ml-2 text-xs text-muted-foreground">{{ hint(t) }}</span>
                  </ng-template>
                </p-select>
                <small class="text-muted-foreground"
                  >Only teachers who are in school and free at this time are listed; the best fits
                  come first.</small
                >
              </div>
              <div class="flex flex-wrap justify-end gap-2">
                <p-button
                  label="Cancel this period"
                  severity="danger"
                  [outlined]="true"
                  [disabled]="reason().trim().length < 2"
                  [loading]="saving()"
                  (onClick)="dayChange('CANCELLED')"
                />
                <p-button
                  label="Set substitute"
                  [disabled]="!substituteId() || reason().trim().length < 2"
                  [loading]="saving()"
                  (onClick)="dayChange('SUBSTITUTE')"
                />
              </div>
            </div>
          }
        }
      }
    </p-dialog>

    <!-- Hand a subject to another teacher for good. -->
    <p-dialog
      header="Hand a subject to another teacher"
      [visible]="reassignOpen()"
      (visibleChange)="!$event && reassignOpen.set(false)"
      [modal]="true"
      [style]="{ width: '32rem', 'max-width': '95vw' }"
    >
      <div class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">
          Moves every lesson of the subject from one teacher to another in class
          {{ classWeek()?.division?.label }}, from this week on. For a single day, press the box
          instead and set a substitute.
        </p>
        <div class="flex flex-col gap-1 text-sm">
          <label for="ra-subject">Subject</label>
          <p-select
            inputId="ra-subject"
            [options]="reassignSubjects()"
            optionLabel="name"
            optionValue="id"
            [ngModel]="ra().subjectId"
            (ngModelChange)="pickReassignSubject($event)"
            appendTo="body"
            [fluid]="true"
            placeholder="Choose a subject"
          />
        </div>
        <div class="flex flex-col gap-1 text-sm">
          <label for="ra-from">From</label>
          <p-select
            inputId="ra-from"
            [options]="reassignFrom()"
            optionLabel="fullName"
            optionValue="id"
            [ngModel]="ra().fromStaffId"
            (ngModelChange)="ra.set({ ...ra(), fromStaffId: $event })"
            appendTo="body"
            [fluid]="true"
            placeholder="Current teacher"
          />
        </div>
        <div class="flex flex-col gap-1 text-sm">
          <label for="ra-to">To</label>
          <p-select
            inputId="ra-to"
            [options]="teachers()"
            optionLabel="fullName"
            optionValue="id"
            [filter]="true"
            [ngModel]="ra().toStaffId"
            (ngModelChange)="ra.set({ ...ra(), toStaffId: $event })"
            appendTo="body"
            [fluid]="true"
            placeholder="New teacher"
          />
        </div>
        <div class="flex items-center gap-2 text-sm">
          <p-checkbox
            inputId="ra-also"
            [binary]="true"
            [ngModel]="ra().alsoSubjectTeacher"
            (ngModelChange)="ra.set({ ...ra(), alsoSubjectTeacher: $event })"
          />
          <label for="ra-also"
            >Also make them the subject teacher in Academic setup (marks, homework and attendance
            follow it)</label
          >
        </div>
        <div class="flex justify-end gap-2">
          <p-button
            label="Cancel"
            severity="secondary"
            [text]="true"
            (onClick)="reassignOpen.set(false)"
          />
          <p-button
            label="Hand over"
            [disabled]="!ra().subjectId || !ra().fromStaffId || !ra().toStaffId"
            [loading]="saving()"
            (onClick)="reassign()"
          />
        </div>
      </div>
    </p-dialog>

    @if (canManage) {
      <app-import-wizard
        slug="timetable"
        [(visible)]="importOpen"
        [params]="{ classId: classWeek()?.division?.class?.id }"
        (imported)="reload()"
      >
        <p class="text-sm">
          The file is for
          <strong>{{ classWeek()?.division?.class?.name ?? 'the class chosen above' }}</strong>
          (all its divisions). Choose a class first.
        </p>
      </app-import-wizard>
    }
  `,
})
export class TimetablePage {
  private readonly api = inject(Api);
  private readonly tt = inject(TimetableApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly canManage = this.auth.has('timetable.manage');
  protected readonly modes = [
    { label: 'Class', value: 'class' as Mode },
    { label: 'Teacher', value: 'teacher' as Mode },
  ];
  protected readonly shortDate = shortDate;

  protected readonly mode = signal<Mode>('class');
  protected readonly divisions = signal<DivisionOption[]>([]);
  protected readonly teachers = signal<PersonRef[]>([]);
  protected readonly subjects = signal<Subject[]>([]);
  protected readonly divisionId = signal<string | null>(null);
  protected readonly staffId = signal<string | null>(null);
  protected readonly weekOf = signal<string | undefined>(undefined);
  protected readonly classWeek = signal<DivisionWeek | null>(null);
  protected readonly teacherWeek = signal<StaffWeek | null>(null);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly importOpen = signal(false);

  protected readonly box = signal<CellPick | null>(null);
  protected readonly form = signal<{
    subjectId: string | null;
    staffId: string | null;
    room: string;
  }>({
    subjectId: null,
    staffId: null,
    room: '',
  });
  protected readonly reason = signal('');
  protected readonly substituteId = signal<string | null>(null);
  protected readonly free = signal<FreeTeachers | null>(null);
  protected readonly freeLoading = signal(false);

  protected readonly reassignOpen = signal(false);
  protected readonly ra = signal({
    subjectId: '',
    fromStaffId: '',
    toStaffId: '',
    alsoSubjectTeacher: true,
  });

  protected readonly title = computed(() => {
    const w = this.mode() === 'class' ? this.classWeek() : this.teacherWeek();
    return w ? weekTitle(w.days) : '';
  });
  protected readonly maxPerWeek = computed(() =>
    Math.max(1, ...(this.classWeek()?.periodsPerWeek.map((p) => p.count) ?? [1])),
  );
  protected readonly boxTitle = computed(() => {
    const b = this.box();
    return b
      ? `${this.classWeek()?.division.label ?? ''}, ${b.day.name} ${b.row.label} (${time12(b.row.startsAt)}–${time12(b.row.endsAt)})`
      : '';
  });
  protected readonly reassignSubjects = computed(() =>
    (this.classWeek()?.team ?? []).map((t) => t.subject),
  );
  protected readonly reassignFrom = computed(() => {
    const w = this.classWeek();
    const subjectId = this.ra().subjectId;
    const ids = new Set(
      w?.cells.filter((c) => c.subject?.id === subjectId && c.staff).map((c) => c.staff!.id),
    );
    return (w?.team.find((t) => t.subject.id === subjectId)?.staff ?? []).filter(
      (s) => ids.has(s.id) || !ids.size,
    );
  });

  constructor() {
    void this.start();
  }

  private async start() {
    const q = this.route.snapshot.queryParamMap;
    this.weekOf.set(q.get('weekOf') ?? undefined);
    try {
      const [divisions, subjects] = await Promise.all([
        firstValueFrom(this.tt.divisions()),
        this.canManage ? firstValueFrom(this.api.subjects()) : Promise.resolve([] as Subject[]),
      ]);
      this.divisions.set(divisions);
      this.subjects.set(subjects);
      if (this.canManage) this.teachers.set(await loadAllStaff(this.api));
      const wanted = q.get('division');
      const staff = q.get('staff');
      if (staff && this.canManage) {
        this.mode.set('teacher');
        this.staffId.set(staff);
      } else {
        this.divisionId.set(divisions.find((d) => d.id === wanted)?.id ?? divisions[0]?.id ?? null);
      }
      await this.reload();
    } catch (e) {
      this.error.set(apiError(e));
    } finally {
      this.loaded.set(true);
    }
  }

  protected async reload() {
    this.error.set(null);
    try {
      if (this.mode() === 'class') {
        const id = this.divisionId();
        this.classWeek.set(
          id ? await firstValueFrom(this.tt.divisionWeek(id, this.weekOf())) : null,
        );
      } else {
        const id = this.staffId();
        this.teacherWeek.set(
          id ? await firstValueFrom(this.tt.staffWeek(id, this.weekOf())) : null,
        );
      }
    } catch (e) {
      this.error.set(apiError(e));
    }
    this.remember();
  }

  private remember() {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        division: this.mode() === 'class' ? this.divisionId() : null,
        staff: this.mode() === 'teacher' ? this.staffId() : null,
        weekOf: this.weekOf() ?? null,
      },
    });
  }

  protected setMode(m: Mode) {
    this.mode.set(m);
    void this.reload();
  }
  protected chooseDivision(id: string) {
    this.divisionId.set(id);
    void this.reload();
  }
  protected chooseTeacher(id: string) {
    this.staffId.set(id);
    void this.reload();
  }
  protected step(days: number) {
    const w = this.mode() === 'class' ? this.classWeek() : this.teacherWeek();
    if (!w) return;
    this.weekOf.set(addDays(w.weekOf, days));
    void this.reload();
  }
  protected thisWeek() {
    this.weekOf.set(undefined);
    void this.reload();
  }
  protected print() {
    window.print();
  }
  protected names(staff: PersonRef[]) {
    return staff.map((s) => s.fullName).join(', ') || '—';
  }
  protected weekdayName(d: number) {
    return WEEKDAY_LONG[d];
  }
  protected hint(t: FreeTeachers['teachers'][number]) {
    const bits = [
      t.teachesSubjectHere
        ? 'teaches this subject here'
        : t.teachesDivision
          ? 'teaches this class'
          : '',
      `${t.periodsThatDay} period${t.periodsThatDay === 1 ? '' : 's'} that day`,
      t.halfDayLeave ? 'half day leave' : '',
    ];
    return bits.filter(Boolean).join(' · ');
  }

  // ---------- a box ----------

  protected openBox(pick: CellPick) {
    this.box.set(pick);
    this.form.set({
      subjectId: pick.cell?.subject?.id ?? null,
      staffId: pick.cell?.staff?.id ?? null,
      room: pick.cell?.room ?? '',
    });
    this.reason.set('');
    this.substituteId.set(null);
    this.free.set(null);
    if (pick.cell && !pick.change && (pick.cell.subject || pick.cell.staff))
      void this.loadFree(pick);
  }

  private async loadFree(pick: CellPick) {
    this.freeLoading.set(true);
    try {
      this.free.set(
        await firstValueFrom(
          this.tt.freeTeachers(pick.day.date, pick.cell!.division.id, pick.row.key),
        ),
      );
    } catch {
      // The day may not allow changes (a holiday, outside the year): the dialog says so on saving.
      this.free.set(null);
    } finally {
      this.freeLoading.set(false);
    }
  }

  protected patch(p: Partial<{ subjectId: string | null; staffId: string | null; room: string }>) {
    const next = { ...this.form(), ...p };
    // A new subject picks its own teacher unless one was chosen by hand after it.
    if ('subjectId' in p && !('staffId' in p) && p.subjectId !== this.form().subjectId)
      next.staffId = null;
    this.form.set(next);
  }

  protected async saveBox() {
    const b = this.box();
    const w = this.classWeek();
    if (!b || !w) return;
    const f = this.form();
    this.saving.set(true);
    try {
      const res = await firstValueFrom(
        this.tt.setEntries(w.division.id, [
          {
            slotId: b.row.key,
            weekday: b.day.weekday,
            subjectId: f.subjectId,
            // No teacher chosen: the subject teacher (left out), or nobody for a free period.
            ...(f.staffId ? { staffId: f.staffId } : f.subjectId ? {} : { staffId: null }),
            room: f.room.trim() || null,
          },
        ]),
      );
      this.box.set(null);
      await this.reload();
      for (const warning of res.warnings ?? [])
        this.toast.add({
          severity: 'warn',
          summary: 'Saved, but check',
          detail: warning,
          life: 8000,
        });
      if (!res.warnings?.length)
        this.toast.add({ severity: 'success', summary: 'Saved for every week' });
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiError(e), life: 10000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async dayChange(kind: 'SUBSTITUTE' | 'CANCELLED') {
    const b = this.box();
    if (!b?.cell) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.tt.addChange({
          date: b.day.date,
          divisionId: b.cell.division.id,
          slotId: b.row.key,
          kind,
          ...(kind === 'SUBSTITUTE' ? { substituteStaffId: this.substituteId()! } : {}),
          reason: this.reason().trim(),
        }),
      );
      this.box.set(null);
      await this.reload();
      this.toast.add({
        severity: 'success',
        summary:
          kind === 'SUBSTITUTE'
            ? 'Substitute set; they have been told'
            : 'Period cancelled for that day',
      });
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiError(e), life: 10000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async undoChange(id: string) {
    this.saving.set(true);
    try {
      await firstValueFrom(this.tt.removeChange(id));
      this.box.set(null);
      await this.reload();
      this.toast.add({ severity: 'success', summary: 'Back to the usual lesson for that day' });
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Not changed', detail: apiError(e) });
    } finally {
      this.saving.set(false);
    }
  }

  // ---------- the whole class ----------

  protected openReassign() {
    this.ra.set({ subjectId: '', fromStaffId: '', toStaffId: '', alsoSubjectTeacher: true });
    this.reassignOpen.set(true);
  }

  protected pickReassignSubject(subjectId: string) {
    this.ra.set({ ...this.ra(), subjectId, fromStaffId: '' });
    const from = this.reassignFrom();
    if (from.length === 1) this.ra.set({ ...this.ra(), fromStaffId: from[0].id });
  }

  protected async reassign() {
    const w = this.classWeek();
    if (!w) return;
    this.saving.set(true);
    try {
      const res = await firstValueFrom(
        this.tt.reassign({ divisionId: w.division.id, ...this.ra() }),
      );
      this.reassignOpen.set(false);
      await this.reload();
      this.toast.add({
        severity: 'success',
        summary: `${res.moved} lesson${res.moved === 1 ? '' : 's'} a week handed over`,
        detail: 'The new teacher has been told.',
      });
    } catch (e) {
      this.toast.add({
        severity: 'error',
        summary: 'Not handed over',
        detail: apiError(e),
        life: 10000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  protected clearWeek() {
    const w = this.classWeek();
    if (!w) return;
    this.confirm.confirm({
      header: `Clear the week for ${w.division.label}?`,
      message:
        'Every lesson of this class is removed from the regular week (changes already made for single days stay on record). Do this before giving the class other timings.',
      acceptLabel: 'Clear the week',
      rejectLabel: 'Keep it',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          const res = await firstValueFrom(this.tt.clearDivision(w.division.id));
          await this.reload();
          this.toast.add({ severity: 'success', summary: `${res.cleared} lessons removed` });
        } catch (e) {
          this.toast.add({ severity: 'error', summary: 'Not cleared', detail: apiError(e) });
        }
      },
    });
  }
}
