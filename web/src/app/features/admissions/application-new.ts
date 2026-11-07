import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
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
import { AnswerErrors, FormSchema, SchoolClass } from '../../core/models';
import { toIsoDate } from '../../shared/dates';
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
          class="mb-8 grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2"
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

        <app-form-renderer [schema]="s" [classes]="classes()" [errors]="errors()" />

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
  protected readonly header = inject(FormBuilder).group({
    formNo: [''],
    receivedOn: [new Date() as Date | null],
  });

  constructor() {
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
