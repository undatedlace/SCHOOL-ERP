import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputNumberModule } from '@openng/optimus-ui/inputnumber';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { SelectModule } from '@openng/optimus-ui/select';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AssessmentKind, AssessmentOptions, AssessmentSummary } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { DateField } from '../../shared/ui/date-field';
import { FilterBar, FilterField, FilterValues } from '../../shared/ui/filter-bar';
import { PageHeader } from '../../shared/ui/page-header';

export const KIND_OPTIONS: { label: string; value: AssessmentKind }[] = [
  { label: 'Unit test', value: 'UNIT' },
  { label: 'Mock test', value: 'MOCK' },
  { label: 'Term exam', value: 'TERM' },
  { label: 'Other', value: 'OTHER' },
];

/** The tests a teacher has set (or, for an administrator, all of them), and a way to set a new one. */
@Component({
  selector: 'app-results-page',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TagModule,
    DateField,
    FilterBar,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Tests and results"
      subtitle="Set a test, enter marks, then publish the results to the families."
    >
      <p-button label="New test" [disabled]="!options()?.divisions?.length" (onClick)="openNew()" />
    </app-page-header>

    <app-filter-bar [fields]="fields()" (changed)="onFilters($event)" />

    @if (error()) {
      <p class="mb-3 text-sm text-destructive" role="alert">{{ error() }}</p>
    }

    <div class="overflow-x-auto rounded-xl border-0 bg-card shadow-sm">
      <table class="w-full min-w-[44rem] text-sm">
        <thead>
          <tr class="bg-accent text-left">
            <th scope="col" class="px-4 py-3">Test</th>
            <th scope="col" class="px-4 py-3">Class</th>
            <th scope="col" class="px-4 py-3">Subject</th>
            <th scope="col" class="px-4 py-3">Date</th>
            <th scope="col" class="px-4 py-3">Marks entered</th>
            <th scope="col" class="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          @for (a of rows(); track a.id) {
            <tr class="border-t">
              <th scope="row" class="px-4 py-3 text-left font-medium">
                <a class="app-link" [routerLink]="['/app/results', a.id]">{{ a.name }}</a>
                <span class="block text-xs font-normal text-muted-foreground"
                  >Out of {{ a.maxMarks }}</span
                >
              </th>
              <td class="px-4 py-3">{{ a.division.label }}</td>
              <td class="px-4 py-3">{{ a.subject.name }}</td>
              <td class="px-4 py-3 whitespace-nowrap">{{ format(a.conductedOn) }}</td>
              <td class="px-4 py-3">{{ a.entered }} of {{ a.students }}</td>
              <td class="px-4 py-3">
                <p-tag
                  [value]="a.published ? 'Published' : 'Draft'"
                  [severity]="a.published ? 'success' : 'warn'"
                />
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6" class="p-4 text-center text-muted-foreground">
                {{ loaded() ? 'No tests yet.' : 'Loading...' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <p-dialog
      header="New test"
      [visible]="open()"
      (visibleChange)="!$event && open.set(false)"
      [modal]="true"
      [style]="{ width: '34rem', 'max-width': '95vw' }"
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1 text-sm">
          <span>Name</span>
          <input
            pInputText
            maxlength="100"
            placeholder="For example Unit Test 1"
            aria-label="Name"
            [fluid]="true"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
          />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1 text-sm">
            <span>Kind</span>
            <p-select
              [options]="kinds"
              optionLabel="label"
              optionValue="value"
              [ngModel]="kind()"
              (ngModelChange)="kind.set($event ?? 'OTHER')"
              ariaLabel="Kind"
              appendTo="body"
              [fluid]="true"
            />
          </div>
          <div class="flex flex-col gap-1 text-sm">
            <span>Date</span>
            <app-date-field label="Date" [value]="date()" (valueChange)="date.set($event)" />
          </div>
          <div class="flex flex-col gap-1 text-sm">
            <span>Division</span>
            <p-select
              [options]="divisionOptions()"
              optionLabel="label"
              optionValue="id"
              placeholder="Choose a division"
              [ngModel]="divisionId() || null"
              (ngModelChange)="pickDivision($event)"
              ariaLabel="Division"
              appendTo="body"
              [fluid]="true"
            />
          </div>
          <div class="flex flex-col gap-1 text-sm">
            <span>Subject</span>
            <p-select
              [options]="subjectOptions()"
              optionLabel="name"
              optionValue="id"
              placeholder="Choose a subject"
              [disabled]="!divisionId()"
              [ngModel]="subjectId() || null"
              (ngModelChange)="subjectId.set($event ?? '')"
              ariaLabel="Subject"
              appendTo="body"
              [fluid]="true"
            />
          </div>
          <div class="flex flex-col gap-1 text-sm">
            <span>Out of (maximum marks)</span>
            <p-inputnumber
              [min]="0.01"
              [max]="1000"
              [maxFractionDigits]="2"
              [ngModel]="max()"
              (ngModelChange)="max.set($event)"
              ariaLabel="Maximum marks"
              [fluid]="true"
            />
          </div>
        </div>
        @if (formError()) {
          <p class="text-sm text-destructive" role="alert">{{ formError() }}</p>
        }
        <div class="flex justify-end gap-2">
          <p-button label="Cancel" severity="secondary" (onClick)="open.set(false)" />
          <p-button
            label="Create test"
            [disabled]="!ready()"
            [loading]="saving()"
            (onClick)="save()"
          />
        </div>
      </div>
    </p-dialog>
  `,
})
export class ResultsPage {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly kinds = KIND_OPTIONS;
  protected readonly format = formatDate;
  protected readonly rows = signal<AssessmentSummary[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly options = signal<AssessmentOptions | null>(null);
  private filters: FilterValues = {};

  protected readonly fields = computed<FilterField[]>(() => [
    {
      key: 'divisionId',
      label: 'Division',
      type: 'select',
      placeholder: 'Any division',
      options: (this.options()?.divisions ?? []).map((d) => ({ label: d.label, value: d.id })),
    },
    {
      key: 'subjectId',
      label: 'Subject',
      type: 'select',
      placeholder: 'Any subject',
      options: (this.options()?.subjects ?? []).map((s) => ({ label: s.name, value: s.id })),
    },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      placeholder: 'Any status',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
    },
  ]);

  protected readonly open = signal(false);
  protected readonly name = signal('');
  protected readonly kind = signal<AssessmentKind>('UNIT');
  protected readonly date = signal('');
  protected readonly divisionId = signal('');
  protected readonly subjectId = signal('');
  protected readonly max = signal<number | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly divisionOptions = computed(() => this.options()?.divisions ?? []);
  /** Only the subjects the person may set for the chosen division. */
  protected readonly subjectOptions = computed(() => {
    const d = this.options()?.divisions.find((x) => x.id === this.divisionId());
    return (this.options()?.subjects ?? []).filter((s) => d?.subjectIds.includes(s.id));
  });
  protected readonly ready = computed(
    () =>
      this.name().trim().length >= 2 &&
      !!this.divisionId() &&
      !!this.subjectId() &&
      !!this.date() &&
      (this.max() ?? 0) > 0,
  );

  constructor() {
    firstValueFrom(this.api.assessmentOptions())
      .then((o) => this.options.set(o))
      .catch((e) => this.error.set(apiError(e)));
    void this.load();
  }

  protected onFilters(values: FilterValues) {
    this.filters = values;
    void this.load();
  }

  private async load() {
    this.error.set(null);
    try {
      const page = await firstValueFrom(
        this.api.assessments({
          page: 1,
          pageSize: 100,
          status: this.filters['status'],
          divisionId: this.filters['divisionId'],
          subjectId: this.filters['subjectId'],
        }),
      );
      this.rows.set(page.items);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }

  protected openNew() {
    this.name.set('');
    this.kind.set('UNIT');
    this.date.set('');
    this.divisionId.set('');
    this.subjectId.set('');
    this.max.set(null);
    this.formError.set(null);
    this.open.set(true);
  }

  protected pickDivision(id: string | null) {
    this.divisionId.set(id ?? '');
    this.subjectId.set('');
  }

  protected async save() {
    if (this.saving() || !this.ready()) return;
    this.saving.set(true);
    this.formError.set(null);
    try {
      const created = await firstValueFrom(
        this.api.createAssessment({
          name: this.name().trim(),
          kind: this.kind(),
          divisionId: this.divisionId(),
          subjectId: this.subjectId(),
          maxMarks: this.max()!,
          conductedOn: this.date(),
        }),
      );
      this.open.set(false);
      this.toast.add({
        severity: 'success',
        summary: `${created.name} created. Now enter the marks.`,
      });
      await this.load();
    } catch (error) {
      this.formError.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
