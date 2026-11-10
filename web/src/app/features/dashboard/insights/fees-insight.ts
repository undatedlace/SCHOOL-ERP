import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../core/api';
import { FeesInsight } from '../../../core/models';
import { inr } from '../../../shared/money';
import { monthLabel, widthPercent } from './insight-utils';

/** Fees: billed, collected and pending, by class, and money received month by month. */
@Component({
  selector: 'app-fees-insight',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-xl border-0 bg-card shadow-sm p-5 lg:col-span-2"
      aria-labelledby="ins-fees"
    >
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ins-fees" class="font-semibold">
          Fees {{ data() ? '(' + data()!.academicYear.name + ')' : '' }}
        </h2>
        <a routerLink="/app/fees/dues" class="text-sm underline">Who owes what</a>
      </div>
      @if (data(); as d) {
        <dl class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="rounded-md bg-muted p-3">
            <dt class="text-xs text-muted-foreground">Billed</dt>
            <dd class="text-lg font-semibold">{{ money(d.totals.billed) }}</dd>
          </div>
          <div class="rounded-md bg-muted p-3">
            <dt class="text-xs text-muted-foreground">Collected</dt>
            <dd class="text-lg font-semibold">{{ money(d.totals.collected) }}</dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-xs text-muted-foreground">Pending</dt>
            <dd class="text-lg font-semibold">{{ money(d.totals.pending) }}</dd>
          </div>
          <div class="rounded-md border p-3">
            <dt class="text-xs text-muted-foreground">Overdue</dt>
            <dd class="text-lg font-semibold">{{ money(d.totals.overdue) }}</dd>
          </div>
        </dl>

        <div class="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 class="mb-2 text-sm font-medium">Collected and pending, by class</h3>
            <ul class="flex flex-col gap-2.5">
              @for (c of classes(); track c.id) {
                <li>
                  <div class="flex justify-between gap-2 text-sm">
                    <span>{{ c.label }}</span>
                    <span class="text-muted-foreground">
                      {{ money(c.collected) }} of {{ money(c.billed) }}
                    </span>
                  </div>
                  <div class="mt-1 h-2 rounded bg-muted" aria-hidden="true">
                    <div class="h-2 rounded bg-primary" [style.width.%]="c.width"></div>
                  </div>
                  <div class="mt-0.5 text-xs text-muted-foreground">
                    {{ money(c.pending) }} pending
                  </div>
                </li>
              } @empty {
                <li class="text-sm text-muted-foreground">Nothing has been billed yet.</li>
              }
            </ul>
          </div>

          <div>
            <h3 class="mb-2 text-sm font-medium">Money received each month</h3>
            <ol class="flex h-32 items-end gap-1" aria-label="Money received each month">
              @for (m of months(); track m.month) {
                <li class="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <div
                    class="w-full rounded-t bg-primary"
                    [style.height.%]="m.height"
                    [attr.title]="monthLabel(m.month) + ': ' + money(m.total)"
                  ></div>
                  <span class="text-[10px] text-muted-foreground">{{ monthLabel(m.month) }}</span>
                  <span class="sr-only">{{ money(m.total) }}</span>
                </li>
              }
            </ol>
          </div>
        </div>
      } @else {
        <p class="text-sm text-muted-foreground">
          {{ failed() ? 'Not available.' : 'Set up the current academic year to see fees.' }}
        </p>
      }
    </section>
  `,
})
export class FeesInsightCard {
  private readonly api = inject(Api);
  protected readonly data = signal<FeesInsight | null>(null);
  protected readonly failed = signal(false);
  protected readonly money = inr;
  protected readonly monthLabel = monthLabel;

  /** Classes with something billed; the bar shows how much of the bill has come in. */
  protected readonly classes = computed(() =>
    (this.data()?.byClass ?? [])
      .filter((c) => Number(c.billed) > 0)
      .map((c) => ({ ...c, width: widthPercent(Number(c.collected), Number(c.billed)) })),
  );
  protected readonly months = computed(() => {
    const rows = this.data()?.collectedByMonth ?? [];
    const max = Math.max(0, ...rows.map((m) => Number(m.total)));
    return rows.map((m) => ({ ...m, height: widthPercent(Number(m.total), max) }));
  });

  constructor() {
    firstValueFrom(this.api.feesInsight())
      .then((d) => this.data.set(d))
      .catch(() => this.failed.set(true));
  }
}
