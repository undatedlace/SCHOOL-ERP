import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { ADMIN_ROLE_LABEL, IssuedLogin } from '../../core/platform.service';

/** Shows new administrators' temporary passwords, once, with what to tell them. */
@Component({
  selector: 'app-issued-logins-dialog',
  imports: [DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      header="Logins to hand over"
      [visible]="!!logins()"
      (visibleChange)="!$event && closed.emit()"
      [modal]="true"
      [closable]="true"
      [style]="{ width: '34rem', 'max-width': '95vw' }"
    >
      @if (logins(); as list) {
        <p class="mb-4 text-sm">
          These passwords are shown <strong>only once</strong>. Give each person theirs privately.
          They sign in at the school sign-in
          @if (schoolCode()) {
            with the school code <strong class="font-mono">{{ schoolCode() }}</strong>
          }
          and must choose a new password within 2 days.
        </p>
        <ul class="flex flex-col gap-3">
          @for (l of list; track l.email) {
            <li class="rounded-lg border p-3">
              <p class="text-sm font-semibold">
                {{ l.fullName }}
                <span class="font-normal text-muted-foreground"
                  >· {{ roleLabel[l.role] ?? l.role }}</span
                >
              </p>
              <p class="text-sm text-muted-foreground">{{ l.email }}</p>
              <div class="mt-2 flex items-center gap-2">
                <code
                  class="flex-1 rounded-md bg-muted px-3 py-2 text-center font-mono text-lg tracking-wider select-all"
                  >{{ l.temporaryPassword }}</code
                >
                <p-button
                  label="Copy"
                  severity="secondary"
                  size="small"
                  [ariaLabel]="'Copy the password for ' + l.fullName"
                  (onClick)="copy(l)"
                />
              </div>
            </li>
          }
        </ul>
        <div class="mt-5 flex justify-end">
          <p-button label="Done" (onClick)="closed.emit()" />
        </div>
      }
    </p-dialog>
  `,
})
export class IssuedLoginsDialog {
  readonly logins = input<IssuedLogin[] | null>(null);
  readonly schoolCode = input<string | null>(null);
  readonly closed = output<void>();

  protected readonly roleLabel = ADMIN_ROLE_LABEL;
  private readonly toast = inject(MessageService);

  protected async copy(l: IssuedLogin) {
    const code = this.schoolCode();
    const text =
      `Sign in: ${l.email}\nTemporary password: ${l.temporaryPassword}` +
      (code ? `\nSchool code: ${code}` : '');
    try {
      await navigator.clipboard.writeText(text);
      this.toast.add({ severity: 'info', summary: 'Copied' });
    } catch {
      this.toast.add({
        severity: 'warn',
        summary: 'Could not copy',
        detail: 'Select the text and copy it by hand.',
      });
    }
  }
}
