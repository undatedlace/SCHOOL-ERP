import { httpResource } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from '@openng/optimus-ui/button';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageService } from '@openng/optimus-ui/api';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { School } from '../../core/models';
import { FormField } from '../../shared/ui/form-field';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'app-school-settings',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, FormField, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="School settings"
      subtitle="Shown on receipts, report cards and the portal."
    />

    @if (school.error()) {
      <p class="text-destructive">Could not load the school profile.</p>
    } @else {
      <form
        [formGroup]="form"
        (ngSubmit)="save()"
        class="grid max-w-3xl gap-4 rounded-xl border-0 bg-card shadow-sm p-6 sm:grid-cols-2"
        novalidate
      >
        <app-form-field
          class="sm:col-span-2"
          label="School name"
          for="name"
          [control]="form.controls.name"
        >
          <input pInputText id="name" formControlName="name" [fluid]="true" />
        </app-form-field>
        <app-form-field
          class="sm:col-span-2"
          label="Address"
          for="address"
          [control]="form.controls.address"
        >
          <input pInputText id="address" formControlName="address" [fluid]="true" />
        </app-form-field>
        <app-form-field label="Phone" for="phone" [control]="form.controls.phone">
          <input pInputText id="phone" formControlName="phone" inputmode="tel" [fluid]="true" />
        </app-form-field>
        <app-form-field label="Email" for="email" [control]="form.controls.email">
          <input pInputText id="email" formControlName="email" type="email" [fluid]="true" />
        </app-form-field>
        <app-form-field label="Board" for="board" [control]="form.controls.board">
          <input
            pInputText
            id="board"
            formControlName="board"
            placeholder="For example CBSE"
            [fluid]="true"
          />
        </app-form-field>
        <fieldset class="grid gap-4 border-t pt-4 sm:col-span-2 sm:grid-cols-2">
          <legend class="mb-1 text-sm font-semibold">Student IDs and e-mail</legend>
          <p class="text-sm text-muted-foreground sm:col-span-2">
            Each student gets an ID made of a short prefix and a number, and signs in with it. When
            the school has its own e-mail domain, the student's e-mail is the ID at that domain.
            Only students admitted after a change get the new style; IDs already given never change.
          </p>
          <app-form-field
            label="ID prefix"
            for="studentIdPrefix"
            hint="Letters and digits, starting with a letter. Leave empty for plain numbers."
            [control]="form.controls.studentIdPrefix"
          >
            <input
              pInputText
              id="studentIdPrefix"
              formControlName="studentIdPrefix"
              placeholder="For example hesj"
              [fluid]="true"
            />
          </app-form-field>
          <app-form-field
            label="Digits in the number"
            for="studentIdDigits"
            [control]="form.controls.studentIdDigits"
          >
            <input
              pInputText
              id="studentIdDigits"
              formControlName="studentIdDigits"
              inputmode="numeric"
              [fluid]="true"
            />
          </app-form-field>
          <app-form-field
            class="sm:col-span-2"
            label="School e-mail domain (optional)"
            for="studentEmailDomain"
            hint="Add it once the school has its own e-mail, for example school.in."
            [control]="form.controls.studentEmailDomain"
          >
            <input
              pInputText
              id="studentEmailDomain"
              formControlName="studentEmailDomain"
              placeholder="school.in"
              [fluid]="true"
            />
          </app-form-field>
          <p class="text-sm sm:col-span-2" aria-live="polite">
            Next students will look like <strong class="font-mono">{{ exampleId() }}</strong>
            @if (exampleEmail(); as mail) {
              and sign in with <strong class="font-mono">{{ mail }}</strong> as well.
            }
          </p>
        </fieldset>
        <div class="sm:col-span-2">
          <p-button
            type="submit"
            label="Save changes"
            [loading]="saving()"
            [disabled]="form.pristine"
          />
        </div>
      </form>
    }
  `,
})
export class SchoolSettings {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly school = httpResource<School>(() => '/api/school');
  protected readonly saving = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    address: ['', Validators.maxLength(300)],
    phone: ['', Validators.pattern(/^(\+?[0-9 -]{7,20})?$/)],
    email: ['', Validators.email],
    board: ['', Validators.maxLength(100)],
    studentIdPrefix: ['', Validators.pattern(/^([a-zA-Z][a-zA-Z0-9]{0,11})?$/)],
    studentIdDigits: ['4', Validators.pattern(/^[2-8]$/)],
    studentEmailDomain: [
      '',
      Validators.pattern(/^(([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})?$/),
    ],
  });

  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  /** What an ID would look like with the current settings (the number part is only an example). */
  protected readonly exampleId = computed(() => {
    const v = this.values();
    const digits = Number(v.studentIdDigits) || 4;
    const prefix = (v.studentIdPrefix ?? '').trim().toLowerCase();
    return prefix ? `${prefix}${'1'.padStart(digits, '0')}` : '1';
  });
  protected readonly exampleEmail = computed(() => {
    const domain = (this.values().studentEmailDomain ?? '').trim().toLowerCase();
    return domain ? `${this.exampleId()}@${domain}` : null;
  });

  constructor() {
    effect(() => {
      const s = this.school.value();
      if (!s) return;
      this.form.reset({
        name: s.name,
        address: s.address ?? '',
        phone: s.phone ?? '',
        email: s.email ?? '',
        board: s.board ?? '',
        studentIdPrefix: s.studentIdPrefix ?? '',
        studentIdDigits: String(s.studentIdDigits ?? 4),
        studentEmailDomain: s.studentEmailDomain ?? '',
      });
    });
  }

  protected async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    // The API ignores empty optional fields, so only send what has a value. The student ID settings are
    // always sent: an empty prefix or domain means "none".
    const { studentIdPrefix, studentIdDigits, studentEmailDomain, ...profile } =
      this.form.getRawValue();
    const body: Record<string, string | number> = {
      ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v.trim() !== '')),
      studentIdPrefix: studentIdPrefix.trim(),
      studentIdDigits: Number(studentIdDigits),
      studentEmailDomain: studentEmailDomain.trim(),
    };
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.updateSchool(body));
      this.toast.add({ severity: 'success', summary: 'School settings saved' });
      this.school.reload();
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: apiError(error) });
    } finally {
      this.saving.set(false);
    }
  }
}
