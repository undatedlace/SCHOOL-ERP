import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { StaffType } from '../../core/models';
import { PageHeader } from '../../shared/ui/page-header';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { Badge } from '../../shared/ui/badge';

/** The kinds of employee the school has. Each has its own onboarding form. Types are switched off, never deleted. */
@Component({
  selector: 'app-staff-types',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    PageHeader,
    CheckboxModule,
    InputTextModule,
    Badge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Staff types"
      subtitle="Teacher, clerk, peon and so on. Each type has its own onboarding form and list of documents."
    >
      <p-button label="Add a staff type" (onClick)="openNew()" />
    </app-page-header>

    @if (error()) {
      <p class="mb-3 text-sm text-destructive" role="alert">{{ error() }}</p>
    }

    <div class="overflow-x-auto rounded-xl border-0 bg-card shadow-sm">
      <table class="app-table w-full min-w-[40rem] text-sm">
        <thead>
          <tr class="bg-accent text-left">
            <th scope="col" class="px-4 py-3">Type</th>
            <th scope="col" class="px-4 py-3">Teaches</th>
            <th scope="col" class="px-4 py-3">Staff</th>
            <th scope="col" class="px-4 py-3">Status</th>
            <th scope="col" class="px-4 py-3"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (t of types(); track t.id) {
            <tr class="border-t">
              <th scope="row" class="px-4 py-3 text-left font-medium">{{ t.name }}</th>
              <td class="px-4 py-3">{{ t.isTeaching ? 'Yes' : 'No' }}</td>
              <td class="px-4 py-3">{{ t.staffCount }}</td>
              <td class="px-4 py-3">
                <app-badge
                  [label]="t.active ? 'In use' : 'Switched off'"
                  [severity]="t.active ? 'success' : 'secondary'"
                />
              </td>
              <td class="space-x-3 px-4 py-3 text-right whitespace-nowrap">
                <a class="app-link" [routerLink]="['/app/settings/forms', t.formKey]"
                  >Edit onboarding form</a
                >
                <p-button label="Rename" size="small" [text]="true" (onClick)="openEdit(t)" />
                <p-button
                  [label]="t.active ? 'Switch off' : 'Switch on'"
                  size="small"
                  [text]="true"
                  (onClick)="toggle(t)"
                />
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5" class="p-4 text-center text-muted-foreground">
                {{ loaded() ? 'No staff types yet.' : 'Loading...' }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <p-dialog
      [header]="editing() ? 'Rename staff type' : 'Add a staff type'"
      [visible]="open()"
      (visibleChange)="!$event && open.set(false)"
      [modal]="true"
      [style]="{ width: '28rem', 'max-width': '95vw' }"
    >
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-sm" for="st-name">
          Name
          <input
            id="st-name"
            pInputText
            [fluid]="true"
            maxlength="60"
            placeholder="For example Driver"
            [ngModel]="name()"
            (ngModelChange)="name.set($event)"
          />
        </label>
        <div class="flex items-start gap-2 text-sm">
          <p-checkbox
            [binary]="true"
            inputId="st-teaching"
            [ngModel]="teaching()"
            (ngModelChange)="teaching.set($event)"
          />
          <label for="st-teaching">
            This kind of staff teaches
            <span class="block text-muted-foreground"
              >Their onboarding form starts with teaching questions, such as subjects and
              degrees.</span
            >
          </label>
        </div>
        @if (formError()) {
          <p class="text-sm text-destructive" role="alert">{{ formError() }}</p>
        }
        <div class="flex justify-end gap-2">
          <p-button label="Cancel" severity="secondary" (onClick)="open.set(false)" />
          <p-button
            label="Save"
            [disabled]="name().trim().length < 2"
            [loading]="saving()"
            (onClick)="save()"
          />
        </div>
      </div>
    </p-dialog>
  `,
})
export class StaffTypes {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly types = signal<StaffType[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly open = signal(false);
  protected readonly editing = signal<StaffType | null>(null);
  protected readonly name = signal('');
  protected readonly teaching = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.types.set(await firstValueFrom(this.api.staffTypes(true)));
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.loaded.set(true);
    }
  }

  protected openNew() {
    this.editing.set(null);
    this.name.set('');
    this.teaching.set(false);
    this.formError.set(null);
    this.open.set(true);
  }

  protected openEdit(t: StaffType) {
    this.editing.set(t);
    this.name.set(t.name);
    this.teaching.set(t.isTeaching);
    this.formError.set(null);
    this.open.set(true);
  }

  protected async save() {
    if (this.saving()) return;
    this.saving.set(true);
    this.formError.set(null);
    const body = { name: this.name().trim(), isTeaching: this.teaching() };
    try {
      const t = this.editing();
      await firstValueFrom(
        t ? this.api.updateStaffType(t.id, body) : this.api.createStaffType(body),
      );
      this.open.set(false);
      this.toast.add({ severity: 'success', summary: t ? 'Saved' : 'Staff type added' });
      await this.load();
    } catch (error) {
      this.formError.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggle(t: StaffType) {
    try {
      await firstValueFrom(this.api.updateStaffType(t.id, { active: !t.active }));
      await this.load();
    } catch (error) {
      this.error.set(apiError(error));
    }
  }
}
