import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/**
 * An upload box for a scanned paper: a PDF, or a photograph of the page. A form control whose value
 * is the id of the uploaded file (or null). The server checks the file again and keeps it private.
 */
@Component({
  selector: 'app-document-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DocumentUpload), multi: true },
  ],
  template: `
    <div class="flex flex-col items-start gap-2">
      @if (value(); as id) {
        <div
          class="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm"
        >
          <span>Uploaded</span>
          <a
            class="app-link"
            [href]="'/api/files/' + id"
            target="_blank"
            rel="noopener"
            [attr.aria-label]="'Open ' + label()"
            >Open</a
          >
          @if (!disabled()) {
            <button
              type="button"
              class="text-destructive underline-offset-4 hover:underline"
              (click)="remove()"
            >
              Remove
            </button>
          }
        </div>
      }
      @if (!disabled()) {
        <label
          class="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm hover:bg-accent focus-within:ring-2 focus-within:ring-ring"
          [class.opacity-60]="busy()"
        >
          {{ busy() ? 'Uploading...' : value() ? 'Replace file' : 'Choose a PDF or photo' }}
          <input
            type="file"
            class="sr-only"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            [attr.id]="inputId()"
            [attr.aria-label]="label()"
            [disabled]="busy()"
            (change)="onPick($event)"
          />
        </label>
      }
      @if (error()) {
        <small class="text-destructive" role="alert">{{ error() }}</small>
      }
    </div>
  `,
})
export class DocumentUpload implements ControlValueAccessor {
  readonly inputId = input<string | undefined>(undefined);
  readonly label = input('Document');
  readonly purpose = input('staff-document');

  private readonly api = inject(Api);

  protected readonly value = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly disabled = signal(false);

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
    input.value = '';
    if (!file) return;

    this.error.set(null);
    if (!ALLOWED.includes(file.type)) {
      this.error.set('Choose a PDF, or a JPEG, PNG or WebP photograph.');
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      this.error.set('The file must be smaller than 10 MB.');
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
