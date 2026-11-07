import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * A photograph box, like the ones on the paper form. Works as a form control: its
 * value is the id of the uploaded file (or null). Photos are checked again on the server.
 */
@Component({
  selector: 'app-image-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ImageUpload), multi: true },
  ],
  template: `
    <div class="flex flex-col items-start gap-2">
      <label
        class="relative flex h-40 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted/40 text-center text-xs text-muted-foreground transition hover:bg-accent focus-within:ring-2 focus-within:ring-ring"
        [class.opacity-60]="busy() || disabled()"
        [class.cursor-not-allowed]="disabled()"
      >
        @if (src(); as url) {
          <img [src]="url" [alt]="altText()" class="size-full object-cover" />
        } @else if (busy()) {
          <span>Uploading...</span>
        } @else {
          <span class="px-2">Click to add a photograph</span>
        }
        <input
          type="file"
          class="sr-only"
          accept="image/jpeg,image/png,image/webp"
          [attr.id]="inputId()"
          [disabled]="busy() || disabled()"
          (change)="onPick($event)"
        />
      </label>
      <div class="flex gap-3 text-xs">
        @if (value() && !disabled()) {
          <button
            type="button"
            class="text-destructive underline-offset-4 hover:underline"
            (click)="remove()"
          >
            Remove
          </button>
        }
      </div>
      @if (error()) {
        <small class="text-destructive" role="alert">{{ error() }}</small>
      }
    </div>
  `,
})
export class ImageUpload implements ControlValueAccessor {
  readonly inputId = input<string | undefined>(undefined);
  readonly altText = input('Photograph');
  readonly purpose = input('application-photo');

  private readonly api = inject(Api);

  protected readonly value = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly disabled = signal(false);
  /** The browser sends the session cookie with the request, so the image loads like any other. */
  protected readonly src = computed(() => (this.value() ? `/api/files/${this.value()}` : null));

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: unknown): void {
    this.value.set(typeof value === 'string' && value ? value : null);
  }
  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected async onPick(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still triggers a change
    if (!file) return;

    this.error.set(null);
    if (!ALLOWED.includes(file.type)) {
      this.error.set('Choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.error.set('The photograph must be smaller than 5 MB.');
      return;
    }

    this.busy.set(true);
    try {
      const uploaded = await firstValueFrom(this.api.uploadFile(file, this.purpose()));
      this.value.set(uploaded.id);
      this.onChange(uploaded.id);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
      this.onTouched();
    }
  }

  protected remove() {
    this.value.set(null);
    this.error.set(null);
    this.onChange(null);
    this.onTouched();
  }
}
