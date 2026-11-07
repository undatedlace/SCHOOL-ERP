import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from '@openng/optimus-ui/button';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { DatePickerModule } from '@openng/optimus-ui/datepicker';
import { InputNumberModule } from '@openng/optimus-ui/inputnumber';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { SelectModule } from '@openng/optimus-ui/select';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { AnswerErrors, FormField as Field, FormSchema } from '../../core/models';
import { FormField } from '../ui/form-field';
import { buildGroup, newRow, readAnswers } from './form-values';
import { ImageUpload } from './image-upload';

/**
 * Draws any form definition as a working form. The parent keeps a reference to
 * it and calls answers(), isValid() and touchAll() when the user presses Save.
 */
@Component({
  selector: 'app-form-renderer',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    ImageUpload,
    SelectModule,
    SelectButtonModule,
    TextareaModule,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (section of schema().sections; track section.id) {
      <section class="mb-8">
        <h2 class="text-base font-semibold">{{ section.title }}</h2>
        @if (section.description) {
          <p class="mt-1 text-sm text-muted-foreground">{{ section.description }}</p>
        }
        <div class="mt-4 grid grid-cols-12 gap-4">
          @for (field of section.fields; track field.id) {
            <div [class]="span(field)">
              @if (field.type === 'group') {
                <div class="rounded-lg border p-4">
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <h3 class="text-sm font-medium">{{ field.label }}</h3>
                    @if (rows(field).length < (field.maxItems ?? 10)) {
                      <p-button
                        type="button"
                        label="Add row"
                        size="small"
                        severity="secondary"
                        (onClick)="addRow(field)"
                      />
                    }
                  </div>
                  @if (errors()[field.id]) {
                    <small class="text-destructive" role="alert">{{ errors()[field.id] }}</small>
                  }
                  @for (row of rows(field); track row; let i = $index) {
                    <div class="mb-3 rounded-md border bg-muted/40 p-3">
                      <div
                        class="grid gap-3"
                        style="grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr))"
                      >
                        @for (column of field.fields; track column.id) {
                          <ng-container
                            [ngTemplateOutlet]="control"
                            [ngTemplateOutletContext]="{
                              $implicit: column,
                              ctrl: row.get(column.id),
                              path: field.id + '[' + i + '].' + column.id,
                            }"
                          />
                        }
                      </div>
                      <div class="mt-2 text-right">
                        <p-button
                          type="button"
                          label="Remove row"
                          size="small"
                          severity="danger"
                          [text]="true"
                          (onClick)="removeRow(field, i)"
                        />
                      </div>
                    </div>
                  } @empty {
                    <p class="text-sm text-muted-foreground">No rows yet.</p>
                  }
                </div>
              } @else {
                <ng-container
                  [ngTemplateOutlet]="control"
                  [ngTemplateOutletContext]="{
                    $implicit: field,
                    ctrl: form().get(field.id),
                    path: field.id,
                  }"
                />
              }
            </div>
          }
        </div>
      </section>
    }

    <ng-template #control let-f let-ctrl="ctrl" let-path="path">
      @if (f.type === 'checkbox') {
        <div class="flex items-start gap-2">
          <p-checkbox [formControl]="ctrl" [binary]="true" [inputId]="id(path)" />
          <label [attr.for]="id(path)" class="text-sm"
            >{{ f.label }}
            @if (f.required) {
              <span class="text-destructive"> *</span>
            }
          </label>
        </div>
        @if (errors()[path] ?? failure(ctrl); as text) {
          <small class="text-destructive" role="alert">{{ text }}</small>
        }
      } @else {
        <app-form-field
          [label]="f.label"
          [for]="id(path)"
          [control]="ctrl"
          [required]="!!f.required"
          [hint]="f.helpText"
          [error]="errors()[path] ?? null"
        >
          @switch (f.type) {
            @case ('textarea') {
              <textarea
                pTextarea
                [formControl]="ctrl"
                [id]="id(path)"
                rows="2"
                [autoResize]="true"
                [fluid]="true"
                [placeholder]="f.placeholder ?? ''"
              ></textarea>
            }
            @case ('number') {
              <p-inputnumber
                [formControl]="ctrl"
                [inputId]="id(path)"
                [useGrouping]="false"
                [min]="f.min ?? null"
                [max]="f.max ?? null"
                [fluid]="true"
                [placeholder]="f.placeholder ?? ''"
              />
            }
            @case ('date') {
              <p-datepicker
                [formControl]="ctrl"
                [inputId]="id(path)"
                dateFormat="dd/mm/yy"
                appendTo="body"
                [fluid]="true"
                [placeholder]="f.placeholder || 'dd/mm/yyyy'"
              />
            }
            @case ('select') {
              <p-select
                [formControl]="ctrl"
                [inputId]="id(path)"
                [options]="options(f)"
                optionLabel="label"
                optionValue="value"
                appendTo="body"
                [showClear]="!f.required"
                [fluid]="true"
                [placeholder]="f.placeholder || 'Select'"
              />
            }
            @case ('image') {
              <app-image-upload [formControl]="ctrl" [inputId]="id(path)" [altText]="f.label" />
            }
            @case ('radio') {
              <p-selectbutton
                [formControl]="ctrl"
                [options]="options(f)"
                optionLabel="label"
                optionValue="value"
                [allowEmpty]="false"
                [ariaLabelledBy]="id(path)"
              />
            }
            @default {
              <input
                pInputText
                [formControl]="ctrl"
                [id]="id(path)"
                [fluid]="true"
                [placeholder]="f.placeholder ?? ''"
              />
            }
          }
        </app-form-field>
      }
    </ng-template>
  `,
})
export class FormRenderer {
  readonly schema = input.required<FormSchema>();
  /** The school's classes, for fields that take their options from them. */
  readonly classes = input<{ id: string; name: string }[]>([]);
  /** The starting answers (for editing). Pass a stable reference. */
  readonly value = input<Record<string, unknown> | null>(null);
  /** Messages from the server, by field id. */
  readonly errors = input<AnswerErrors>({});

  private readonly fields = computed(() => this.schema().sections.flatMap((s) => s.fields));
  /** Rebuilt whenever the form definition or the starting answers change. */
  protected readonly form = computed(() => buildGroup(this.fields(), this.value() ?? {}));

  answers(): Record<string, unknown> {
    return readAnswers(this.fields(), this.form());
  }

  isValid(): boolean {
    return this.form().valid;
  }

  touchAll(): void {
    this.form().markAllAsTouched();
  }

  protected span(f: Field): string {
    const width = this.widthClass(f);
    // In a grid, an item told to start in column 1 moves to the next row.
    return f.newRow ? `${width} col-start-1` : width;
  }

  private widthClass(f: Field): string {
    switch (f.width) {
      case 'quarter':
        return 'col-span-6 sm:col-span-4 lg:col-span-3';
      case 'third':
        return 'col-span-12 sm:col-span-6 lg:col-span-4';
      case 'half':
        return 'col-span-12 sm:col-span-6';
      default:
        return 'col-span-12';
    }
  }

  protected options(f: Field): { value: string; label: string }[] {
    return f.optionsFrom === 'classes'
      ? this.classes().map((c) => ({ value: c.id, label: c.name }))
      : (f.options ?? []);
  }

  protected rows(f: Field): FormGroup[] {
    return (this.form().get(f.id) as FormArray).controls as FormGroup[];
  }

  protected addRow(f: Field): void {
    (this.form().get(f.id) as FormArray).push(newRow(f));
  }

  protected removeRow(f: Field, index: number): void {
    (this.form().get(f.id) as FormArray).removeAt(index);
  }

  /** A DOM id that is safe to use in a "for" attribute. */
  protected id(path: string): string {
    return 'f_' + path.replace(/[^a-zA-Z0-9]/g, '_');
  }

  protected failure(ctrl: { touched: boolean; errors: unknown } | null): string | null {
    return ctrl?.touched && ctrl.errors ? 'This must be ticked' : null;
  }
}
