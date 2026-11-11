import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { ButtonModule } from '@openng/optimus-ui/button';

/**
 * A button that opens the device's file chooser (the browser draws that part itself).
 * Emits the chosen file; the caller uploads it.
 */
@Component({
  selector: 'app-file-picker',
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      #field
      type="file"
      class="hidden"
      tabindex="-1"
      [accept]="accept()"
      [attr.aria-label]="label()"
      (change)="chosen($event)"
    />
    <p-button
      type="button"
      severity="secondary"
      size="small"
      [label]="label()"
      [disabled]="disabled()"
      [loading]="busy()"
      (onClick)="field.click()"
    />
  `,
})
export class FilePicker {
  readonly label = input('Attach a file');
  readonly accept = input('application/pdf,image/jpeg,image/png,image/webp');
  readonly disabled = input(false);
  readonly busy = input(false);
  readonly picked = output<File>();
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected chosen(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so the same file can be chosen again
    if (file) this.picked.emit(file);
  }
}
