import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from '@openng/optimus-ui/button';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputNumberModule } from '@openng/optimus-ui/inputnumber';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { FieldType, FieldWidth, FormField as Field } from '../../core/models';
import { FormField } from '../../shared/ui/form-field';
import { optionsFromLines, toFieldId } from './schema-edit';

export const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown list' },
  { value: 'radio', label: 'Choice buttons' },
  { value: 'checkbox', label: 'Tick box' },
  { value: 'image', label: 'Photograph' },
  { value: 'document', label: 'Document (PDF or photo of a paper)' },
  { value: 'ageLimits', label: 'Age limits table' },
  { value: 'group', label: 'Repeating rows' },
];
const COLUMN_TYPES = TYPE_OPTIONS.filter((t) =>
  ['text', 'textarea', 'number', 'date'].includes(t.value),
);
const WIDTHS: { value: FieldWidth; label: string }[] = [
  { value: 'full', label: 'Full width' },
  { value: 'half', label: 'Half width' },
  { value: 'third', label: 'One third' },
  { value: 'quarter', label: 'One quarter' },
];

/** Add or change one question on a form. */
@Component({
  selector: 'app-field-editor',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TextareaModule,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="field() ? 'Edit question' : 'Add question'"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '38rem', 'max-width': '95vw' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4" novalidate>
        @if (isCore()) {
          <p-message
            severity="info"
            text="This is a core question the system relies on. You can change its wording and layout, but not remove it or change its type."
          />
        }

        <app-form-field
          label="Question"
          for="fe_label"
          [control]="form.controls.label"
          [required]="true"
        >
          <input pInputText id="fe_label" formControlName="label" [fluid]="true" />
        </app-form-field>

        <div class="grid gap-4 sm:grid-cols-2">
          <app-form-field label="Answer type" for="fe_type">
            <p-select
              inputId="fe_type"
              formControlName="type"
              [options]="typeOptions"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
              [fluid]="true"
            />
          </app-form-field>
          <app-form-field label="Width" for="fe_width">
            <p-select
              inputId="fe_width"
              formControlName="width"
              [options]="widths"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
              [fluid]="true"
            />
          </app-form-field>
        </div>

        @if (type() !== 'ageLimits') {
          <div class="flex items-center gap-2">
            <p-checkbox formControlName="required" [binary]="true" inputId="fe_required" />
            <label for="fe_required" class="text-sm">Required</label>
            @if (requiredLocked()) {
              <small class="text-muted-foreground">(always required)</small>
            }
          </div>
        }

        <div class="flex items-center gap-2">
          <p-checkbox formControlName="newRow" [binary]="true" inputId="fe_newrow" />
          <label for="fe_newrow" class="text-sm">Start on a new row</label>
        </div>

        @if (type() === 'ageLimits') {
          <p class="text-sm text-muted-foreground">
            This block takes no answer. It shows each class's minimum age, taken from Academic
            setup, so it always matches the school's settings.
          </p>
        }
        <app-form-field label="Help text" for="fe_help" hint="Shown under the question.">
          <input pInputText id="fe_help" formControlName="helpText" [fluid]="true" />
        </app-form-field>

        @switch (type()) {
          @case ('text') {
            <div class="grid gap-4 sm:grid-cols-2">
              <app-form-field label="Placeholder" for="fe_ph">
                <input pInputText id="fe_ph" formControlName="placeholder" [fluid]="true" />
              </app-form-field>
              <app-form-field label="Longest answer (characters)" for="fe_maxlen">
                <p-inputnumber
                  inputId="fe_maxlen"
                  formControlName="maxLength"
                  [useGrouping]="false"
                  [min]="1"
                  [max]="5000"
                  [fluid]="true"
                />
              </app-form-field>
            </div>
          }
          @case ('number') {
            <div class="grid gap-4 sm:grid-cols-2">
              <app-form-field label="Smallest value" for="fe_min">
                <p-inputnumber
                  inputId="fe_min"
                  formControlName="min"
                  [useGrouping]="false"
                  [fluid]="true"
                />
              </app-form-field>
              <app-form-field label="Largest value" for="fe_max">
                <p-inputnumber
                  inputId="fe_max"
                  formControlName="max"
                  [useGrouping]="false"
                  [fluid]="true"
                />
              </app-form-field>
            </div>
          }
          @case ('select') {
            @if (field()?.optionsFrom === 'classes') {
              <p class="text-sm text-muted-foreground">The choices are the school's classes.</p>
            } @else {
              <ng-container *ngTemplateOutlet="choices" />
            }
          }
          @case ('radio') {
            <ng-container *ngTemplateOutlet="choices" />
          }
          @case ('group') {
            <div class="rounded-md border p-3">
              <div class="mb-2 flex items-center justify-between">
                <h3 class="text-sm font-medium">Columns</h3>
                <p-button
                  type="button"
                  label="Add column"
                  size="small"
                  severity="secondary"
                  (onClick)="addColumn()"
                />
              </div>
              @for (col of columns.controls; track col; let i = $index) {
                <div class="mb-2 grid grid-cols-12 items-center gap-2" [formGroup]="$any(col)">
                  <input
                    pInputText
                    class="col-span-5"
                    formControlName="label"
                    placeholder="Column name"
                    [attr.aria-label]="'Column ' + (i + 1) + ' name'"
                  />
                  <p-select
                    class="col-span-4"
                    formControlName="type"
                    [options]="columnTypes"
                    optionLabel="label"
                    optionValue="value"
                    appendTo="body"
                    [fluid]="true"
                  />
                  <span class="col-span-2 flex items-center gap-1">
                    <p-checkbox
                      formControlName="required"
                      [binary]="true"
                      [inputId]="'col_req_' + i"
                    />
                    <label [attr.for]="'col_req_' + i" class="text-xs">Required</label>
                  </span>
                  <p-button
                    class="col-span-1"
                    type="button"
                    label="x"
                    size="small"
                    severity="danger"
                    [text]="true"
                    [attr.aria-label]="'Remove column ' + (i + 1)"
                    (onClick)="columns.removeAt(i)"
                  />
                </div>
              }
              <app-form-field label="Most rows" for="fe_maxitems" class="mt-3">
                <p-inputnumber
                  inputId="fe_maxitems"
                  formControlName="maxItems"
                  [useGrouping]="false"
                  [min]="1"
                  [max]="20"
                  [fluid]="true"
                />
              </app-form-field>
            </div>
          }
        }

        @if (problem()) {
          <p-message severity="error" [text]="problem()!" />
        }
        <div class="flex justify-end gap-2">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            (onClick)="visible.set(false)"
          />
          <p-button type="submit" [label]="field() ? 'Apply changes' : 'Add question'" />
        </div>
      </form>

      <ng-template #choices>
        @if (isCore()) {
          <p class="text-sm text-muted-foreground">The choices for this core question are fixed.</p>
        } @else {
          <app-form-field
            label="Choices"
            for="fe_options"
            hint="One choice per line."
            [control]="form.controls.optionLines"
          >
            <textarea
              pTextarea
              id="fe_options"
              formControlName="optionLines"
              rows="4"
              [autoResize]="true"
              [fluid]="true"
            ></textarea>
          </app-form-field>
        }
      </ng-template>
    </p-dialog>
  `,
})
export class FieldEditor {
  /** The question being changed, or null to add a new one. */
  readonly field = input<Field | null>(null);
  /** Ids already used on the form, so a new one can be made unique. */
  readonly takenIds = input<string[]>([]);
  readonly requiredLocked = input(false);
  readonly visible = model(false);
  readonly saved = output<Field>();

  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly columnTypes = COLUMN_TYPES;
  protected readonly widths = WIDTHS;
  protected readonly problem = signal<string | null>(null);

  private readonly fb = inject(FormBuilder);
  protected readonly form = this.fb.nonNullable.group({
    label: ['', [Validators.required, Validators.maxLength(150)]],
    type: ['text' as FieldType],
    width: ['full' as FieldWidth],
    newRow: [false],
    required: [false],
    helpText: ['', Validators.maxLength(300)],
    placeholder: ['', Validators.maxLength(100)],
    maxLength: [null as number | null],
    min: [null as number | null],
    max: [null as number | null],
    maxItems: [null as number | null],
    optionLines: [''],
    columns: this.fb.array<ReturnType<FieldEditor['newColumn']>>([]),
  });
  protected readonly columns = this.form.controls.columns as FormArray;

  protected readonly type = toSignal(this.form.controls.type.valueChanges, {
    initialValue: 'text' as FieldType,
  });
  protected readonly isCore = computed(() => !!this.field()?.system);

  constructor() {
    effect(() => {
      if (this.visible()) this.load(this.field());
    });
  }

  private newColumn(col?: Field) {
    return this.fb.nonNullable.group({
      id: [col?.id ?? ''],
      label: [col?.label ?? ''],
      type: [(col?.type ?? 'text') as FieldType],
      required: [!!col?.required],
    });
  }

  protected addColumn() {
    this.columns.push(this.newColumn());
  }

  private load(f: Field | null) {
    this.problem.set(null);
    this.columns.clear();
    (f?.fields ?? []).forEach((c) => this.columns.push(this.newColumn(c)));
    this.form.reset({
      label: f?.label ?? '',
      type: f?.type ?? 'text',
      width: f?.width ?? 'full',
      newRow: !!f?.newRow,
      required: !!f?.required,
      helpText: f?.helpText ?? '',
      placeholder: f?.placeholder ?? '',
      maxLength: f?.maxLength ?? null,
      min: f?.min ?? null,
      max: f?.max ?? null,
      maxItems: f?.maxItems ?? null,
      optionLines: (f?.options ?? []).map((o) => o.label).join('\n'),
    });
    if (f?.system) this.form.controls.type.disable();
    else this.form.controls.type.enable();
    if (this.requiredLocked()) {
      this.form.controls.required.setValue(true);
      this.form.controls.required.disable();
    } else {
      this.form.controls.required.enable();
    }
    if (f?.type === 'group' && f.fields?.length === 0) this.addColumn();
  }

  protected save() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    const existing = this.field();
    const type = (existing?.system ? existing.type : v.type) as FieldType;
    const result: Field = {
      id: existing?.id ?? toFieldId(v.label, this.takenIds()),
      type,
      label: v.label.trim(),
    };
    if (v.required || this.requiredLocked()) result.required = true;
    if (v.helpText.trim()) result.helpText = v.helpText.trim();
    if (v.width !== 'full') result.width = v.width;
    if (v.newRow) result.newRow = true;
    // Remember an explicit "no" on a field that had the setting, so it is not applied again later.
    else if (existing && existing.newRow !== undefined) result.newRow = false;
    if (existing?.system) result.system = existing.system;

    if (type === 'text' || type === 'textarea') {
      if (v.placeholder.trim()) result.placeholder = v.placeholder.trim();
      if (type === 'text' && v.maxLength) result.maxLength = v.maxLength;
    }
    if (type === 'number') {
      if (v.min !== null) result.min = v.min;
      if (v.max !== null) result.max = v.max;
      if (v.min !== null && v.max !== null && v.min > v.max)
        return this.problem.set('The smallest value cannot be more than the largest.');
    }
    if (type === 'select' || type === 'radio') {
      if (existing?.optionsFrom === 'classes') {
        result.optionsFrom = 'classes';
      } else if (existing?.system) {
        result.options = existing.options;
      } else {
        const options = optionsFromLines(v.optionLines.split('\n'), existing?.options);
        if (options.length === 0) return this.problem.set('Add at least one choice.');
        result.options = options;
      }
    }
    if (type === 'group') {
      const taken = new Set<string>();
      const cols: Field[] = [];
      for (const c of this.columns.getRawValue() as {
        id: string;
        label: string;
        type: FieldType;
        required: boolean;
      }[]) {
        if (!c.label.trim()) continue;
        const id = c.id || toFieldId(c.label, taken);
        taken.add(id);
        cols.push({
          id,
          type: c.type,
          label: c.label.trim(),
          ...(c.required ? { required: true } : {}),
        });
      }
      if (cols.length === 0) return this.problem.set('Add at least one column.');
      result.fields = cols;
      if (v.maxItems) result.maxItems = v.maxItems;
    }

    this.saved.emit(result);
    this.visible.set(false);
  }
}
