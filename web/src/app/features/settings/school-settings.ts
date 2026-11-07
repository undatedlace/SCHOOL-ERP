import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
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
        class="grid max-w-3xl gap-4 rounded-lg border bg-card p-6 sm:grid-cols-2"
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
      });
    });
  }

  protected async save() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    // The API ignores empty optional fields, so only send what has a value.
    const body = Object.fromEntries(
      Object.entries(this.form.getRawValue()).filter(([, v]) => v.trim() !== ''),
    );
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
