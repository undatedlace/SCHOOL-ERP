import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { InputNumberModule } from '@openng/optimus-ui/inputnumber';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MultiSelectModule } from '@openng/optimus-ui/multiselect';
import { SelectModule } from '@openng/optimus-ui/select';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { FileRef, Homework, Subject } from '../../core/models';
import { toIsoDate } from '../../shared/dates';
import { FilePicker } from '../../shared/ui/file-picker';
import { DateField } from '../../shared/ui/date-field';
import { FilterBar, FilterField, FilterValues } from '../../shared/ui/filter-bar';
import { PageHeader } from '../../shared/ui/page-header';
import { HandInsDialog } from './hand-ins-dialog';
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
    CheckboxModule,
    InputNumberModule,
    FilePicker,
    HandInsDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Homework"
      subtitle="Homework and assignments you have set, and a way to set more."
    >
      <p-button label="Set homework" (onClick)="openNew()" />
    </app-page-header>

    <p-selectbutton
      class="mb-4 block"
      [options]="[
        { label: 'Still open', value: false },
        { label: 'Everything', value: true },
      ]"
      optionLabel="label"
      optionValue="value"
      [allowEmpty]="false"
      [ngModel]="all()"
      (ngModelChange)="setAll($event)"
      aria-label="Which to show"
    />
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
              @if (h.handIn) {
                <p-button
                  label="Hand-ins"
                  size="small"
                  [text]="true"
                  [ariaLabel]="'Hand-ins for ' + h.title"
                  (onClick)="handIns.set(h)"
                />
              }
              <p-button
                label="Change"
                size="small"
                [text]="true"
                [ariaLabel]="'Change ' + h.title"
                (onClick)="openEdit(h)"
              />
              <p-button
                label="Remove"
                size="small"
                [text]="true"
                severity="danger"
                [ariaLabel]="'Remove ' + h.title"
                (onClick)="remove(h)"
              />
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

        <div class="flex flex-col gap-2 text-sm">
          <span>Attachments (optional, up to 5)</span>
          @if (attachments().length) {
            <ul class="flex flex-col gap-1">
              @for (f of attachments(); track f.id) {
                <li class="flex items-center gap-3">
                  <span>{{ f.name }}</span>
                  <p-button
                    label="Remove"
                    size="small"
                    [text]="true"
                    severity="danger"
                    [ariaLabel]="'Remove ' + f.name"
                    (onClick)="removeAttachment(f.id)"
                  />
                </li>
              }
            </ul>
          }
          <div>
            <app-file-picker
              label="Attach a worksheet or picture"
              [disabled]="attachments().length >= 5"
              [busy]="uploading()"
              (picked)="attach($event)"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-4 text-sm">
          <div class="flex items-center gap-2">
            <p-checkbox
              [binary]="true"
              [disabled]="handInLocked()"
              [ngModel]="handIn()"
              (ngModelChange)="setHandIn($event)"
              ariaLabel="Students hand work in through the app"
            />
            Students hand work in through the app
          </div>
          @if (handIn()) {
            <div class="flex items-center gap-2">
              Marks out of
              <p-inputnumber
                [min]="0.01"
                [max]="1000"
                [maxFractionDigits]="2"
                [disabled]="editing() !== null && marksGiven()"
                placeholder="optional"
                ariaLabel="Marks out of"
                [ngModel]="maxMarks()"
                (ngModelChange)="maxMarks.set($event)"
                styleClass="w-28"
              />
            </div>
          }
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

    <app-hand-ins-dialog [homework]="handIns()" (closed)="closeHandIns()" />
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
  protected readonly attachments = signal<FileRef[]>([]);
  protected readonly uploading = signal(false);
  protected readonly handIn = signal(false);
  protected readonly maxMarks = signal<number | null>(null);
  /** Hand-in cannot be switched off once a student has handed something in; marks cannot change once given. */
  protected readonly handInLocked = signal(false);
  protected readonly marksGiven = signal(false);
  protected readonly handIns = signal<Homework | null>(null);
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
    this.attachments.set([]);
    this.handIn.set(false);
    this.maxMarks.set(null);
    this.handInLocked.set(false);
    this.marksGiven.set(false);
    this.formError.set(null);
    this.open.set(true);
  }

  protected openEdit(h: Homework) {
    this.editing.set(h);
    this.title.set(h.title);
    this.instructions.set(h.instructions);
    this.subjectId.set(h.subject?.id ?? '');
    this.dueOn.set(h.dueOn ?? '');
    this.attachments.set(h.attachments);
    this.handIn.set(h.handIn);
    this.maxMarks.set(h.maxMarks === null ? null : +h.maxMarks);
    // The server refuses these once work has been handed in or marked; it explains if tried.
    this.handInLocked.set(false);
    this.marksGiven.set(false);
    this.formError.set(null);
    this.open.set(true);
  }

  protected setHandIn(on: boolean) {
    this.handIn.set(on);
    if (!on) this.maxMarks.set(null);
  }

  protected async attach(file: File) {
    this.uploading.set(true);
    this.formError.set(null);
    try {
      const saved = await firstValueFrom(this.api.uploadFile(file, 'homework-attachment'));
      this.attachments.update((all) => [
        ...all,
        { id: saved.id, name: file.name, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes },
      ]);
    } catch (error) {
      this.formError.set(apiError(error));
    } finally {
      this.uploading.set(false);
    }
  }

  protected removeAttachment(id: string) {
    this.attachments.update((all) => all.filter((f) => f.id !== id));
  }

  protected closeHandIns() {
    this.handIns.set(null);
    void this.load();
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
      handIn: this.handIn(),
      ...(this.handIn() && this.maxMarks() !== null ? { maxMarks: this.maxMarks()! } : {}),
      attachmentFileIds: this.attachments().map((f) => f.id),
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
