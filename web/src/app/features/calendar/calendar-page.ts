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
import { MessageModule } from '@openng/optimus-ui/message';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { CalendarEvent } from '../../core/models';
import { toIsoDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';
import { audienceText } from '../notices/notice-utils';
import {
  CATEGORY_CLASS,
  CATEGORY_LABEL,
  dateRangeText,
  eventsOn,
  gridRange,
  monthGrid,
  monthTitle,
  shiftMonth,
  timeRangeText,
} from './calendar-utils';
import { EventDialog } from './event-dialog';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A month at a glance with the day's agenda beside it. Staff who manage it can add events. */
@Component({
  selector: 'app-calendar-page',
  imports: [ButtonModule, MessageModule, HasPermission, PageHeader, Icon, EventDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Calendar" subtitle="School events, holidays, exams and meetings.">
      <p-button
        *appHasPermission="'calendar.manage'"
        label="New event"
        (onClick)="dialog().open(null, selected())"
      />
    </app-page-header>

    @if (error()) {
      <p-message severity="error" [text]="error()!" styleClass="mb-4" />
    }

    <div class="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section class="rounded-xl border-0 bg-card p-4 shadow-sm" aria-label="Month">
        <div class="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            class="inline-flex size-9 items-center justify-center rounded-full border hover:bg-accent"
            aria-label="Previous month"
            (click)="move(-1)"
          >
            <span class="rotate-180"><app-icon name="chevron" /></span>
          </button>
          <h2 class="text-lg font-semibold">{{ title() }}</h2>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-full border px-3 py-1.5 text-sm hover:bg-accent"
              (click)="goToday()"
            >
              Today
            </button>
            <button
              type="button"
              class="inline-flex size-9 items-center justify-center rounded-full border hover:bg-accent"
              aria-label="Next month"
              (click)="move(1)"
            >
              <app-icon name="chevron" />
            </button>
          </div>
        </div>

        <div
          class="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground"
          aria-hidden="true"
        >
          @for (d of weekdays; track d) {
            <span class="py-1">{{ d }}</span>
          }
        </div>
        <div class="grid grid-cols-7 gap-1">
          @for (week of weeks(); track $index) {
            @for (cell of week; track cell.iso) {
              <button
                type="button"
                class="flex min-h-14 flex-col items-start gap-1 rounded-lg p-1.5 text-left text-sm transition hover:bg-accent sm:min-h-20"
                [class.opacity-40]="!cell.inMonth"
                [class.bg-accent]="cell.iso === selected()"
                [class.ring-2]="cell.iso === today"
                [class.ring-ring]="cell.iso === today"
                [attr.aria-pressed]="cell.iso === selected()"
                [attr.aria-label]="cell.iso + ', ' + countText(cell.iso)"
                (click)="selected.set(cell.iso)"
              >
                <span class="font-medium">{{ cell.day }}</span>
                @for (e of cellEvents(cell.iso); track e.id; let i = $index) {
                  @if (i < 2) {
                    <span
                      class="hidden w-full truncate rounded px-1 text-xs sm:block"
                      [class]="categoryClass[e.category]"
                      >{{ e.title }}</span
                    >
                  }
                }
                @if (cellEvents(cell.iso).length) {
                  <span class="text-xs text-muted-foreground sm:hidden"
                    >&bull; {{ cellEvents(cell.iso).length }}</span
                  >
                }
                @if (cellEvents(cell.iso).length > 2) {
                  <span class="hidden text-xs text-muted-foreground sm:block"
                    >+{{ cellEvents(cell.iso).length - 2 }} more</span
                  >
                }
              </button>
            }
          }
        </div>

        <ul class="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Key">
          @for (c of categoryKeys; track c) {
            <li class="flex items-center gap-1.5">
              <span class="size-3 rounded" [class]="categoryClass[c]"></span>{{ categoryLabel[c] }}
            </li>
          }
        </ul>
      </section>

      <section class="rounded-xl border-0 bg-card p-4 shadow-sm" aria-labelledby="agenda-title">
        <h2 id="agenda-title" class="mb-3 font-semibold">Agenda &middot; {{ selectedText() }}</h2>
        @for (e of dayEvents(); track e.id) {
          <article class="mb-3 rounded-lg p-3" [class]="categoryClass[e.category]">
            <p class="text-xs">
              {{ timeRange(e) }} &middot; {{ categoryLabel[e.category] }}
              @if (e.startsOn !== e.endsOn) {
                &middot; {{ dateRange(e) }}
              }
            </p>
            <h3 class="font-medium">{{ e.title }}</h3>
            @if (e.description) {
              <p class="mt-1 text-sm whitespace-pre-line">{{ e.description }}</p>
            }
            <p class="mt-1 text-xs">For: {{ audienceOf(e) }}</p>
            @if (e.canChange) {
              <div class="mt-2 flex gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 text-xs hover:bg-accent"
                  (click)="dialog().open(e)"
                >
                  <app-icon name="edit" />Change
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 text-xs hover:bg-accent"
                  (click)="remove(e)"
                >
                  <app-icon name="trash" />Remove
                </button>
              </div>
            }
          </article>
        } @empty {
          <p class="text-sm text-muted-foreground">
            @if (loading()) {
              Loading...
            } @else {
              Nothing planned for this day.
            }
          </p>
        }
      </section>
    </div>

    <app-event-dialog (saved)="reload()" />
  `,
})
export class CalendarPage {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly dialog = viewChild.required(EventDialog);

  protected readonly today = toIsoDate(new Date());
  protected readonly weekdays = WEEKDAYS;
  protected readonly categoryClass = CATEGORY_CLASS;
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly categoryKeys = ['EVENT', 'HOLIDAY', 'EXAM', 'MEETING'] as const;
  protected readonly dateRange = dateRangeText;
  protected readonly timeRange = timeRangeText;
  protected readonly audienceOf = audienceText;

  private readonly now = new Date();
  protected readonly year = signal(this.now.getFullYear());
  protected readonly month = signal(this.now.getMonth());
  protected readonly selected = signal(this.today);
  protected readonly events = signal<CalendarEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly weeks = computed(() => monthGrid(this.year(), this.month()));
  protected readonly title = computed(() => monthTitle(this.year(), this.month()));
  protected readonly dayEvents = computed(() => eventsOn(this.events(), this.selected()));
  protected readonly selectedText = computed(() =>
    new Date(`${this.selected()}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );

  constructor() {
    void this.reload();
  }

  protected cellEvents(iso: string) {
    return eventsOn(this.events(), iso);
  }

  protected countText(iso: string): string {
    const n = this.cellEvents(iso).length;
    return n === 0 ? 'nothing planned' : `${n} ${n === 1 ? 'event' : 'events'}`;
  }

  protected move(by: number) {
    const next = shiftMonth(this.year(), this.month(), by);
    this.year.set(next.year);
    this.month.set(next.month);
    this.selected.set(toIsoDate(new Date(next.year, next.month, 1)));
    void this.reload();
  }

  protected goToday() {
    const d = new Date();
    this.year.set(d.getFullYear());
    this.month.set(d.getMonth());
    this.selected.set(this.today);
    void this.reload();
  }

  protected async reload() {
    const { from, to } = gridRange(this.year(), this.month());
    this.loading.set(true);
    this.error.set(null);
    try {
      this.events.set(await firstValueFrom(this.api.calendarEvents(from, to)));
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected remove(e: CalendarEvent) {
    this.confirm.confirm({
      header: 'Remove this event?',
      message: `"${e.title}" will no longer show on the calendar. A notice already sent stays.`,
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      accept: async () => {
        try {
          await firstValueFrom(this.api.archiveCalendarEvent(e.id));
          this.toast.add({ severity: 'success', summary: 'Removed' });
          await this.reload();
        } catch (error) {
          this.error.set(apiError(error));
        }
      },
    });
  }
}
