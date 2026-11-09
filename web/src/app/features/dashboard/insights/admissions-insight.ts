import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../core/api';
import { AdmissionsInsight } from '../../../core/models';
import { changeText, widthPercent } from './insight-utils';

/** Applications and admissions for each of the last years, with the change from the year before. */
@Component({
  selector: 'app-admissions-insight',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-lg border bg-card p-5" aria-labelledby="ins-adm">
      <h2 id="ins-adm" class="mb-1 font-semibold">Admissions by year</h2>
      <p class="mb-3 text-sm text-muted-foreground">
        Applications received, granted and turned into students.
      </p>
      @if (rows().length === 0) {
        <p class="text-sm text-muted-foreground">
          {{ failed() ? 'Not available.' : 'No admissions yet.' }}
        </p>
      } @else {
        <ul class="flex flex-col gap-3">
          @for (r of rows(); track r.id) {
            <li>
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span class="font-medium">
                  {{ r.name }}
                  @if (r.isCurrent) {
                    <span class="text-xs text-muted-foreground">(this year)</span>
                  }
                </span>
                <span class="text-muted-foreground">
                  {{ r.applications }} applications
                  @if (r.change) {
                    <span class="ml-1 text-foreground">{{ r.change }}</span>
                  }
                </span>
              </div>
              <div class="mt-1 h-2 rounded bg-muted" aria-hidden="true">
                <div class="h-2 rounded bg-primary" [style.width.%]="r.width"></div>
              </div>
              <div class="mt-1 text-xs text-muted-foreground">
                {{ r.granted }} granted, {{ r.refused }} refused, {{ r.withdrawn }} withdrawn,
                {{ r.received }} waiting &middot; {{ r.admitted }} admitted &middot;
                {{ r.enrolled }} students enrolled
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class AdmissionsInsightCard {
  private readonly api = inject(Api);
  private readonly data = signal<AdmissionsInsight | null>(null);
  protected readonly failed = signal(false);

  protected readonly rows = computed(() => {
    const years = this.data()?.years ?? [];
    const max = Math.max(0, ...years.map((y) => y.applications));
    return years
      .map((y, i) => ({
        ...y,
        width: widthPercent(y.applications, max),
        change: changeText(y.applications, years[i - 1]?.applications),
      }))
      .filter((y) => y.applications > 0 || y.enrolled > 0)
      .reverse();
  });

  constructor() {
    firstValueFrom(this.api.admissionsInsight())
      .then((d) => this.data.set(d))
      .catch(() => this.failed.set(true));
  }
}
