import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Badge } from '../../shared/ui/badge';
import { Time12Pipe } from './time12';
import { GridCell, GridChange, GridRow, WeekDay, WeekView } from './timetable-models';

export interface CellPick {
  row: GridRow;
  day: WeekDay;
  cell: GridCell | null;
  change: GridChange | null;
}

interface Box {
  day: WeekDay;
  runs: boolean;
  cell: GridCell | null;
  change: GridChange | null;
  /** A teacher covering someone else's period (teacher view only). */
  covering: GridChange | null;
}

/**
 * The week as a grid: periods down the side, Monday to Saturday across, breaks as quiet rows,
 * today's column marked. Shows each day's changes (cancelled, substitute) over the regular lesson.
 * For a class the box names the teacher; for a teacher it names the class.
 */
@Component({
  selector: 'app-timetable-grid',
  imports: [Badge, NgTemplateOutlet, Time12Pipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .tt-grid th,
    .tt-grid td {
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .tt-grid td + td,
    .tt-grid th + th {
      border-left: 1px solid var(--border);
    }
    .tt-today {
      background: color-mix(in srgb, var(--primary-soft) 70%, transparent);
    }
  `,
  template: `
    <div class="overflow-x-auto">
      <table class="tt-grid w-full min-w-[44rem] border-collapse text-sm">
        <caption class="sr-only">
          {{
            caption()
          }}
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              class="w-32 p-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Period
            </th>
            @for (d of days(); track d.date) {
              <th
                scope="col"
                class="p-2 text-left text-xs font-semibold uppercase tracking-wide"
                [class.tt-today]="d.date === view().today"
                [class.text-muted-foreground]="d.date !== view().today"
                [attr.aria-current]="d.date === view().today ? 'date' : null"
              >
                <span class="block">{{ d.name }}</span>
                <span class="block font-normal normal-case tracking-normal">
                  {{ dayNumber(d.date) }}
                  @if (d.date === view().today) {
                    <span class="ml-1 font-semibold text-primary">Today</span>
                  }
                </span>
                @if (d.holiday) {
                  <app-badge
                    class="mt-1 inline-block"
                    tone="amber"
                    [label]="'Holiday: ' + d.holiday"
                  />
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (r of lines(); track r.row.key) {
            @if (r.row.kind === 'BREAK' && r.everyDay) {
              <tr class="bg-muted">
                <th scope="row" class="p-2 text-left font-normal text-muted-foreground">
                  <span class="block text-xs tabular-nums"
                    >{{ r.row.startsAt | time12 }}–{{ r.row.endsAt | time12 }}</span
                  >
                </th>
                <td
                  [attr.colspan]="days().length"
                  class="p-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {{ r.row.label }}
                </td>
              </tr>
            } @else {
              <tr [class.bg-muted]="r.row.kind !== 'PERIOD'">
                <th scope="row" class="p-2 text-left align-top font-normal">
                  <span class="block font-medium">{{ r.row.label }}</span>
                  <span class="block text-xs tabular-nums text-muted-foreground"
                    >{{ r.row.startsAt | time12 }}–{{ r.row.endsAt | time12 }}</span
                  >
                </th>
                @for (b of r.boxes; track b.day.date) {
                  <td class="h-16 p-0" [class.tt-today]="b.day.date === view().today">
                    @if (!b.runs) {
                      <span class="block p-2 text-xs text-faint" aria-label="No period">—</span>
                    } @else if (r.row.kind === 'BREAK') {
                      <span
                        class="block p-2 text-xs uppercase tracking-wide text-muted-foreground"
                        >{{ r.row.label }}</span
                      >
                    } @else if (editable() && !b.day.holiday) {
                      <button
                        type="button"
                        class="block h-full w-full p-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                        [attr.aria-label]="boxLabel(r.row, b)"
                        (click)="
                          pick.emit({ row: r.row, day: b.day, cell: b.cell, change: b.change })
                        "
                      >
                        <ng-container *ngTemplateOutlet="content; context: { $implicit: b }" />
                      </button>
                    } @else {
                      <div class="p-2">
                        <ng-container *ngTemplateOutlet="content; context: { $implicit: b }" />
                      </div>
                    }
                  </td>
                }
              </tr>
            }
          } @empty {
            <tr>
              <td [attr.colspan]="days().length + 1" class="p-6 text-center text-muted-foreground">
                {{ emptyText() }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <ng-template #content let-b>
      @if (b.day.holiday) {
        <span class="text-xs text-muted-foreground">Holiday</span>
      } @else if (b.covering; as c) {
        <span class="block font-medium">{{ c.subject?.name ?? 'Cover' }}</span>
        <span class="block text-xs text-muted-foreground">{{ c.division.label }}</span>
        <app-badge class="mt-1 inline-block" tone="info" label="You cover this" />
      } @else if (b.cell; as c) {
        <span class="block font-medium" [class.line-through]="b.change?.kind === 'CANCELLED'">
          {{ c.subject?.name ?? (c.staff ? 'Class time' : 'Free') }}
        </span>
        <span class="block text-xs text-muted-foreground" [class.line-through]="!!b.change">
          {{ mode() === 'staff' ? c.division.label : (c.staff?.fullName ?? '') }}
        </span>
        @if (c.room) {
          <span class="block text-xs text-muted-foreground">{{ c.room }}</span>
        }
        @if (b.change; as ch) {
          @if (ch.kind === 'CANCELLED') {
            <app-badge class="mt-1 inline-block" tone="bad" label="Cancelled" />
          } @else {
            <app-badge
              class="mt-1 inline-block"
              tone="warn"
              [label]="
                mode() === 'staff'
                  ? 'Covered by ' + (ch.substitute?.fullName ?? 'someone')
                  : 'Substitute: ' + (ch.substitute?.fullName ?? '')
              "
            />
          }
          @if (ch.reason) {
            <span class="mt-0.5 block text-xs text-muted-foreground">{{ ch.reason }}</span>
          }
        }
      } @else {
        <span class="text-xs text-faint">{{ editable() ? 'Add' : 'Free' }}</span>
      }
    </ng-template>
  `,
})
export class TimetableGrid {
  readonly view = input.required<WeekView>();
  /** "division" names the teacher in each box; "staff" names the class. */
  readonly mode = input<'division' | 'staff'>('division');
  readonly editable = input(false);
  readonly caption = input('Weekly timetable');
  readonly emptyText = input('No periods yet.');
  /** The teacher whose week this is (staff mode), to tell their cover from changes to their own lessons. */
  readonly staffId = input<string | null>(null);
  readonly pick = output<CellPick>();

  /** Saturday is shown only when a row runs on it. */
  protected readonly days = computed(() => {
    const v = this.view();
    const saturday = v.rows.some((r) => r.days.includes(6)) || v.cells.some((c) => c.weekday === 6);
    return v.days.filter((d) => d.weekday <= 5 || (d.weekday === 6 && saturday));
  });

  protected readonly lines = computed(() => {
    const v = this.view();
    const days = this.days();
    const cellAt = new Map(v.cells.map((c) => [`${c.rowKey}|${c.weekday}`, c]));
    const changesAt = new Map<string, GridChange[]>();
    for (const ch of v.changes) {
      const k = `${ch.rowKey}|${ch.date}`;
      changesAt.set(k, [...(changesAt.get(k) ?? []), ch]);
    }
    const me = this.staffId();
    return v.rows.map((row) => ({
      row,
      everyDay: days.every((d) => row.days.includes(d.weekday)),
      boxes: days.map((day): Box => {
        const cell = cellAt.get(`${row.key}|${day.weekday}`) ?? null;
        const here = changesAt.get(`${row.key}|${day.date}`) ?? [];
        const covering =
          this.mode() === 'staff' ? (here.find((c) => c.substitute?.id === me) ?? null) : null;
        const change =
          here.find((c) => c !== covering && (!cell || c.division.id === cell.division.id)) ?? null;
        return { day, runs: row.days.includes(day.weekday), cell, change, covering };
      }),
    }));
  });

  protected dayNumber(iso: string) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
    });
  }

  protected boxLabel(row: GridRow, b: Box) {
    const what = b.cell?.subject?.name ?? (b.cell?.staff ? 'Class time' : 'Free period');
    const extra = b.change
      ? b.change.kind === 'CANCELLED'
        ? ', cancelled that day'
        : ', substitute that day'
      : '';
    return `${b.day.name} ${row.label}: ${what}${extra}. Change`;
  }
}
