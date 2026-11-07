import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DialogModule } from '@openng/optimus-ui/dialog';

export interface TempPassword {
  name: string;
  password: string;
}

/** Shows a generated temporary password once, with a copy button. */
@Component({
  selector: 'app-temp-password-dialog',
  imports: [DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      header="Temporary password"
      [visible]="!!info()"
      (visibleChange)="!$event && closed.emit()"
      [modal]="true"
      [style]="{ width: '28rem', 'max-width': '95vw' }"
    >
      @if (info(); as t) {
        <p class="mb-3 text-sm">
          Give this password to <strong>{{ t.name }}</strong
          >. It is shown only once, and they must change it when they sign in.
        </p>
        <div
          class="mb-4 rounded-md bg-muted p-3 text-center font-mono text-xl tracking-wider select-all"
        >
          {{ t.password }}
        </div>
        <div class="flex justify-end gap-2">
          <p-button label="Copy" severity="secondary" (onClick)="copy(t.password)" />
          <p-button label="Done" (onClick)="closed.emit()" />
        </div>
      }
    </p-dialog>
  `,
})
export class TempPasswordDialog {
  readonly info = input<TempPassword | null>(null);
  readonly closed = output<void>();

  private readonly toast = inject(MessageService);

  protected async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.add({ severity: 'info', summary: 'Copied' });
    } catch {
      this.toast.add({
        severity: 'warn',
        summary: 'Could not copy',
        detail: 'Select the password and copy it by hand.',
      });
    }
  }
}
