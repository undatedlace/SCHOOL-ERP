import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { StudentResultRow } from '../../core/models';
import { formatDate } from '../../shared/dates';

/** A child's published test results. Read only: this is what families (and teachers) see. */
@Component({
  selector: 'app-student-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-xl border-0 bg-card p-5 shadow-sm" aria-labelledby="results-title">
      <h2 id="results-title" class="mb-3 font-semibold">Test results</h2>
      @if (error()) {
        <p class="text-sm text-destructive" role="alert">{{ error() }}</p>
      } @else if (!loaded()) {
        <p class="text-sm text-muted-foreground">Loading...</p>
      } @else if (rows().length === 0) {
        <p class="text-sm text-muted-foreground">No results have been published yet.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full min-w-[30rem] text-sm">
            <thead>
              <tr class="text-left text-xs text-muted-foreground">
                <th scope="col" class="py-2 pr-3 font-normal">Test</th>
                <th scope="col" class="py-2 pr-3 font-normal">Subject</th>
                <th scope="col" class="py-2 pr-3 font-normal">Date</th>
                <th scope="col" class="py-2 pr-3 text-right font-normal">Marks</th>
                <th scope="col" class="py-2 pr-3 text-right font-normal">%</th>
                <th scope="col" class="py-2 text-right font-normal">Class average</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.assessment.id) {
                <tr class="border-t">
                  <th scope="row" class="py-2 pr-3 text-left font-medium">
                    {{ r.assessment.name }}
                    @if (r.remark) {
                      <span class="block text-xs font-normal text-muted-foreground">{{
                        r.remark
                      }}</span>
                    }
                  </th>
                  <td class="py-2 pr-3">{{ r.assessment.subject.name }}</td>
                  <td class="py-2 pr-3 whitespace-nowrap">
                    {{ format(r.assessment.conductedOn) }}
                  </td>
                  <td class="py-2 pr-3 text-right">
                    @if (r.absent) {
                      Absent
                    } @else if (r.marks === null) {
                      -
                    } @else {
                      {{ r.marks }} / {{ r.assessment.maxMarks }}
                    }
                  </td>
                  <td class="py-2 pr-3 text-right">
                    {{ r.percent === null ? '-' : r.percent + '%' }}
                  </td>
                  <td class="py-2 text-right">
                    {{ r.classAverage === null ? '-' : r.classAverage }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class StudentResultsSection {
  readonly studentId = input.required<string>();
  private readonly api = inject(Api);
  protected readonly rows = signal<StudentResultRow[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly format = formatDate;

  constructor() {
    effect(() => void this.load(this.studentId()));
  }

  private async load(id: string) {
    this.loaded.set(false);
    this.error.set(null);
    try {
      this.rows.set((await firstValueFrom(this.api.studentResults(id))).results);
    } catch (error) {
      this.rows.set([]);
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }
}
