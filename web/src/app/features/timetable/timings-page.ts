import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputNumberModule } from '@openng/optimus-ui/inputnumber';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AcademicYear } from '../../core/models';
import { Badge } from '../../shared/ui/badge';
import { PageHeader } from '../../shared/ui/page-header';
import { TimeField } from '../../shared/ui/time-field';
import { time12 } from './time12';
import { TimetableApi } from './timetable-api';
import {
  GenerateInput,
  Schedule,
  Slot,
  SlotKind,
  TimingsList,
  WEEKDAY_SHORT,
} from './timetable-models';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6].map((d) => ({ label: WEEKDAY_SHORT[d], value: d }));
const KIND_OPTIONS: { label: string; value: SlotKind }[] = [
  { label: 'Period', value: 'PERIOD' },
  { label: 'Break', value: 'BREAK' },
  { label: 'Assembly', value: 'ASSEMBLY' },
];

/**
 * The school day: named timings ("Primary", "Secondary") with their periods and breaks, worked out
 * from a few numbers and then adjusted by hand, and which Std follows which.
 */
@Component({
  selector: 'app-timings-page',
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    Badge,
    PageHeader,
    TimeField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Timings"
      subtitle="When the first period starts, how long periods are, when the breaks fall and how many periods a day. Each Std follows one set of timings."
      [crumbs]="[
        { label: 'Dashboard', link: '/app/dashboard' },
        { label: 'Timetable', link: '/app/timetable' },
        { label: 'Timings' },
      ]"
    >
      <p-button label="New timings" (onClick)="newOpen.set(true)" />
    </app-page-header>

    @if (error()) {
      <p-message severity="error" [text]="error()!" styleClass="mb-4" />
    }

    @if (list(); as l) {
      @if (!l.schedules.length) {
        <section class="mb-4 rounded-2xl bg-card p-4 shadow-sm">
          <h2 class="font-semibold">No timings for {{ l.academicYear.name }} yet</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Make new timings, or copy last year's timings and timetable.
          </p>
          <div class="mt-3 flex flex-wrap items-end gap-3">
            <div class="flex min-w-48 flex-col gap-1 text-sm">
              <label for="copy-year">Copy from</label>
              <p-select
                inputId="copy-year"
                [options]="otherYears()"
                optionLabel="name"
                optionValue="id"
                [ngModel]="copyYear()"
                (ngModelChange)="copyYear.set($event)"
                placeholder="Choose a year"
                [fluid]="true"
              />
            </div>
            <p-button
              label="Copy timings and timetable"
              severity="secondary"
              [outlined]="true"
              [disabled]="!copyYear()"
              [loading]="saving()"
              (onClick)="copy()"
            />
          </div>
        </section>
      }

      <div class="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav class="flex flex-col gap-2" aria-label="Timings">
          @for (s of l.schedules; track s.id) {
            <button
              type="button"
              class="rounded-xl border p-3 text-left shadow-sm"
              [class.border-primary]="s.id === selectedId()"
              [class.bg-primary-soft]="s.id === selectedId()"
              [class.border-transparent]="s.id !== selectedId()"
              [class.bg-card]="s.id !== selectedId()"
              [attr.aria-current]="s.id === selectedId() ? 'true' : null"
              (click)="select(s)"
            >
              <span class="flex items-center justify-between gap-2">
                <span class="font-medium">{{ s.name }}</span>
                @if (!s.active) {
                  <app-badge label="Off" />
                }
              </span>
              <span class="mt-1 block text-xs text-muted-foreground">{{ summary(s) }}</span>
              <span class="mt-1 block text-xs text-muted-foreground">{{
                classNames(s) || 'No class yet'
              }}</span>
            </button>
          }
        </nav>

        @if (selected(); as s) {
          <div class="flex flex-col gap-4">
            <section class="rounded-2xl bg-card p-4 shadow-sm" aria-labelledby="gen-title">
              <div class="mb-3 flex flex-wrap items-end gap-3">
                <div class="flex min-w-56 flex-col gap-1 text-sm">
                  <label for="sched-name">Name</label>
                  <input
                    id="sched-name"
                    pInputText
                    maxlength="60"
                    [ngModel]="name()"
                    (ngModelChange)="name.set($event)"
                  />
                </div>
                <p-button
                  label="Rename"
                  severity="secondary"
                  [outlined]="true"
                  [disabled]="name().trim() === s.name || !name().trim()"
                  (onClick)="rename(s)"
                />
                <p-button
                  label="Delete"
                  severity="danger"
                  [text]="true"
                  [ariaLabel]="'Delete the timings ' + s.name"
                  (onClick)="remove(s)"
                />
                <p-button
                  [label]="s.active ? 'Switch off' : 'Switch on'"
                  severity="secondary"
                  [text]="true"
                  (onClick)="toggle(s)"
                />
              </div>
              <h2 id="gen-title" class="font-semibold">Work it out for me</h2>
              <p class="mb-3 text-sm text-muted-foreground">
                Fill in a few numbers and the rows below are filled in for the days you choose. You
                can still change any row afterwards.
              </p>
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                <div class="flex flex-col gap-1 text-sm">
                  <span>First period starts</span>
                  <app-time-field
                    [hour12]="true"
                    label="First period starts"
                    [value]="gen().firstStart"
                    (valueChange)="setGen({ firstStart: $event })"
                  />
                </div>
                <div class="flex flex-col gap-1 text-sm">
                  <label for="gen-len">Period length (min)</label>
                  <p-inputnumber
                    inputId="gen-len"
                    [min]="5"
                    [max]="180"
                    [ngModel]="gen().periodMinutes"
                    (ngModelChange)="setGen({ periodMinutes: $event ?? 0 })"
                    [fluid]="true"
                  />
                </div>
                <div class="flex flex-col gap-1 text-sm">
                  <label for="gen-n">Periods a day</label>
                  <p-inputnumber
                    inputId="gen-n"
                    [min]="1"
                    [max]="12"
                    [ngModel]="gen().periodsPerDay"
                    (ngModelChange)="setGen({ periodsPerDay: $event ?? 0 })"
                    [fluid]="true"
                  />
                </div>
                <div class="flex flex-col gap-1 text-sm">
                  <label for="gen-gap">Gap between (min)</label>
                  <p-inputnumber
                    inputId="gen-gap"
                    [min]="0"
                    [max]="30"
                    [ngModel]="gen().gapMinutes"
                    (ngModelChange)="setGen({ gapMinutes: $event ?? 0 })"
                    [fluid]="true"
                  />
                </div>
                <div class="flex flex-col gap-1 text-sm">
                  <label for="gen-asm">Assembly first (min)</label>
                  <p-inputnumber
                    inputId="gen-asm"
                    [min]="0"
                    [max]="120"
                    [ngModel]="gen().assemblyMinutes ?? 0"
                    (ngModelChange)="setGen({ assemblyMinutes: $event ?? 0 })"
                    [fluid]="true"
                  />
                </div>
              </div>
              <div class="mt-3 flex flex-col gap-1 text-sm">
                <span id="gen-days">Days</span>
                <p-selectbutton
                  [options]="dayOptions"
                  optionLabel="label"
                  optionValue="value"
                  [multiple]="true"
                  [ngModel]="gen().days"
                  (ngModelChange)="setGen({ days: $event ?? [] })"
                  ariaLabelledBy="gen-days"
                  size="small"
                />
              </div>
              <div class="mt-3 flex flex-col gap-2">
                <span class="text-sm">Breaks</span>
                @for (b of gen().breaks; track $index; let i = $index) {
                  <div class="flex flex-wrap items-end gap-3">
                    <div class="flex w-32 flex-col gap-1 text-xs text-muted-foreground">
                      <label [for]="'brk-after-' + i">After period</label>
                      <p-inputnumber
                        [inputId]="'brk-after-' + i"
                        [min]="1"
                        [max]="11"
                        [ngModel]="b.afterPeriod"
                        (ngModelChange)="setBreak(i, { afterPeriod: $event ?? 1 })"
                        [fluid]="true"
                      />
                    </div>
                    <div class="flex w-56 flex-col gap-1 text-xs text-muted-foreground">
                      <label [for]="'brk-name-' + i">Name</label>
                      <input
                        [id]="'brk-name-' + i"
                        pInputText
                        maxlength="40"
                        [fluid]="true"
                        [ngModel]="b.label"
                        (ngModelChange)="setBreak(i, { label: $event })"
                      />
                    </div>
                    <div class="flex w-32 flex-col gap-1 text-xs text-muted-foreground">
                      <label [for]="'brk-min-' + i">Minutes</label>
                      <p-inputnumber
                        [inputId]="'brk-min-' + i"
                        [min]="5"
                        [max]="180"
                        [ngModel]="b.minutes"
                        (ngModelChange)="setBreak(i, { minutes: $event ?? 5 })"
                        [fluid]="true"
                      />
                    </div>
                    <p-button
                      label="Remove"
                      size="small"
                      severity="danger"
                      [text]="true"
                      [ariaLabel]="'Remove break ' + (i + 1)"
                      (onClick)="removeBreak(i)"
                    />
                  </div>
                }
                <div class="flex flex-wrap gap-2">
                  <p-button
                    label="Add a break"
                    size="small"
                    severity="secondary"
                    [outlined]="true"
                    (onClick)="addBreak()"
                  />
                  <p-button
                    label="Fill in the rows"
                    size="small"
                    [loading]="saving()"
                    (onClick)="generate()"
                  />
                </div>
              </div>
            </section>

            <section class="rounded-2xl bg-card shadow-sm" aria-labelledby="rows-title">
              <header class="flex flex-wrap items-center gap-2 border-b border-border p-4">
                <h2 id="rows-title" class="font-semibold">The school day</h2>
                <span class="text-sm text-muted-foreground">{{ rows().length }} rows</span>
                <div class="ml-auto flex gap-2">
                  <p-button
                    label="Add a row"
                    size="small"
                    severity="secondary"
                    [outlined]="true"
                    (onClick)="addRow()"
                  />
                  <p-button
                    label="Save the rows"
                    size="small"
                    [loading]="saving()"
                    (onClick)="saveRows(s)"
                  />
                </div>
              </header>
              @if (rowErrors().length) {
                <ul class="mx-4 mt-3 list-disc pl-5 text-sm text-destructive" role="alert">
                  @for (e of rowErrors(); track e) {
                    <li>{{ e }}</li>
                  }
                </ul>
              }
              <div class="overflow-x-auto">
                <table class="app-table w-full min-w-[64rem] text-sm">
                  <thead>
                    <tr>
                      <th scope="col" class="p-2 text-left">Kind</th>
                      <th scope="col" class="p-2 text-left">Name</th>
                      <th scope="col" class="p-2 text-left">Starts</th>
                      <th scope="col" class="p-2 text-left">Ends</th>
                      <th scope="col" class="p-2 text-left">Days</th>
                      <th scope="col" class="p-2 text-right">
                        <span class="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (
                      r of rows();
                      track $index;
                      let i = $index;
                      let first = $first;
                      let last = $last
                    ) {
                      <tr>
                        <td class="p-2">
                          <p-select
                            [options]="kindOptions"
                            optionLabel="label"
                            optionValue="value"
                            [ngModel]="r.kind"
                            (ngModelChange)="setRow(i, { kind: $event })"
                            [ariaLabel]="'Kind of row ' + (i + 1)"
                            appendTo="body"
                          />
                        </td>
                        <td class="p-2">
                          <input
                            pInputText
                            maxlength="40"
                            [ngModel]="r.label"
                            (ngModelChange)="setRow(i, { label: $event })"
                            [attr.aria-label]="'Name of row ' + (i + 1)"
                          />
                        </td>
                        <td class="min-w-40 p-2">
                          <app-time-field
                            [hour12]="true"
                            [label]="'Row ' + (i + 1) + ' starts'"
                            [value]="r.startsAt"
                            (valueChange)="setRow(i, { startsAt: $event })"
                          />
                        </td>
                        <td class="min-w-40 p-2">
                          <app-time-field
                            [hour12]="true"
                            [label]="'Row ' + (i + 1) + ' ends'"
                            [value]="r.endsAt"
                            (valueChange)="setRow(i, { endsAt: $event })"
                          />
                        </td>
                        <td class="p-2">
                          <p-selectbutton
                            [options]="dayOptions"
                            optionLabel="label"
                            optionValue="value"
                            [multiple]="true"
                            size="small"
                            [ngModel]="r.days"
                            (ngModelChange)="setRow(i, { days: $event ?? [] })"
                            [ariaLabel]="'Days of row ' + (i + 1)"
                          />
                        </td>
                        <td class="whitespace-nowrap p-2 text-right">
                          <p-button
                            label="Up"
                            size="small"
                            severity="secondary"
                            [text]="true"
                            [disabled]="first"
                            [ariaLabel]="'Move row ' + (i + 1) + ' up'"
                            (onClick)="move(i, -1)"
                          />
                          <p-button
                            label="Down"
                            size="small"
                            severity="secondary"
                            [text]="true"
                            [disabled]="last"
                            [ariaLabel]="'Move row ' + (i + 1) + ' down'"
                            (onClick)="move(i, 1)"
                          />
                          <p-button
                            label="Remove"
                            size="small"
                            severity="danger"
                            [text]="true"
                            [ariaLabel]="'Remove row ' + (i + 1)"
                            (onClick)="removeRow(i)"
                          />
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="6" class="p-6 text-center text-muted-foreground">
                          No rows yet. Use "Work it out for me" above, or add rows one by one.
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        } @else if (l.schedules.length) {
          <p class="text-sm text-muted-foreground">Choose timings on the left.</p>
        }
      </div>

      <section class="mt-6 rounded-2xl bg-card shadow-sm" aria-labelledby="classes-title">
        <header class="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <h2 id="classes-title" class="font-semibold">
            Which timings each Std follows in {{ l.academicYear.name }}
          </h2>
          <p-button
            class="ml-auto"
            label="Save"
            size="small"
            [disabled]="!classesChanged()"
            [loading]="saving()"
            (onClick)="saveClasses()"
          />
        </header>
        <div class="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          @for (c of l.classes; track c.id) {
            <div class="flex items-center justify-between gap-3 text-sm">
              <label [for]="'cls-' + c.id" class="font-medium">{{ c.name }}</label>
              <p-select
                [inputId]="'cls-' + c.id"
                [options]="scheduleOptions()"
                optionLabel="label"
                optionValue="value"
                [ngModel]="classMap()[c.id] ?? null"
                (ngModelChange)="setClass(c.id, $event)"
                placeholder="No timings"
                [showClear]="true"
                appendTo="body"
                [style]="{ 'min-width': '11rem' }"
              />
            </div>
          } @empty {
            <p class="text-sm text-muted-foreground">
              There are no classes yet. Add them in Academic setup.
            </p>
          }
        </div>
        <p class="px-4 pb-4 text-xs text-muted-foreground">
          A class that already has a timetable keeps its timings until its week is cleared on the
          Timetable page.
        </p>
      </section>
    }

    <p-dialog
      header="New timings"
      [visible]="newOpen()"
      (visibleChange)="!$event && newOpen.set(false)"
      [modal]="true"
      [style]="{ width: '28rem', 'max-width': '95vw' }"
    >
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1 text-sm">
          <label for="new-name">Name</label>
          <input
            id="new-name"
            pInputText
            maxlength="60"
            placeholder="For example: Primary"
            [ngModel]="newName()"
            (ngModelChange)="newName.set($event)"
          />
        </div>
        <div class="flex flex-col gap-1 text-sm">
          <label for="new-copy">Start from (optional)</label>
          <p-select
            inputId="new-copy"
            [options]="list()?.schedules ?? []"
            optionLabel="name"
            optionValue="id"
            [showClear]="true"
            placeholder="Empty"
            [ngModel]="newCopy()"
            (ngModelChange)="newCopy.set($event)"
            appendTo="body"
            [fluid]="true"
          />
        </div>
        <div class="flex justify-end gap-2">
          <p-button
            label="Cancel"
            severity="secondary"
            [text]="true"
            (onClick)="newOpen.set(false)"
          />
          <p-button
            label="Make"
            [disabled]="!newName().trim()"
            [loading]="saving()"
            (onClick)="create()"
          />
        </div>
      </div>
    </p-dialog>
  `,
})
export class TimingsPage {
  private readonly api = inject(Api);
  private readonly tt = inject(TimetableApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly dayOptions = DAY_OPTIONS;
  protected readonly kindOptions = KIND_OPTIONS;

  protected readonly list = signal<TimingsList | null>(null);
  protected readonly years = signal<AcademicYear[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly rows = signal<Slot[]>([]);
  protected readonly rowErrors = signal<string[]>([]);
  protected readonly classMap = signal<Record<string, string | null>>({});
  protected readonly copyYear = signal<string | null>(null);
  protected readonly newOpen = signal(false);
  protected readonly newName = signal('');
  protected readonly newCopy = signal<string | null>(null);
  protected readonly gen = signal<GenerateInput>({
    firstStart: '08:30',
    periodMinutes: 40,
    periodsPerDay: 8,
    gapMinutes: 0,
    assemblyMinutes: 15,
    breaks: [
      { afterPeriod: 3, label: 'Short break', minutes: 15 },
      { afterPeriod: 5, label: 'Lunch', minutes: 30 },
    ],
    days: [1, 2, 3, 4, 5],
  });

  protected readonly selected = computed(
    () => this.list()?.schedules.find((s) => s.id === this.selectedId()) ?? null,
  );
  protected readonly otherYears = computed(() => this.years().filter((y) => !y.isCurrent));
  protected readonly scheduleOptions = computed(() =>
    (this.list()?.schedules ?? [])
      .filter((s) => s.active)
      .map((s) => ({ label: s.name, value: s.id })),
  );
  protected readonly classesChanged = computed(() =>
    (this.list()?.classes ?? []).some((c) => (this.classMap()[c.id] ?? null) !== c.scheduleId),
  );

  constructor() {
    void this.load();
    firstValueFrom(this.api.years()).then(
      (y) => this.years.set(y),
      () => undefined,
    );
  }

  private async load(keep?: string) {
    try {
      const l = await firstValueFrom(this.tt.timings());
      this.list.set(l);
      this.classMap.set(Object.fromEntries(l.classes.map((c) => [c.id, c.scheduleId])));
      const s = l.schedules.find((x) => x.id === (keep ?? this.selectedId())) ?? l.schedules[0];
      if (s) this.select(s);
      this.error.set(null);
    } catch (e) {
      this.error.set(apiError(e));
    }
  }

  protected select(s: Schedule) {
    this.selectedId.set(s.id);
    this.name.set(s.name);
    this.rows.set(s.slots.map((x) => ({ ...x, days: [...x.days] })));
    this.rowErrors.set([]);
  }

  protected summary(s: Schedule) {
    const periods = s.slots.filter((x) => x.kind === 'PERIOD' && x.days.includes(1));
    if (!s.slots.length) return 'No rows yet';
    const first = s.slots[0];
    const last = s.slots[s.slots.length - 1];
    return `${periods.length} periods · ${time12(first.startsAt)}–${time12(last.endsAt)}`;
  }

  protected classNames(s: Schedule) {
    const names = new Map((this.list()?.classes ?? []).map((c) => [c.id, c.name]));
    return s.classIds
      .map((id) => names.get(id))
      .filter(Boolean)
      .join(', ');
  }

  // ---------- the generator ----------

  protected setGen(p: Partial<GenerateInput>) {
    this.gen.set({ ...this.gen(), ...p });
  }
  protected setBreak(i: number, p: Partial<GenerateInput['breaks'][number]>) {
    this.setGen({ breaks: this.gen().breaks.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  }
  protected addBreak() {
    this.setGen({
      breaks: [...this.gen().breaks, { afterPeriod: 1, label: 'Break', minutes: 15 }],
    });
  }
  protected removeBreak(i: number) {
    this.setGen({ breaks: this.gen().breaks.filter((_, j) => j !== i) });
  }

  /** Works out rows for the chosen days, keeping rows for other days and reusing row ids in order. */
  protected async generate() {
    this.saving.set(true);
    try {
      const { slots } = await firstValueFrom(this.tt.preview(this.gen()));
      const days = new Set(this.gen().days);
      const same = (a: number[]) => a.length === days.size && a.every((d) => days.has(d));
      const old = this.rows();
      const replaced = old.filter((r) => same(r.days));
      const kept = old.filter((r) => !same(r.days) && !r.days.some((d) => days.has(d)));
      const partly = old.filter((r) => !same(r.days) && r.days.some((d) => days.has(d)));
      // Rows that ran on some of these days lose them.
      const trimmed = partly
        .map((r) => ({ ...r, days: r.days.filter((d) => !days.has(d)) }))
        .filter((r) => r.days.length);
      const pool = new Map<SlotKind, (Slot & { id?: string })[]>();
      for (const r of replaced) pool.set(r.kind, [...(pool.get(r.kind) ?? []), r]);
      const fresh = slots.map((s) => ({ ...s, id: pool.get(s.kind)?.shift()?.id }));
      this.rows.set(
        [...fresh, ...trimmed, ...kept].sort(
          (a, b) => this.firstDay(a) - this.firstDay(b) || a.startsAt.localeCompare(b.startsAt),
        ),
      );
      this.rowErrors.set([]);
      this.toast.add({
        severity: 'info',
        summary: 'Rows filled in',
        detail: 'Check them, then press "Save the rows".',
      });
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Could not work it out', detail: apiError(e) });
    } finally {
      this.saving.set(false);
    }
  }

  private firstDay(r: Slot) {
    return Math.min(...r.days);
  }

  // ---------- rows ----------

  protected setRow(i: number, p: Partial<Slot>) {
    this.rows.set(this.rows().map((r, j) => (j === i ? { ...r, ...p } : r)));
  }
  protected addRow() {
    const last = this.rows()[this.rows().length - 1];
    this.rows.set([
      ...this.rows(),
      {
        kind: 'PERIOD',
        label: `Period ${this.rows().filter((r) => r.kind === 'PERIOD').length + 1}`,
        startsAt: last?.endsAt ?? '08:30',
        endsAt: '',
        days: last?.days ?? [1, 2, 3, 4, 5],
      },
    ]);
  }
  protected removeRow(i: number) {
    this.rows.set(this.rows().filter((_, j) => j !== i));
  }
  protected move(i: number, by: number) {
    const rows = [...this.rows()];
    [rows[i], rows[i + by]] = [rows[i + by], rows[i]];
    this.rows.set(rows);
  }

  protected async saveRows(s: Schedule) {
    this.saving.set(true);
    this.rowErrors.set([]);
    try {
      await firstValueFrom(this.tt.saveSlots(s.id, this.rows()));
      await this.load(s.id);
      this.toast.add({ severity: 'success', summary: 'Timings saved' });
    } catch (e) {
      this.rowErrors.set(
        apiError(e)
          .split(/;\s*|\n/)
          .filter(Boolean),
      );
    } finally {
      this.saving.set(false);
    }
  }

  // ---------- the schedule ----------

  protected async create() {
    this.saving.set(true);
    try {
      const s = await firstValueFrom(
        this.tt.createSchedule({
          name: this.newName().trim(),
          ...(this.newCopy() ? { copyFromId: this.newCopy()! } : {}),
        }),
      );
      this.newOpen.set(false);
      this.newName.set('');
      this.newCopy.set(null);
      await this.load(s.id);
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Not made', detail: apiError(e) });
    } finally {
      this.saving.set(false);
    }
  }

  protected async rename(s: Schedule) {
    try {
      await firstValueFrom(this.tt.updateSchedule(s.id, { name: this.name().trim() }));
      await this.load(s.id);
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Not renamed', detail: apiError(e) });
    }
  }

  protected remove(s: Schedule) {
    this.confirm.confirm({
      header: `Delete the timings "${s.name}"?`,
      message:
        'This removes the timings and their rows for good. It is refused if a Std still follows them or they hold a timetable; switch them off instead to keep the history.',
      acceptLabel: 'Delete',
      rejectLabel: 'Keep them',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await firstValueFrom(this.tt.deleteSchedule(s.id));
          this.selectedId.set(null);
          await this.load();
          this.toast.add({ severity: 'success', summary: 'Timings deleted' });
        } catch (e) {
          this.toast.add({
            severity: 'error',
            summary: 'Not deleted',
            detail: apiError(e),
            life: 10000,
          });
        }
      },
    });
  }

  protected async toggle(s: Schedule) {
    try {
      await firstValueFrom(this.tt.updateSchedule(s.id, { active: !s.active }));
      await this.load(s.id);
    } catch (e) {
      this.toast.add({
        severity: 'error',
        summary: 'Not changed',
        detail: apiError(e),
        life: 8000,
      });
    }
  }

  protected setClass(classId: string, scheduleId: string | null) {
    this.classMap.set({ ...this.classMap(), [classId]: scheduleId ?? null });
  }

  protected async saveClasses() {
    const l = this.list();
    if (!l) return;
    const changes = l.classes
      .filter((c) => (this.classMap()[c.id] ?? null) !== c.scheduleId)
      .map((c) => ({ classId: c.id, scheduleId: this.classMap()[c.id] ?? null }));
    this.saving.set(true);
    try {
      await firstValueFrom(this.tt.setClassSchedules(changes));
      await this.load();
      this.toast.add({ severity: 'success', summary: 'Saved' });
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiError(e), life: 10000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async copy() {
    this.saving.set(true);
    try {
      const res = await firstValueFrom(this.tt.copy(this.copyYear()!));
      await this.load();
      this.toast.add({
        severity: 'success',
        summary: `Copied ${res.schedules} timings and ${res.lessons} lessons from ${res.from}`,
        detail: res.withoutTeacher.length
          ? `${res.withoutTeacher.length} lessons have no teacher because the teacher has left.`
          : undefined,
        life: 10000,
      });
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Not copied', detail: apiError(e) });
    } finally {
      this.saving.set(false);
    }
  }
}
