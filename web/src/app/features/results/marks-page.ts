import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { InputNumberModule } from '@openng/optimus-ui/inputnumber';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AssessmentDetail } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { PageHeader } from '../../shared/ui/page-header';
import { Badge } from '../../shared/ui/badge';

interface Draft {
  marks: number | null;
  absent: boolean;
  remark: string;
}

/** Enter the marks for one test, see the class figures, and publish the results to the families. */
@Component({
  selector: 'app-marks-page',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    InputNumberModule,
    InputTextModule,
    PageHeader,
    Badge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/app/results" class="text-sm text-muted-foreground hover:text-foreground"
      >&larr; All tests</a
    >
    @if (error()) {
      <p class="mt-3 text-sm text-destructive" role="alert">{{ error() }}</p>
    }
    @if (test(); as t) {
      <app-page-header
        [title]="t.name"
        [subtitle]="
          t.subject.name +
          ' · ' +
          t.division.label +
          ' · ' +
          format(t.conductedOn) +
          ' · out of ' +
          t.maxMarks
        "
      >
        @if (t.published) {
          <p-button label="Take results back" severity="secondary" (onClick)="unpublish()" />
        } @else {
          <p-button
            label="Publish results"
            [disabled]="t.entered === 0 || dirty()"
            (onClick)="publish()"
          />
        }
      </app-page-header>

      <div class="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <app-badge
          [label]="t.published ? 'Published: families can see it' : 'Draft: only you can see it'"
          [severity]="t.published ? 'success' : 'warn'"
        />
        <span>{{ t.stats.entered }} of {{ t.students.length }} entered</span>
        @if (t.stats.average !== null) {
          <span>Average {{ t.stats.average }}</span>
          <span>Highest {{ t.stats.highest }}</span>
          <span>Lowest {{ t.stats.lowest }}</span>
        }
        @if (t.stats.absent) {
          <span>{{ t.stats.absent }} absent</span>
        }
      </div>
      @if (t.published) {
        <p class="mb-3 text-sm text-muted-foreground">
          Changes you save now are seen by the families straight away and are recorded.
        </p>
      }

      <div class="overflow-x-auto rounded-xl border-0 bg-card shadow-sm">
        <table class="app-table w-full min-w-[40rem] text-sm">
          <thead>
            <tr class="bg-accent text-left">
              <th scope="col" class="px-4 py-3">Student</th>
              <th scope="col" class="px-4 py-3">Marks</th>
              <th scope="col" class="px-4 py-3">Absent</th>
              <th scope="col" class="px-4 py-3">%</th>
              <th scope="col" class="px-4 py-3">Remark</th>
            </tr>
          </thead>
          <tbody>
            @for (s of t.students; track s.studentId) {
              <tr class="border-t">
                <th scope="row" class="px-4 py-2 text-left font-medium">
                  {{ s.name }}
                  <span class="block text-xs font-normal text-muted-foreground"
                    >No. {{ s.admissionNo }}</span
                  >
                </th>
                <td class="px-4 py-2">
                  <p-inputnumber
                    [min]="0"
                    [max]="t.maxMarks"
                    [maxFractionDigits]="2"
                    [disabled]="draft(s.studentId).absent"
                    [ngModel]="draft(s.studentId).marks"
                    (ngModelChange)="setMarks(s.studentId, $event)"
                    [ariaLabel]="'Marks for ' + s.name"
                    styleClass="w-28"
                  />
                </td>
                <td class="px-4 py-2">
                  <p-checkbox
                    [binary]="true"
                    [ngModel]="draft(s.studentId).absent"
                    (ngModelChange)="setAbsent(s.studentId, $event)"
                    [ariaLabel]="'Absent: ' + s.name"
                  />
                </td>
                <td class="px-4 py-2">{{ percent(s.studentId, t.maxMarks) }}</td>
                <td class="px-4 py-2">
                  <input
                    pInputText
                    maxlength="200"
                    class="w-full min-w-40"
                    [attr.aria-label]="'Remark for ' + s.name"
                    [value]="draft(s.studentId).remark"
                    (input)="setRemark(s.studentId, $any($event.target).value)"
                  />
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="p-4 text-center text-muted-foreground">
                  There are no students in this division.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="sticky bottom-0 mt-3 flex items-center gap-3 rounded-xl bg-card p-3 shadow-md">
        <p-button
          label="Save marks"
          [disabled]="!dirty()"
          [loading]="saving()"
          (onClick)="save()"
        />
        <span class="text-sm text-muted-foreground">{{
          dirty() ? 'Unsaved changes.' : 'Everything shown is saved.'
        }}</span>
      </div>
    }
  `,
})
export class MarksPage {
  /** From the route: /app/results/:id */
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly format = formatDate;

  protected readonly test = signal<AssessmentDetail | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  private readonly drafts = signal<Record<string, Draft>>({});

  /** Whether anything differs from what is saved. */
  protected readonly dirty = computed(() => this.changes().length > 0);

  constructor() {
    effect(() => void this.load(this.id()));
  }

  protected draft(id: string): Draft {
    return this.drafts()[id] ?? { marks: null, absent: false, remark: '' };
  }

  private changes() {
    const t = this.test();
    if (!t) return [];
    return t.students.flatMap((s) => {
      const d = this.draft(s.studentId);
      const remark = d.remark.trim();
      const same =
        d.absent === s.absent && (d.absent || d.marks === s.marks) && remark === (s.remark ?? '');
      // A student with nothing entered and nothing saved is simply left out.
      if (same || (!d.absent && d.marks === null && remark === '' && s.marks === null && !s.absent))
        return [];
      return [
        {
          studentId: s.studentId,
          absent: d.absent,
          marks: d.absent ? null : d.marks,
          remark: remark || null,
        },
      ];
    });
  }

  protected percent(studentId: string, max: number): string {
    const d = this.draft(studentId);
    if (d.absent || d.marks === null || max <= 0) return '-';
    return `${Math.round((d.marks / max) * 1000) / 10}%`;
  }

  protected setMarks(id: string, marks: number | null) {
    this.drafts.update((all) => ({ ...all, [id]: { ...this.draft(id), marks } }));
  }
  protected setAbsent(id: string, absent: boolean) {
    this.drafts.update((all) => ({
      ...all,
      [id]: { ...this.draft(id), absent, marks: absent ? null : this.draft(id).marks },
    }));
  }
  protected setRemark(id: string, remark: string) {
    this.drafts.update((all) => ({ ...all, [id]: { ...this.draft(id), remark } }));
  }

  private show(t: AssessmentDetail) {
    this.test.set(t);
    this.drafts.set(
      Object.fromEntries(
        t.students.map((s) => [
          s.studentId,
          { marks: s.marks, absent: s.absent, remark: s.remark ?? '' },
        ]),
      ),
    );
  }

  private async load(id: string) {
    this.error.set(null);
    try {
      this.show(await firstValueFrom(this.api.assessment(id)));
    } catch (error) {
      this.error.set(apiError(error));
    }
  }

  protected async save() {
    const t = this.test();
    const entries = this.changes();
    if (!t || entries.length === 0 || this.saving()) return;
    this.saving.set(true);
    try {
      this.show(await firstValueFrom(this.api.saveMarks(t.id, entries)));
      this.toast.add({ severity: 'success', summary: 'Marks saved' });
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: apiError(error) });
    } finally {
      this.saving.set(false);
    }
  }

  protected publish() {
    const t = this.test();
    if (!t) return;
    this.confirm.confirm({
      header: 'Publish these results?',
      message: `Parents and students of ${t.division.label} will see the marks and be told.`,
      acceptLabel: 'Publish',
      rejectLabel: 'Not yet',
      accept: async () => {
        try {
          this.show(await firstValueFrom(this.api.publishAssessment(t.id)));
          this.toast.add({ severity: 'success', summary: 'Results published' });
        } catch (error) {
          this.toast.add({
            severity: 'error',
            summary: 'Could not publish',
            detail: apiError(error),
          });
        }
      },
    });
  }

  protected async unpublish() {
    const t = this.test();
    if (!t) return;
    try {
      this.show(await firstValueFrom(this.api.unpublishAssessment(t.id)));
      this.toast.add({ severity: 'success', summary: 'Results taken back' });
    } catch (error) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not take back',
        detail: apiError(error),
      });
    }
  }
}
