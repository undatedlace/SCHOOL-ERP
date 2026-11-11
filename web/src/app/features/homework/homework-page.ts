import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MultiSelectModule } from '@openng/optimus-ui/multiselect';
import { SelectModule } from '@openng/optimus-ui/select';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { Homework, Subject } from '../../core/models';
import { toIsoDate } from '../../shared/dates';
import { DateField } from '../../shared/ui/date-field';
import { FilterBar, FilterField, FilterValues } from '../../shared/ui/filter-bar';
import { PageHeader } from '../../shared/ui/page-header';
import { HomeworkCard } from './homework-card';

type Mode = 'divisions' | 'students';

/** Set homework for divisions or individual students, and see and change what you have set. */
@Component({
  selector: 'app-homework-page',
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    SelectButtonModule,
    TextareaModule,
    DateField,
    FilterBar,
    PageHeader,
    HomeworkCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Homework"
      subtitle="Homework and assignments you have set, and a way to set more."
    >
      <p-button label="Set homework" (onClick)="openNew()" />
    </app-page-header>

    <div class="mb-4 flex gap-1 rounded-md border p-1 w-fit" role="tablist">
      <button
        type="button"
        role="tab"
        class="rounded px-3 py-1 text-sm"
        [class.bg-primary]="!all()"
        [class.text-primary-foreground]="!all()"
        [attr.aria-selected]="!all()"
        (click)="setAll(false)"
      >
        Still open
      </button>
      <button
        type="button"
        role="tab"
        class="rounded px-3 py-1 text-sm"
        [class.bg-primary]="all()"
        [class.text-primary-foreground]="all()"
        [attr.aria-selected]="all()"
        (click)="setAll(true)"
      >
        Everything
      </button>
    </div>
    <app-filter-bar [fields]="fields()" (changed)="onFilters($event)" />

    @if (error()) {
      <p class="mb-3 text-sm text-destructive" role="alert">{{ error() }}</p>
    }

    <div class="grid gap-3 lg:grid-cols-2">
      @for (h of items(); track h.id) {
        <div class="flex flex-col gap-1">
          <app-homework-card [homework]="h" />
          @if (h.canChange) {
            <div class="flex gap-3 px-2 text-sm">
              <button
                type="button"
                class="app-link"
                [attr.aria-label]="'Change ' + h.title"
                (click)="openEdit(h)"
              >
                Change
              </button>
              <button
                type="button"
                class="app-link"
                [attr.aria-label]="'Remove ' + h.title"
                (click)="remove(h)"
              >
                Remove
              </button>
            </div>
          }
        </div>
      } @empty {
        <p class="text-sm text-muted-foreground">
          {{ loaded() ? 'No homework here.' : 'Loading...' }}
        </p>
      }
    </div>

    <p-dialog
      [header]="editing() ? 'Change homework' : 'Set homework'"
      [visible]="open()"
      (visibleChange)="!$event && open.set(false)"
      [modal]="true"
      [style]="{ width: '40rem', 'max-width': '95vw' }"
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1 text-sm">
          <span>Title</span>
          <input
            pInputText
            maxlength="150"
            aria-label="Title"
            [fluid]="true"
            [value]="title()"
            (input)="title.set($any($event.target).value)"
          />
        </div>
        <div class="flex flex-col gap-1 text-sm">
          <span>Instructions</span>
          <textarea
            pTextarea
            rows="5"
            maxlength="5000"
            aria-label="Instructions"
            [fluid]="true"
            [value]="instructions()"
            (input)="instructions.set($any($event.target).value)"
          ></textarea>
          <small class="text-muted-foreground">Plain text. Line breaks are kept.</small>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1 text-sm">
            <span>Subject (optional)</span>
            <p-select
              [options]="subjects()"
              optionLabel="name"
              optionValue="id"
              placeholder="Choose a subject"
              [showClear]="true"
              [ngModel]="subjectId() || null"
              (ngModelChange)="subjectId.set($event ?? '')"
              ariaLabel="Subject"
              appendTo="body"
              [fluid]="true"
            />
          </div>
          <div class="flex flex-col gap-1 text-sm">
            <span>Hand in by (optional)</span>
            <app-date-field
              label="Hand in by"
              [min]="today"
              [clearable]="true"
              [value]="dueOn()"
              (valueChange)="dueOn.set($event)"
            />
          </div>
        </div>

        @if (!editing()) {
          <div class="flex flex-col gap-2 text-sm">
            <span>Who is it for?</span>
            <p-selectbutton
              [options]="modes"
              optionLabel="label"
              optionValue="value"
              [allowEmpty]="false"
              [ngModel]="mode()"
              (ngModelChange)="setMode($event)"
              ariaLabelledBy="audience"
            />
            @if (mode() === 'divisions') {
              <p-multiselect
                [options]="divisions()"
                optionLabel="label"
                optionValue="id"
                placeholder="Choose divisions"
                display="chip"
                ariaLabel="Divisions"
                appendTo="body"
                [fluid]="true"
                [ngModel]="divisionIds()"
                (ngModelChange)="divisionIds.set($event ?? [])"
              />
            } @else {
              <p-select
                [options]="divisions()"
                optionLabel="label"
                optionValue="id"
                placeholder="First choose a division"
                ariaLabel="Division of the students"
                appendTo="body"
                [fluid]="true"
                [ngModel]="studentDivision() || null"
                (ngModelChange)="pickStudentDivision($event)"
              />
              <p-multiselect
                [options]="students()"
                optionLabel="name"
                optionValue="id"
                placeholder="Choose students"
                display="chip"
                [filter]="true"
                ariaLabel="Students"
                appendTo="body"
                [fluid]="true"
                [disabled]="!studentDivision()"
                [ngModel]="studentIds()"
                (ngModelChange)="studentIds.set($event ?? [])"
              />
            }
          </div>
        }

        @if (formError()) {
          <p class="text-sm text-destructive" role="alert">{{ formError() }}</p>
        }
        <div class="flex justify-end gap-2">
          <p-button label="Cancel" severity="secondary" (onClick)="open.set(false)" />
          <p-button
            [label]="editing() ? 'Save' : 'Send to families'"
            [disabled]="!ready()"
            [loading]="saving()"
            (onClick)="save()"
          />
        </div>
      </div>
    </p-dialog>
  `,
})
export class HomeworkPage {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly modes: { label: string; value: Mode }[] = [
    { label: 'Whole divisions', value: 'divisions' },
    { label: 'Individual students', value: 'students' },
  ];
  protected readonly today = toIsoDate(new Date());

  protected readonly items = signal<Homework[]>([]);
  protected readonly all = signal(false);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly divisions = signal<{ id: string; classId: string; label: string }[]>([]);
  protected readonly subjects = signal<Subject[]>([]);
  private filters: FilterValues = {};

  protected readonly fields = computed<FilterField[]>(() => [
    {
      key: 'divisionId',
      label: 'Division',
      type: 'select',
      placeholder: 'Any division',
      options: this.divisions().map((d) => ({ label: d.label, value: d.id })),
    },
    {
      key: 'subjectId',
      label: 'Subject',
      type: 'select',
      placeholder: 'Any subject',
      options: this.subjects().map((s) => ({ label: s.name, value: s.id })),
    },
  ]);

  // the dialog
  protected readonly open = signal(false);
  protected readonly editing = signal<Homework | null>(null);
  protected readonly title = signal('');
  protected readonly instructions = signal('');
  protected readonly subjectId = signal('');
  protected readonly dueOn = signal('');
  protected readonly mode = signal<Mode>('divisions');
  protected readonly divisionIds = signal<string[]>([]);
  protected readonly studentDivision = signal('');
  protected readonly students = signal<{ id: string; name: string }[]>([]);
  protected readonly studentIds = signal<string[]>([]);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly ready = computed(
    () =>
      this.title().trim().length >= 2 &&
      this.instructions().trim().length > 0 &&
      (this.editing() !== null ||
        (this.mode() === 'divisions'
          ? this.divisionIds().length > 0
          : this.studentIds().length > 0)),
  );

  constructor() {
    firstValueFrom(this.api.homeworkAudiences())
      .then((a) => this.divisions.set(a.divisions))
      .catch(() => undefined);
    firstValueFrom(this.api.subjects())
      .then((s) => this.subjects.set(s))
      .catch(() => undefined);
    void this.load();
  }

  protected setAll(all: boolean) {
    this.all.set(all);
    void this.load();
  }

  protected onFilters(values: FilterValues) {
    this.filters = values;
    void this.load();
  }

  protected async load() {
    this.error.set(null);
    try {
      const page = await firstValueFrom(
        this.api.homework({
          page: 1,
          pageSize: 50,
          status: this.all() ? 'all' : 'open',
          divisionId: this.filters['divisionId'],
          subjectId: this.filters['subjectId'],
        }),
      );
      this.items.set(page.items);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }

  protected openNew() {
    this.editing.set(null);
    this.title.set('');
    this.instructions.set('');
    this.subjectId.set('');
    this.dueOn.set('');
    this.mode.set('divisions');
    this.divisionIds.set([]);
    this.studentDivision.set('');
    this.students.set([]);
    this.studentIds.set([]);
    this.formError.set(null);
    this.open.set(true);
  }

  protected openEdit(h: Homework) {
    this.editing.set(h);
    this.title.set(h.title);
    this.instructions.set(h.instructions);
    this.subjectId.set(h.subject?.id ?? '');
    this.dueOn.set(h.dueOn ?? '');
    this.formError.set(null);
    this.open.set(true);
  }

  protected setMode(mode: Mode) {
    this.mode.set(mode);
    this.formError.set(null);
  }

  /** Choosing a division lists its students, so individual ones can be picked. */
  protected async pickStudentDivision(id: string | null) {
    this.studentDivision.set(id ?? '');
    this.studentIds.set([]);
    this.students.set([]);
    if (!id) return;
    try {
      const page = await firstValueFrom(
        this.api.students({ page: 1, pageSize: 100, divisionId: id }),
      );
      this.students.set(page.items.map((s) => ({ id: s.id, name: s.fullName })));
    } catch (error) {
      this.formError.set(apiError(error));
    }
  }

  protected async save() {
    if (this.saving() || !this.ready()) return;
    this.saving.set(true);
    this.formError.set(null);
    const base = {
      title: this.title().trim(),
      instructions: this.instructions().trim(),
      ...(this.subjectId() ? { subjectId: this.subjectId() } : {}),
    };
    try {
      const editing = this.editing();
      if (editing) {
        await firstValueFrom(this.api.updateHomework(editing.id, { ...base, dueOn: this.dueOn() }));
      } else {
        await firstValueFrom(
          this.api.createHomework({
            ...base,
            ...(this.dueOn() ? { dueOn: this.dueOn() } : {}),
            ...(this.mode() === 'divisions'
              ? { divisionIds: this.divisionIds() }
              : { studentIds: this.studentIds() }),
          }),
        );
      }
      this.open.set(false);
      this.toast.add({ severity: 'success', summary: editing ? 'Saved' : 'Sent to the families' });
      await this.load();
    } catch (error) {
      this.formError.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected remove(h: Homework) {
    this.confirm.confirm({
      header: 'Remove this homework?',
      message: `"${h.title}" will no longer show to families. Messages already sent stay.`,
      acceptLabel: 'Remove',
      rejectLabel: 'Keep it',
      accept: async () => {
        try {
          await firstValueFrom(this.api.archiveHomework(h.id));
          await this.load();
        } catch (error) {
          this.toast.add({
            severity: 'error',
            summary: 'Could not remove',
            detail: apiError(error),
          });
        }
      },
    });
  }
}
