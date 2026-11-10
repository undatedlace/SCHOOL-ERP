import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AttendanceDivisionReport } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { GRID_MAX_DAYS, MARKS, gridDays, isLow, percentText } from './attendance-utils';

/** Students down the side, days across the top, and a mark in each box. */
@Component({
  selector: 'app-attendance-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="mb-3 text-sm text-muted-foreground">
      {{ report().daysMarked }} day{{ report().daysMarked === 1 ? '' : 's' }} taken between
      {{ dateText(report().from) }} and {{ dateText(report().to) }}.
      @if (shortenedNote()) {
        Only the days attendance was taken are shown.
      }
    </p>

    <ul class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Key">
      @for (m of key; track m.label) {
        <li class="flex items-center gap-1.5">
          <span
            class="inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold"
            [class]="m.tone"
            aria-hidden="true"
            >{{ m.symbol }}</span
          >{{ m.label }}
        </li>
      }
      <li class="flex items-center gap-1.5">
        <span
          class="inline-flex size-5 items-center justify-center text-muted-foreground"
          aria-hidden="true"
          >-</span
        >
        Not taken
      </li>
    </ul>

    <div class="overflow-x-auto rounded-lg border">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="bg-accent">
            <th
              scope="col"
              class="sticky left-0 z-10 min-w-44 bg-accent px-4 py-3 text-left font-medium"
            >
              {{ nameHeader() }}
            </th>
            @for (d of days(); track d.iso) {
              <th
                scope="col"
                class="min-w-10 px-1 py-2 text-center font-medium"
                [class.bg-muted]="d.sunday"
              >
                <span class="block">{{ d.day }}</span>
                <span class="block text-[10px] font-normal text-muted-foreground">{{
                  d.weekday
                }}</span>
              </th>
            }
            <th scope="col" class="min-w-24 px-3 py-3 text-right font-medium">Attendance</th>
          </tr>
        </thead>
        <tbody>
          @for (s of report().students; track s.studentId) {
            <tr class="border-t">
              <th scope="row" class="sticky left-0 z-10 bg-card px-4 py-3 text-left font-normal">
                {{ s.name }}
                <span class="block text-xs text-muted-foreground"
                  >{{ numberLabel() }} {{ s.admissionNo }}</span
                >
              </th>
              @for (d of days(); track d.iso) {
                <td class="px-1 py-2 text-center" [class.bg-muted]="d.sunday">
                  @if (s.days[d.iso]; as status) {
                    <span
                      class="inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold"
                      [class]="marks[status].tone"
                      [attr.title]="marks[status].label + ', ' + dateText(d.iso)"
                      role="img"
                      [attr.aria-label]="marks[status].label + ', ' + dateText(d.iso)"
                      >{{ marks[status].symbol }}</span
                    >
                  } @else {
                    <span
                      class="text-muted-foreground"
                      [attr.aria-label]="d.taken ? 'Not recorded' : 'Not taken'"
                      >-</span
                    >
                  }
                </td>
              }
              <td class="px-3 py-2 text-right font-medium" [class.text-destructive]="low(s)">
                {{ percent(s) }}
                @if (low(s)) {
                  <span class="block text-xs font-normal">Low</span>
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td [attr.colspan]="days().length + 2" class="p-4 text-center text-muted-foreground">
                No students.
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <p class="mt-3 text-xs text-muted-foreground">
      Present and late count as attended; approved leave is left out. Under 75% is marked Low.
    </p>
  `,
})
export class AttendanceGrid {
  readonly report = input.required<AttendanceDivisionReport>();
  /** What the first column is called, and what each person's number is called. */
  readonly nameHeader = input('Student name');
  readonly numberLabel = input('No.');

  protected readonly marks = MARKS;
  protected readonly key = Object.values(MARKS);
  protected readonly dateText = formatDate;
  protected readonly percent = percentText;
  protected readonly low = isLow;
  protected readonly days = computed(() => gridDays(this.report()));
  /** True when the range was too long to show every day. */
  protected readonly shortenedNote = computed(() => {
    const r = this.report();
    const span =
      Math.round(
        (Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86_400_000,
      ) + 1;
    return span > GRID_MAX_DAYS;
  });
}
