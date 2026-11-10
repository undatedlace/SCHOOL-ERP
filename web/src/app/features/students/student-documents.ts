import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { SelectModule } from '@openng/optimus-ui/select';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { DocumentType, StudentDocument } from '../../core/models';
import { formatDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';

const TYPES: { value: DocumentType; label: string }[] = [
  { value: 'BIRTH_CERTIFICATE', label: 'Birth certificate' },
  { value: 'TRANSFER_CERTIFICATE', label: 'Transfer certificate' },
  { value: 'ID_PROOF', label: 'ID proof' },
  { value: 'PREVIOUS_REPORT_CARD', label: 'Previous report card' },
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'OTHER', label: 'Other' },
];
const typeLabel = (t: DocumentType) => TYPES.find((x) => x.value === t)?.label ?? t;
const size = (bytes: number | null) =>
  bytes === null
    ? ''
    : bytes < 1024 * 1024
      ? `${Math.ceil(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Scanned papers on a student's record: a PDF, or a photograph of the paper. Staff only. */
@Component({
  selector: 'app-student-documents',
  imports: [FormsModule, ButtonModule, SelectModule, HasPermission],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-xl border-0 bg-card shadow-sm p-5"
      *appHasPermission="'students.documents.read'"
    >
      <h2 class="mb-1 font-semibold">Documents</h2>
      <p class="mb-3 text-sm text-muted-foreground">
        Scanned papers kept on the record. Only staff can see them.
      </p>

      @if (error()) {
        <p class="mb-3 text-sm text-destructive">{{ error() }}</p>
      }

      @for (d of documents(); track d.id) {
        <div class="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0">
          <div class="min-w-0">
            <a
              class="font-medium app-link"
              [href]="'/api/files/' + d.fileId"
              target="_blank"
              rel="noopener"
              >{{ label(d.type) }}{{ d.title ? ': ' + d.title : '' }}</a
            >
            <div class="text-xs text-muted-foreground">
              {{ d.mimeType === 'application/pdf' ? 'PDF' : 'Picture' }} &middot;
              {{ fileSize(d.sizeBytes) }} &middot; {{ format(d.createdAt) }}
            </div>
          </div>
          <p-button
            *appHasPermission="'students.manage'"
            label="Remove"
            size="small"
            severity="danger"
            [text]="true"
            (onClick)="confirmRemove(d)"
          />
        </div>
      } @empty {
        <p class="text-sm text-muted-foreground">No documents yet.</p>
      }

      <div *appHasPermission="'students.manage'" class="mt-4 flex flex-wrap items-end gap-2">
        <p-select
          [options]="types"
          optionLabel="label"
          optionValue="value"
          [ngModel]="type()"
          (ngModelChange)="type.set($event)"
          aria-label="Kind of document"
          class="w-56"
        />
        <label class="cursor-pointer">
          <input
            type="file"
            class="sr-only"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            [disabled]="busy()"
            (change)="onFile($event)"
            aria-label="Choose a document to upload"
          />
          <span
            class="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
            >{{ busy() ? 'Uploading...' : 'Upload a PDF or picture' }}</span
          >
        </label>
      </div>
    </section>
  `,
})
export class StudentDocuments {
  readonly studentId = input.required<string>();

  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly types = TYPES;
  protected readonly label = typeLabel;
  protected readonly fileSize = size;
  protected readonly format = formatDate;

  protected readonly documents = signal<StudentDocument[]>([]);
  protected readonly type = signal<DocumentType>('BIRTH_CERTIFICATE');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      void this.load(this.studentId());
    });
  }

  private async load(id: string) {
    try {
      this.documents.set(await firstValueFrom(this.api.studentDocuments(id)));
    } catch (error) {
      this.error.set(apiError(error));
    }
  }

  protected async onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const uploaded = await firstValueFrom(this.api.uploadFile(file, 'student-document'));
      await firstValueFrom(
        this.api.addStudentDocument(this.studentId(), { fileId: uploaded.id, type: this.type() }),
      );
      await this.load(this.studentId());
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected confirmRemove(d: StudentDocument) {
    this.confirmation.confirm({
      header: 'Remove document',
      message: `Delete this ${typeLabel(d.type).toLowerCase()}? The file is deleted and cannot be brought back.`,
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await firstValueFrom(this.api.removeStudentDocument(this.studentId(), d.id));
          await this.load(this.studentId());
        } catch (error) {
          this.toast.add({
            severity: 'error',
            summary: 'Could not remove',
            detail: apiError(error),
          });
        }
      },
    });
  }
}
