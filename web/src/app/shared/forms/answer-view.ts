import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormField as Field, FormSchema } from '../../core/models';
import { formatDate } from '../dates';

interface Row {
  label: string;
  text?: string;
  /** For photographs: the id of the uploaded file. */
  image?: string;
  /** For documents: the id of the uploaded file, opened in a new tab. */
  doc?: string;
  /** For repeating groups: one entry per row, as label/value pairs. */
  table?: { columns: string[]; rows: string[][] };
}

/** The answers on an application, read-only, grouped by the form's sections. */
@Component({
  selector: 'app-answer-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (section of view(); track section.title) {
      <section class="mb-6">
        <h2 class="mb-3 border-b pb-2 text-sm font-semibold">{{ section.title }}</h2>
        <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          @for (row of section.rows; track row.label) {
            <div [class.sm:col-span-2]="row.table">
              <dt class="text-xs text-muted-foreground">{{ row.label }}</dt>
              @if (row.table; as t) {
                <dd class="mt-1 overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-xs text-muted-foreground">
                        @for (c of t.columns; track c) {
                          <th class="pr-4 font-normal">{{ c }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (r of t.rows; track $index) {
                        <tr>
                          @for (cell of r; track $index) {
                            <td class="pr-4">{{ cell || '-' }}</td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </dd>
              } @else if (row.image) {
                <dd class="mt-1">
                  <a [href]="'/api/files/' + row.image" target="_blank" rel="noopener">
                    <img
                      [src]="'/api/files/' + row.image"
                      [alt]="row.label"
                      class="h-32 w-24 rounded-md border object-cover"
                    />
                  </a>
                </dd>
              } @else if (row.doc) {
                <dd class="text-sm">
                  <a
                    class="app-link"
                    [href]="'/api/files/' + row.doc"
                    target="_blank"
                    rel="noopener"
                    [attr.aria-label]="'Open ' + row.label"
                    >Open document</a
                  >
                </dd>
              } @else {
                <dd class="text-sm whitespace-pre-line">{{ row.text }}</dd>
              }
            </div>
          }
        </dl>
      </section>
    } @empty {
      <p class="text-sm text-muted-foreground">No answers recorded.</p>
    }
  `,
})
export class AnswerView {
  readonly schema = input.required<FormSchema>();
  readonly answers = input.required<Record<string, unknown>>();
  readonly classes = input<{ id: string; name: string }[]>([]);

  /** Only answered fields are shown, and sections with no answers are left out. */
  protected readonly view = computed(() =>
    this.schema()
      .sections.map((s) => ({
        title: s.title,
        rows: s.fields.flatMap((f) => this.row(f, this.answers()[f.id])),
      }))
      .filter((s) => s.rows.length > 0),
  );

  private row(field: Field, value: unknown): Row[] {
    if (value === undefined || value === null || value === '') return [];
    if (field.type === 'group') {
      const rows = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
      const columns = field.fields ?? [];
      if (rows.length === 0) return [];
      return [
        {
          label: field.label,
          table: {
            columns: columns.map((c) => c.label),
            rows: rows.map((r) => columns.map((c) => this.display(c, r[c.id]))),
          },
        },
      ];
    }
    if (field.type === 'image') return [{ label: field.label, image: String(value) }];
    if (field.type === 'document') return [{ label: field.label, doc: String(value) }];
    return [{ label: field.label, text: this.display(field, value) }];
  }

  private display(field: Field, value: unknown): string {
    if (value === undefined || value === null) return '';
    switch (field.type) {
      case 'checkbox':
        return value === true ? 'Yes' : 'No';
      case 'date':
        return typeof value === 'string' ? formatDate(value) : '';
      case 'select':
      case 'radio': {
        const v = String(value);
        if (field.optionsFrom === 'classes')
          return this.classes().find((c) => c.id === v)?.name ?? v;
        return field.options?.find((o) => o.value === v)?.label ?? v;
      }
      default:
        return String(value);
    }
  }
}
