import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { FormDetail, FormField, FormSchema, SchoolClass } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { FormRenderer } from '../../shared/forms/form-renderer';
import { FieldEditor, TYPE_OPTIONS } from './field-editor';
import {
  addField,
  addSection,
  canRemoveSection,
  fieldIds,
  moveField,
  moveSection,
  removeField,
  removeSection,
  renameSection,
  updateField,
} from './schema-edit';

const typeLabel = (t: string) => TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

@Component({
  selector: 'app-form-builder',
  imports: [RouterLink, ButtonModule, MessageModule, TagModule, FormRenderer, FieldEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/app/settings/forms" class="text-sm text-muted-foreground hover:text-foreground"
      >&larr; All forms</a
    >

    @if (loadError()) {
      <p-message class="mt-4 block" severity="error" [text]="loadError()!" />
    } @else if (detail(); as d) {
      <div class="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold">{{ d.name }}</h1>
          @if (editing()) {
            <p class="mt-1 text-sm text-muted-foreground">
              Editing a draft. Nothing changes for the office until you publish.
            </p>
          } @else if (d.published; as p) {
            <p class="mt-1 text-sm text-muted-foreground">
              Live: version {{ p.version }}, published {{ date(p.publishedAt) }}.
            </p>
          } @else {
            <p class="mt-1 text-sm text-muted-foreground">Not published yet.</p>
          }
        </div>

        <div class="flex flex-wrap gap-2">
          @if (editing()) {
            <p-button
              [label]="previewing() ? 'Back to editing' : 'Preview'"
              severity="secondary"
              (onClick)="previewing.set(!previewing())"
            />
            <p-button
              label="Save draft"
              severity="secondary"
              [disabled]="!dirty()"
              [loading]="saving()"
              (onClick)="save()"
            />
            <p-button label="Publish" [loading]="publishing()" (onClick)="confirmPublish()" />
            <p-button
              label="Discard draft"
              severity="danger"
              [text]="true"
              (onClick)="confirmDiscard()"
            />
          } @else {
            <p-button label="Edit form" [loading]="starting()" (onClick)="startEditing()" />
          }
        </div>
      </div>

      @if (editing() && dirty()) {
        <p-tag class="mb-4" value="Unsaved changes" severity="warn" />
      }
      @if (problems().length) {
        <div class="mb-6 rounded-md border border-destructive/50 p-4" role="alert">
          <p class="mb-2 text-sm font-medium text-destructive">
            This form cannot be saved or published yet:
          </p>
          <ul class="list-disc pl-5 text-sm">
            @for (p of problems(); track p) {
              <li>{{ p }}</li>
            }
          </ul>
        </div>
      }

      @if (schema(); as s) {
        @if (!editing() || previewing()) {
          <div class="max-w-4xl rounded-xl border-0 bg-card shadow-sm p-6">
            @if (previewing()) {
              <p class="mb-4 text-sm text-muted-foreground">
                This is how the form will look. Nothing you type here is saved.
              </p>
            }
            <app-form-renderer [schema]="s" [classes]="classes()" />
          </div>
        } @else {
          <div class="max-w-4xl">
            @for (
              section of s.sections;
              track section.id;
              let si = $index;
              let first = $first;
              let last = $last
            ) {
              <section class="mb-6 rounded-xl border-0 bg-card shadow-sm">
                <div class="flex flex-wrap items-center gap-2 border-b p-3">
                  <input
                    class="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm font-semibold"
                    [value]="section.title"
                    [attr.aria-label]="'Title of section ' + (si + 1)"
                    (change)="rename(section.id, $any($event.target).value, section.description)"
                  />
                  <p-button
                    label="Up"
                    size="small"
                    severity="secondary"
                    [text]="true"
                    [disabled]="first"
                    [attr.aria-label]="'Move section ' + section.title + ' up'"
                    (onClick)="moveSec(section.id, -1)"
                  />
                  <p-button
                    label="Down"
                    size="small"
                    severity="secondary"
                    [text]="true"
                    [disabled]="last"
                    [attr.aria-label]="'Move section ' + section.title + ' down'"
                    (onClick)="moveSec(section.id, 1)"
                  />
                  <p-button
                    label="Delete section"
                    size="small"
                    severity="danger"
                    [text]="true"
                    [disabled]="!canRemove(section)"
                    (onClick)="confirmRemoveSection(section.id, section.title)"
                  />
                </div>
                <input
                  class="w-full border-b bg-transparent px-3 py-2 text-sm text-muted-foreground"
                  placeholder="Short description (optional)"
                  [value]="section.description ?? ''"
                  [attr.aria-label]="'Description of ' + section.title"
                  (change)="rename(section.id, section.title, $any($event.target).value)"
                />

                <ul>
                  @for (
                    f of section.fields;
                    track f.id;
                    let fi = $index;
                    let fFirst = $first;
                    let fLast = $last
                  ) {
                    <li
                      class="flex flex-wrap items-center gap-3 border-b px-3 py-2 last:border-b-0"
                    >
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium">{{ f.label }}</p>
                        <p class="text-xs text-muted-foreground">
                          {{ typeText(f.type) }}
                          @if (f.width && f.width !== 'full') {
                            &middot; {{ widthText(f.width) }}
                          }
                        </p>
                      </div>
                      @if (f.required) {
                        <p-tag value="Required" severity="secondary" />
                      }
                      @if (f.system) {
                        <p-tag value="Core" severity="info" />
                      }
                      <p-button
                        label="Up"
                        size="small"
                        [text]="true"
                        severity="secondary"
                        [disabled]="fFirst"
                        [attr.aria-label]="'Move ' + f.label + ' up'"
                        (onClick)="moveFld(section.id, f.id, -1)"
                      />
                      <p-button
                        label="Down"
                        size="small"
                        [text]="true"
                        severity="secondary"
                        [disabled]="fLast"
                        [attr.aria-label]="'Move ' + f.label + ' down'"
                        (onClick)="moveFld(section.id, f.id, 1)"
                      />
                      <p-button
                        label="Edit"
                        size="small"
                        [text]="true"
                        (onClick)="openEditor(section.id, f)"
                      />
                      <p-button
                        label="Remove"
                        size="small"
                        severity="danger"
                        [text]="true"
                        [disabled]="!!f.system"
                        (onClick)="remove(f.id)"
                      />
                    </li>
                  } @empty {
                    <li class="px-3 py-3 text-sm text-muted-foreground">
                      No questions in this section yet.
                    </li>
                  }
                </ul>
                <div class="p-3">
                  <p-button
                    label="Add question"
                    size="small"
                    severity="secondary"
                    (onClick)="openEditor(section.id, null)"
                  />
                </div>
              </section>
            }
            <p-button label="Add section" severity="secondary" (onClick)="newSection()" />
          </div>
        }
      }

      <app-field-editor
        [(visible)]="editorOpen"
        [field]="editingField()"
        [takenIds]="takenIds()"
        [requiredLocked]="requiredLocked()"
        (saved)="onFieldSaved($event)"
      />
    } @else {
      <p class="mt-4 text-muted-foreground">Loading...</p>
    }
  `,
})
export class FormBuilder {
  /** From the route: /app/settings/forms/:key */
  readonly key = input.required<string>();

  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly date = (iso: string | null) => (iso ? formatDate(iso) : '');
  protected readonly typeText = typeLabel;
  protected readonly widthText = (w: string) =>
    ({ half: 'half width', third: 'one third', quarter: 'one quarter' })[w] ?? w;
  protected readonly canRemove = canRemoveSection;

  protected readonly detail = signal<FormDetail | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly classes = signal<SchoolClass[]>([]);

  /** The working copy. While editing it is the draft; otherwise the published form. */
  protected readonly schema = signal<FormSchema | null>(null);
  private readonly savedJson = signal('');
  protected readonly editing = signal(false);
  protected readonly previewing = signal(false);
  protected readonly problems = signal<string[]>([]);
  protected readonly starting = signal(false);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);

  protected readonly dirty = computed(() => JSON.stringify(this.schema()) !== this.savedJson());
  protected readonly takenIds = computed(() => {
    const s = this.schema();
    return s ? fieldIds(s) : [];
  });

  // field editor
  protected readonly editorOpen = signal(false);
  protected readonly editingField = signal<FormField | null>(null);
  private target: string | null = null;
  protected readonly requiredLocked = computed(() => {
    const f = this.editingField();
    return !!f?.system && !!this.detail()?.requiredSystem.includes(f.system);
  });

  constructor() {
    effect(() => {
      void this.load(this.key());
    });
    firstValueFrom(this.api.classes())
      .then((c) => this.classes.set(c))
      .catch(() => undefined);
  }

  // ---------- loading and saving ----------

  private async load(key: string) {
    this.loadError.set(null);
    try {
      const detail = await firstValueFrom(this.api.form(key));
      this.detail.set(detail);
      this.problems.set([]);
      this.previewing.set(false);
      const working = detail.draft ?? detail.published;
      this.editing.set(!!detail.draft);
      this.setWorking(working?.schema ?? null);
    } catch (error) {
      this.loadError.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'This form does not exist.'
          : apiError(error),
      );
    }
  }

  private setWorking(schema: FormSchema | null) {
    this.schema.set(schema);
    this.savedJson.set(JSON.stringify(schema));
  }

  protected async startEditing() {
    this.starting.set(true);
    try {
      const draft = await firstValueFrom(this.api.startFormDraft(this.key()));
      this.editing.set(true);
      this.setWorking(draft.schema);
      this.detail.update((d) => (d ? { ...d, draft } : d));
    } catch (error) {
      this.fail('Could not start editing', error);
    } finally {
      this.starting.set(false);
    }
  }

  protected async save(): Promise<boolean> {
    const schema = this.schema();
    if (!schema) return false;
    this.saving.set(true);
    this.problems.set([]);
    try {
      const draft = await firstValueFrom(this.api.saveFormDraft(this.key(), { schema }));
      this.setWorking(draft.schema);
      this.toast.add({ severity: 'success', summary: 'Draft saved' });
      return true;
    } catch (error) {
      this.showProblems('Could not save the draft', error);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  protected confirmPublish() {
    this.confirmation.confirm({
      header: 'Publish this form',
      message:
        'The office will start using this version straight away. Applications already taken keep the version they were filled in with.',
      acceptLabel: 'Publish',
      rejectLabel: 'Cancel',
      accept: () => void this.publish(),
    });
  }

  private async publish() {
    if (this.dirty() && !(await this.save())) return;
    this.publishing.set(true);
    this.problems.set([]);
    try {
      const published = await firstValueFrom(this.api.publishForm(this.key()));
      this.toast.add({ severity: 'success', summary: `Version ${published.version} is now live` });
      await this.load(this.key());
    } catch (error) {
      this.showProblems('Could not publish', error);
    } finally {
      this.publishing.set(false);
    }
  }

  protected confirmDiscard() {
    this.confirmation.confirm({
      header: 'Discard the draft',
      message: 'All changes since the last publish will be lost.',
      acceptLabel: 'Discard',
      rejectLabel: 'Keep editing',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await firstValueFrom(this.api.discardFormDraft(this.key()));
          await this.load(this.key());
        } catch (error) {
          this.fail('Could not discard the draft', error);
        }
      },
    });
  }

  // ---------- editing the schema ----------

  private change(next: FormSchema) {
    this.schema.set(next);
    this.problems.set([]);
  }

  protected newSection() {
    const s = this.schema();
    if (s) this.change(addSection(s));
  }
  protected rename(sectionId: string, title: string, description?: string) {
    const s = this.schema();
    if (s && title.trim())
      this.change(renameSection(s, sectionId, title.trim(), description?.trim()));
  }
  protected moveSec(sectionId: string, by: -1 | 1) {
    const s = this.schema();
    if (s) this.change(moveSection(s, sectionId, by));
  }
  protected confirmRemoveSection(sectionId: string, title: string) {
    this.confirmation.confirm({
      header: 'Delete section',
      message: `Delete "${title}" and all its questions from this draft?`,
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        const s = this.schema();
        if (s) this.change(removeSection(s, sectionId));
      },
    });
  }
  protected moveFld(sectionId: string, fieldId: string, by: -1 | 1) {
    const s = this.schema();
    if (s) this.change(moveField(s, sectionId, fieldId, by));
  }
  protected remove(fieldId: string) {
    const s = this.schema();
    if (s) this.change(removeField(s, fieldId));
  }

  protected openEditor(sectionId: string, field: FormField | null) {
    this.target = sectionId;
    this.editingField.set(field);
    this.editorOpen.set(true);
  }

  protected onFieldSaved(field: FormField) {
    const s = this.schema();
    if (!s) return;
    this.change(
      this.editingField()
        ? updateField(s, field)
        : addField(s, this.target ?? s.sections[0].id, field),
    );
  }

  // ---------- errors ----------

  private showProblems(summary: string, error: unknown) {
    if (error instanceof HttpErrorResponse && Array.isArray(error.error?.problems)) {
      this.problems.set(error.error.problems as string[]);
    } else {
      this.fail(summary, error);
    }
  }

  private fail(summary: string, error: unknown) {
    this.toast.add({ severity: 'error', summary, detail: apiError(error) });
  }
}
