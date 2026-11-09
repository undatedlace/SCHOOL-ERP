import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../core/api';
import { AttendanceInsight } from '../../../core/models';
import { formatDate } from '../../../shared/dates';
import { LOW_PERCENT, isLow } from '../../attendance/attendance-utils';
import { linePath } from './insight-utils';

const W = 300;
const H = 80;

/** Attendance over the last days, for the divisions the person looks after. */
@Component({
  selector: 'app-attendance-insight',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-xl border-0 bg-card shadow-sm p-5" aria-labelledby="ins-att">
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ins-att" class="font-semibold">Attendance, last {{ data()?.days ?? 30 }} days</h2>
        <a routerLink="/app/attendance" class="text-sm underline">Take attendance</a>
      </div>
      @if (data(); as d) {
        @if (d.today.divisions === 0) {
          <p class="text-sm text-muted-foreground">There are no divisions to show.</p>
        } @else {
          <p class="mb-3 text-sm">
            <span class="font-medium">{{ d.today.marked }} of {{ d.today.divisions }}</span>
            divisions marked today.
            @if (d.today.marked < d.today.divisions) {
              <span class="text-muted-foreground">
                {{ d.today.divisions - d.today.marked }} still to do.
              </span>
            }
          </p>
          @if (d.trend.length > 1) {
            <svg
              [attr.viewBox]="'0 0 ' + w + ' ' + h"
              class="mb-1 h-24 w-full text-foreground"
              role="img"
              [attr.aria-label]="summary()"
              preserveAspectRatio="none"
            >
              <line
                x1="0"
                [attr.x2]="w"
                [attr.y1]="threshold"
                [attr.y2]="threshold"
                stroke="currentColor"
                stroke-opacity="0.25"
                stroke-dasharray="3 3"
              />
              <path
                [attr.d]="path()"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <p class="mb-4 text-xs text-muted-foreground">
              {{ date(d.trend[0].date) }} to {{ date(d.trend[d.trend.length - 1].date) }}. Dashed
              line: {{ low }}%.
            </p>
          } @else {
            <p class="mb-4 text-sm text-muted-foreground">
              Not enough days marked to draw a trend yet.
            </p>
          }
          @if (d.divisions.length > 0) {
            <h3 class="mb-1 text-sm font-medium">Lowest attendance</h3>
            <ul class="divide-y text-sm">
              @for (x of d.divisions.slice(0, 5); track x.id) {
                <li class="flex justify-between py-1.5">
                  <span>{{ x.label }}</span>
                  <span [class.text-destructive]="isLow(x)" class="font-medium"
                    >{{ x.percent }}%</span
                  >
                </li>
              }
            </ul>
          }
        }
      } @else {
        <p class="text-sm text-muted-foreground">
          {{ failed() ? 'Not available.' : 'Loading...' }}
        </p>
      }
    </section>
  `,
})
export class AttendanceInsightCard {
  private readonly api = inject(Api);
  protected readonly data = signal<AttendanceInsight | null>(null);
  protected readonly failed = signal(false);
  protected readonly w = W;
  protected readonly h = H;
  protected readonly low = LOW_PERCENT;
  protected readonly threshold = H - (LOW_PERCENT / 100) * H;
  protected readonly date = formatDate;
  protected readonly isLow = isLow;

  protected readonly path = computed(() =>
    linePath(
      (this.data()?.trend ?? []).map((t) => t.percent),
      W,
      H,
      0,
      100,
    ),
  );
  protected readonly summary = computed(() => {
    const trend = this.data()?.trend ?? [];
    const last = trend[trend.length - 1];
    return last?.percent == null
      ? 'Attendance trend'
      : `Attendance trend; the latest day was ${last.percent}%`;
  });

  constructor() {
    firstValueFrom(this.api.attendanceInsight(30))
      .then((d) => this.data.set(d))
      .catch(() => this.failed.set(true));
  }
}
