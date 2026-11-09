import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { CalendarEvent } from '../../core/models';
import { toIsoDate } from '../../shared/dates';
import { CATEGORY_CLASS, CATEGORY_LABEL, dateRangeText, timeRangeText } from './calendar-utils';

const DAYS_AHEAD = 45;

/** The next few events (today and the days after), with a link to the whole calendar. */
@Component({
  selector: 'app-upcoming-events',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-xl border-0 bg-card p-5 shadow-sm" aria-labelledby="upcoming-title">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 id="upcoming-title" class="font-semibold">Upcoming</h2>
        <a [routerLink]="calendarLink()" class="text-sm text-muted-foreground hover:text-foreground"
          >View calendar</a
        >
      </div>
      @if (error()) {
        <p class="text-sm text-destructive" role="alert">{{ error() }}</p>
      } @else {
        <ul class="flex flex-col gap-2">
          @for (e of events(); track e.id) {
            <li class="flex gap-3 rounded-lg p-3" [class]="categoryClass[e.category]">
              <div class="min-w-16 text-sm font-semibold">{{ dateRange(e) }}</div>
              <div class="min-w-0">
                <p class="truncate font-medium">{{ e.title }}</p>
                <p class="text-xs">{{ timeRange(e) }} &middot; {{ categoryLabel[e.category] }}</p>
              </div>
            </li>
          } @empty {
            <li class="text-sm text-muted-foreground">
              @if (loaded()) {
                Nothing is planned in the next {{ days }} days.
              } @else {
                Loading...
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class UpcomingEvents {
  private readonly api = inject(Api);

  /** Where "View calendar" goes (staff and portal have different addresses). */
  readonly calendarLink = input('/app/calendar');
  /** How many events to show. */
  readonly limit = input(5);

  protected readonly days = DAYS_AHEAD;
  protected readonly categoryClass = CATEGORY_CLASS;
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly dateRange = dateRangeText;
  protected readonly timeRange = timeRangeText;
  protected readonly events = signal<CalendarEvent[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const from = new Date();
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + DAYS_AHEAD);
    firstValueFrom(this.api.calendarEvents(toIsoDate(from), toIsoDate(to)))
      .then((rows) => this.events.set(rows.slice(0, this.limit())))
      .catch((e) => this.error.set(apiError(e)))
      .finally(() => this.loaded.set(true));
  }
}
