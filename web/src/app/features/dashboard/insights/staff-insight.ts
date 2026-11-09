import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../core/api';
import { StaffInsight } from '../../../core/models';

/** Staff who joined and left in each of the last years. */
@Component({
  selector: 'app-staff-insight',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-lg border bg-card p-5" aria-labelledby="ins-staff">
      <h2 id="ins-staff" class="mb-1 font-semibold">Staff by year</h2>
      <p class="mb-3 text-sm text-muted-foreground">
        @if (data(); as d) {
          {{ d.currentlyWorking }} working now.
        }
        Who joined and who left, by academic year.
      </p>
      @if (rows().length === 0) {
        <p class="text-sm text-muted-foreground">
          {{ failed() ? 'Not available.' : 'No staff joined or left yet.' }}
        </p>
      } @else {
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground">
              <th class="pb-1 font-normal">Year</th>
              <th class="pb-1 text-right font-normal">Joined</th>
              <th class="pb-1 text-right font-normal">Left</th>
              <th class="pb-1 text-right font-normal">At year end</th>
            </tr>
          </thead>
          <tbody>
            @for (y of rows(); track y.id) {
              <tr class="border-t">
                <td class="py-1.5">{{ y.name }}</td>
                <td class="py-1.5 text-right">{{ y.joined }}</td>
                <td class="py-1.5 text-right">{{ y.left }}</td>
                <td class="py-1.5 text-right">{{ y.atYearEnd }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
})
export class StaffInsightCard {
  private readonly api = inject(Api);
  protected readonly data = signal<StaffInsight | null>(null);
  protected readonly failed = signal(false);
  protected readonly rows = computed(() =>
    (this.data()?.years ?? []).filter((y) => y.joined > 0 || y.left > 0).reverse(),
  );

  constructor() {
    firstValueFrom(this.api.staffInsight())
      .then((d) => this.data.set(d))
      .catch(() => this.failed.set(true));
  }
}
