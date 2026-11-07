import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { fieldError } from '../form-errors';

/** A label, the projected control, and its validation message. */
@Component({
  selector: 'app-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-1" (focusout)="touched.update((n) => n + 1)">
      <label [attr.for]="for()" class="text-sm font-medium text-foreground"
        >{{ label() }}
        @if (required()) {
          <span class="text-destructive" aria-hidden="true"> *</span>
        }
      </label>
      <ng-content />
      @if (message(); as text) {
        <small class="text-destructive" role="alert">{{ text }}</small>
      } @else if (hint()) {
        <small class="text-muted-foreground">{{ hint() }}</small>
      }
    </div>
  `,
})
export class FormField {
  readonly label = input.required<string>();
  /** The `id` of the input inside, so the label points at it. */
  readonly for = input<string>();
  readonly control = input<AbstractControl | null>(null);
  /** Shows a red asterisk after the label. */
  readonly required = input(false);
  /** Small help text under the control. */
  readonly hint = input<string | null | undefined>(null);
  /** An error from the server, shown instead of the control's own. */
  readonly error = input<string | null>(null);

  /** Bumped on blur, so the message appears without waiting for another event. */
  protected readonly touched = signal(0);

  protected message() {
    this.touched();
    return this.error() ?? fieldError(this.control(), this.label());
  }
}
