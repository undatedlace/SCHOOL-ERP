import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DatePickerModule } from '@openng/optimus-ui/datepicker';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import {
  AnswerErrors,
  Eligibility,
  FormPhotoRead,
  FormSchema,
  ReviewNote,
  SchoolClass,
} from '../../core/models';
import { formatDate, fromIsoDate, toIsoDate } from '../../shared/dates';
import { FormRenderer } from '../../shared/forms/form-renderer';
import { FormField } from '../../shared/ui/form-field';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'app-application-new',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    InputTextModule,
    MessageModule,
    FormField,
    FormRenderer,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="New application" [subtitle]="formName()">
      <a routerLink="/app/admissions"><p-button label="Cancel" severity="secondary" /></a>
    </app-page-header>

    @if (loadError()) {
      <p-message severity="error" [text]="loadError()!" />
    } @else if (schema(); as s) {
      <div class="max-w-4xl">
        <div
          class="mb-8 grid gap-4 rounded-xl border-0 bg-card shadow-sm p-4 sm:grid-cols-2"
          [formGroup]="header"
        >
          <app-form-field
            label="Form number"
            for="formNo"
            hint="As printed on the paper form. Leave empty to number automatically."
            [error]="errors()['formNo'] ?? null"
          >
            <input pInputText id="formNo" formControlName="formNo" [fluid]="true" />
          </app-form-field>
          <app-form-field label="Date on the form" for="receivedOn">
            <p-datepicker
              inputId="receivedOn"
              formControlName="receivedOn"
              dateFormat="dd/mm/yy"
              appendTo="body"
              [fluid]="true"
            />
          </app-form-field>
        </div>

        @if (photosAvailable()) {
          <div class="mb-6 rounded-xl border-0 bg-card p-5 shadow-sm">
            <h2 class="text-base font-semibold">Fill from photos of the paper form</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              Photograph each page of the filled-in form, flat and in good light, then let the
              system fill in what it can read. Check every answer before saving: answers it was
              unsure of are outlined.
            </p>
            <input
              #photoInput
              type="file"
              class="hidden"
              multiple
              accept="image/jpeg,image/png,image/webp"
              (change)="choosePhotos(photoInput)"
            />
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <p-button
                label="Choose photos"
                severity="secondary"
                [disabled]="reading()"
                (onClick)="photoInput.click()"
              />
              <p-button
                label="Read the form"
                [disabled]="photos().length === 0"
                [loading]="reading()"
                (onClick)="readPhotos()"
              />
              @if (photos().length) {
                <span class="text-sm text-muted-foreground">
                  {{ photos().length }} {{ photos().length === 1 ? 'photo' : 'photos' }}:
                  {{ photoNames() }}
                </span>
              }
            </div>
            @if (reading()) {
              <p class="mt-2 text-sm text-muted-foreground" role="status">
                Reading the form. This can take up to a minute.
              </p>
            }
            @if (readSummary(); as r) {
              <div class="mt-3" role="status">
                <p-message
                  [severity]="
                    r.summary.toCheck || r.summary.missingPages.length ? 'warn' : 'success'
                  "
                >
                  <div>
                    <p>
                      Filled in {{ r.summary.filled }}
                      {{ r.summary.filled === 1 ? 'answer' : 'answers' }} in
                      {{ r.summary.seconds }} seconds.
                      @if (r.summary.toCheck) {
                        {{ r.summary.toCheck }} {{ r.summary.toCheck === 1 ? 'is' : 'are' }}
                        outlined for checking.
                      }
                    </p>
                    @if (r.summary.missingPages.length) {
                      <p class="mt-1">
                        Not found in the photos: {{ pageNames(r.summary.missingPages) }}. Add a
                        photo of
                        {{ r.summary.missingPages.length === 1 ? 'that page' : 'those pages' }}
                        or type those answers.
                      </p>
                    }
                  </div>
                </p-message>
              </div>
            }
          </div>
        }

        <div class="mb-6 rounded-xl border-0 bg-card p-5 shadow-sm">
          <app-form-renderer
            [schema]="s"
            [value]="prefill()"
            [review]="review()"
            [classes]="classes()"
            [errors]="errors()"
            [ageAsOn]="ageAsOn()"
            (changed)="onChanged()"
          />
        </div>

        @if (advice(); as a) {
          @if (a.eligible) {
            @if (a.ageText) {
              <p class="mb-4 text-sm text-muted-foreground">
                Age as on {{ format(a.asOn) }}: {{ a.ageText }}.
              </p>
            }
          } @else {
            <div class="mb-4" role="status">
              <p-message severity="warn">
                <div>
                  @for (issue of a.issues; track issue) {
                    <p>{{ issue }}</p>
                  }
                  <p class="mt-1 text-xs">You can still save this application.</p>
                </div>
              </p-message>
            </div>
          }
        }

        @if (summary()) {
          <p-message class="mb-4 block" severity="error" [text]="summary()!" />
        }
        <div class="flex gap-2">
          <p-button label="Save application" [loading]="saving()" (onClick)="save()" />
          <a routerLink="/app/admissions"><p-button label="Cancel" severity="secondary" /></a>
        </div>
      </div>
    } @else {
      <p class="text-muted-foreground">Loading the form...</p>
    }
  `,
})
export class ApplicationNew {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly renderer = viewChild(FormRenderer);

  protected readonly schema = signal<FormSchema | null>(null);
  protected readonly formName = signal('');
  protected readonly classes = signal<SchoolClass[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly errors = signal<AnswerErrors>({});
  protected readonly summary = signal<string | null>(null);
  protected readonly format = formatDate;
  /** Advice on the child's age for the chosen class. It never blocks saving. */
  protected readonly advice = signal<Eligibility | null>(null);
  protected readonly ageAsOn = signal<string | null>(null);
  private adviceTimer?: ReturnType<typeof setTimeout>;
  private adviceRun = 0;
  /** Filling the form from photos of the paper form (only when the server offers it). */
  protected readonly photosAvailable = signal(false);
  protected readonly photos = signal<File[]>([]);
  protected readonly reading = signal(false);
  protected readonly readSummary = signal<FormPhotoRead | null>(null);
  /** Starting answers for the renderer; replaced when photos are read. */
  protected readonly prefill = signal<Record<string, unknown> | null>(null);
  protected readonly review = signal<Record<string, ReviewNote>>({});
  protected readonly header = inject(FormBuilder).group({
    formNo: [''],
    receivedOn: [new Date() as Date | null],
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => clearTimeout(this.adviceTimer));
    this.header.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.onChanged());

    firstValueFrom(this.api.years())
      .then((years) => {
        const cutoff = years.find((y) => y.isCurrent)?.ageCutoffDate;
        this.ageAsOn.set(cutoff ? formatDate(cutoff) : null);
      })
      .catch(() => undefined);

    firstValueFrom(this.api.formPhotosStatus())
      .then((s) => this.photosAvailable.set(s.available))
      .catch(() => undefined);

    Promise.all([firstValueFrom(this.api.admissionForm()), firstValueFrom(this.api.classes())])
      .then(([form, classes]) => {
        this.formName.set(form.name);
        this.classes.set(classes);
        this.schema.set(form.schema);
      })
      .catch((e) =>
        this.loadError.set(
          e instanceof HttpErrorResponse && e.status === 404
            ? 'The admission form has not been published yet. Ask an administrator to publish it.'
            : apiError(e),
        ),
      );
  }

  protected choosePhotos(input: HTMLInputElement) {
    this.photos.set(Array.from(input.files ?? []).slice(0, 8));
    input.value = ''; // choosing the same photos again still fires (change)
  }

  protected photoNames(): string {
    return this.photos()
      .map((f) => f.name)
      .join(', ');
  }

  private static readonly PAGES: Record<string, string> = {
    page1: 'page 1 (class, photographs, student details)',
    page2: 'page 2 (languages, last school, family, guardian)',
    page3: 'page 3 (age limits, undertaking)',
    page4: 'page 4 (declaration, signatures, office use)',
  };

  protected pageNames(pages: string[]): string {
    return pages.map((p) => ApplicationNew.PAGES[p] ?? p).join('; ');
  }

  protected async readPhotos() {
    const renderer = this.renderer();
    if (!renderer || this.reading() || this.photos().length === 0) return;
    this.reading.set(true);
    this.readSummary.set(null);
    try {
      const result = await firstValueFrom(this.api.readFormPhotos(this.photos()));
      // What was read wins over what is on the screen; anything typed that the
      // photos did not cover is kept.
      this.prefill.set({ ...renderer.answers(), ...result.answers });
      this.review.set(result.review);
      const { formNo } = this.header.getRawValue();
      this.header.patchValue({
        ...(!formNo?.trim() && result.header.formNo ? { formNo: result.header.formNo } : {}),
        ...(result.header.receivedOn ? { receivedOn: fromIsoDate(result.header.receivedOn) } : {}),
      });
      this.readSummary.set(result);
      this.onChanged();
    } catch (error) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not read the photos',
        detail: apiError(error),
      });
    } finally {
      this.reading.set(false);
    }
  }

  /** Re-checks the child's age a moment after the last change. */
  protected onChanged() {
    clearTimeout(this.adviceTimer);
    this.adviceTimer = setTimeout(() => void this.checkAge(), 400);
  }

  private async checkAge() {
    const renderer = this.renderer();
    const schema = this.schema();
    if (!renderer || !schema) return;

    const fields = schema.sections.flatMap((s) => s.fields);
    const answers = renderer.answers();
    const classId = answers[fields.find((f) => f.system === 'student.class')?.id ?? ''];
    const dateOfBirth = answers[fields.find((f) => f.system === 'student.dateOfBirth')?.id ?? ''];
    if (typeof classId !== 'string' || typeof dateOfBirth !== 'string') {
      this.advice.set(null);
      return;
    }

    const run = ++this.adviceRun;
    const receivedOn = this.header.getRawValue().receivedOn;
    try {
      const result = await firstValueFrom(
        this.api.eligibility({
          classId,
          dateOfBirth,
          ...(receivedOn ? { receivedOn: toIsoDate(receivedOn) } : {}),
        }),
      );
      if (run === this.adviceRun) this.advice.set(result); // ignore answers that arrive late
    } catch {
      if (run === this.adviceRun) this.advice.set(null);
    }
  }

  protected async save() {
    const renderer = this.renderer();
    if (!renderer || this.saving()) return;

    this.errors.set({});
    this.summary.set(null);
    renderer.touchAll();
    if (!renderer.isValid()) {
      this.summary.set('Some answers need attention. They are marked above.');
      return;
    }

    const { formNo, receivedOn } = this.header.getRawValue();
    this.saving.set(true);
    try {
      const created = await firstValueFrom(
        this.api.createApplication({
          ...(formNo?.trim() ? { formNo: formNo.trim() } : {}),
          ...(receivedOn ? { receivedOn: toIsoDate(receivedOn) } : {}),
          answers: renderer.answers(),
        }),
      );
      this.toast.add({
        severity: 'success',
        summary: 'Application saved',
        detail: `Form number ${created.formNo}`,
      });
      await this.router.navigate(['/app/admissions', created.id]);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 400 && error.error?.errors) {
        this.errors.set(error.error.errors as AnswerErrors);
        this.summary.set('Some answers were not accepted. They are marked above.');
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        this.errors.set({ formNo: apiError(error) });
      } else {
        this.toast.add({ severity: 'error', summary: 'Could not save', detail: apiError(error) });
      }
    } finally {
      this.saving.set(false);
    }
  }
}
