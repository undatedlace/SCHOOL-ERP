import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DatePickerModule } from '@openng/optimus-ui/datepicker';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { TextareaModule } from '@openng/optimus-ui/textarea';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import {
  AnswerErrors,
  ApplicationDetail,
  Decision,
  GuardianInput,
  Relationship,
  SchoolClass,
} from '../../core/models';
import { RELATIONSHIPS } from '../../shared/ui/labels';
import { ageText, formatDate, fromIsoDate, toIsoDate } from '../../shared/dates';
import { AnswerView } from '../../shared/forms/answer-view';
import { FormRenderer } from '../../shared/forms/form-renderer';
import { HasPermission } from '../../shared/has-permission.directive';
import { FormField } from '../../shared/ui/form-field';
import { StatusTag } from '../../shared/ui/status-tag';

const ACTIONS: Record<Decision, { label: string; severity?: 'danger' | 'secondary' | 'success' }> =
  {
    UNDER_REVIEW: { label: 'Start review' },
    GRANTED: { label: 'Grant admission', severity: 'success' },
    REFUSED: { label: 'Refuse', severity: 'danger' },
    WITHDRAWN: { label: 'Mark as withdrawn', severity: 'secondary' },
  };

@Component({
  selector: 'app-application-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TextareaModule,
    AnswerView,
    FormField,
    FormRenderer,
    HasPermission,
    StatusTag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/app/admissions" class="text-sm text-muted-foreground hover:text-foreground"
      >&larr; All applications</a
    >

    @if (error()) {
      <p-message class="mt-4 block" severity="error" [text]="error()!" />
    } @else if (app(); as a) {
      <div class="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-4">
          @if (photoId(a); as photo) {
            <img
              [src]="'/api/files/' + photo"
              [alt]="'Photograph of ' + a.studentName"
              class="h-24 w-20 shrink-0 rounded-lg border object-cover"
            />
          }
          <div>
            <h1 class="text-2xl font-semibold">{{ a.studentName }}</h1>
            <p class="mt-1 text-sm text-muted-foreground">
              Form no. {{ a.formNo }} &middot; Received {{ format(a.receivedOn) }} &middot;
              {{ a.academicYear.name }}
              @if (a.class) {
                &middot; Applied for {{ a.class.name }}
              }
            </p>
            @if (a.dateOfBirth) {
              <p class="text-sm text-muted-foreground">
                Born {{ format(a.dateOfBirth) }} ({{ age(a.dateOfBirth) }} old)
              </p>
            }
          </div>
        </div>
        <app-status-tag [status]="a.status" />
      </div>

      @if (a.eligibility && !a.eligibility.eligible) {
        <div class="mb-6" role="status">
          <p-message severity="warn">
            <div>
              @for (issue of a.eligibility.issues; track issue) {
                <p>{{ issue }}</p>
              }
            </div>
          </p-message>
        </div>
      }

      <div class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <div class="rounded-lg border bg-card p-5">
            <div class="mb-4 flex items-center justify-between gap-2">
              <h2 class="font-semibold">Application</h2>
              @if (a.editable && !editing()) {
                <p-button
                  *appHasPermission="'admissions.manage'"
                  label="Edit"
                  size="small"
                  severity="secondary"
                  (onClick)="startEdit()"
                />
              }
            </div>

            @if (editing()) {
              <div class="mb-6 grid gap-4 sm:grid-cols-2" [formGroup]="header">
                <app-form-field
                  label="Form number"
                  for="formNo"
                  [error]="errors()['formNo'] ?? null"
                >
                  <input pInputText id="formNo" formControlName="formNo" [fluid]="true" />
                </app-form-field>
                <app-form-field label="Date on the form" for="receivedOn">
                  <p-datepicker
                    inputId="receivedOn"
                    formControlName="receivedOn"
                    dateFormat="dd/mm/yy"
                    appendTo="body"
                    [fluid]="true"
                  />
                </app-form-field>
              </div>
              <app-form-renderer
                [schema]="a.form.schema"
                [classes]="classes()"
                [value]="a.answers"
                [errors]="errors()"
              />
              @if (summary()) {
                <p-message class="mb-4 block" severity="error" [text]="summary()!" />
              }
              <div class="flex gap-2">
                <p-button label="Save changes" [loading]="saving()" (onClick)="saveEdit()" />
                <p-button label="Cancel" severity="secondary" (onClick)="cancelEdit()" />
              </div>
            } @else {
              <app-answer-view
                [schema]="a.form.schema"
                [answers]="a.answers"
                [classes]="classes()"
              />
              <p class="mt-4 text-xs text-muted-foreground">
                Filled in on version {{ a.form.version }} of the form.
              </p>
            }
          </div>
        </div>

        <aside class="flex flex-col gap-6 lg:col-span-1">
          <div class="rounded-lg border bg-card p-5">
            <h2 class="mb-3 font-semibold">Decision</h2>
            @if (a.decision.decidedAt) {
              <p class="text-sm">Decided on {{ format(a.decision.decidedAt) }}</p>
            }
            @if (a.decision.grantedClass; as gc) {
              <p class="text-sm">
                Admitted to <strong>{{ gc.name }}</strong>
                @if (a.decision.grantedDivision; as gd) {
                  , division <strong>{{ gd.name }}</strong>
                }
              </p>
            }
            @if (a.decision.note) {
              <p class="mt-2 rounded-md bg-muted p-3 text-sm whitespace-pre-line">
                {{ a.decision.note }}
              </p>
            }
            @if (!a.decision.decidedAt && a.status === 'RECEIVED') {
              <p class="text-sm text-muted-foreground">Not decided yet.</p>
            }
            @if (a.status === 'GRANTED') {
              <p class="mt-3 text-xs text-muted-foreground">
                A granted application is final and can no longer be edited.
              </p>
            }

            <div class="mt-4 flex flex-col gap-2" *appHasPermission="'admissions.manage'">
              @for (d of a.allowedDecisions; track d) {
                <p-button
                  [label]="actionLabel(d, a.status)"
                  [severity]="actions[d].severity ?? null"
                  [outlined]="d !== 'GRANTED'"
                  [fluid]="true"
                  [loading]="deciding()"
                  (onClick)="begin(d)"
                />
              }
            </div>
          </div>
          @if (a.status === 'GRANTED') {
            <div class="rounded-lg border bg-card p-5">
              <h2 class="mb-3 font-semibold">Student record</h2>
              @if (a.studentId) {
                <p class="text-sm">Admitted on {{ format(a.admittedAt!) }}.</p>
                <a
                  *appHasPermission="'students.read_all'"
                  class="mt-3 inline-block text-sm font-medium underline-offset-4 hover:underline"
                  [routerLink]="['/app/students', a.studentId]"
                  >View student</a
                >
              } @else {
                <p class="text-sm text-muted-foreground">
                  Admission is granted. Create the student record to put them in a division.
                </p>
                <ng-container *appHasPermission="'admissions.manage'">
                  <div class="mt-4" *appHasPermission="'students.manage'">
                    <p-button label="Admit as student" [fluid]="true" (onClick)="openAdmit()" />
                  </div>
                </ng-container>
              }
            </div>
          }
        </aside>
      </div>

      <p-dialog
        header="Admit as student"
        [visible]="admitOpen()"
        (visibleChange)="!$event && admitOpen.set(false)"
        [modal]="true"
        [style]="{ width: '46rem', 'max-width': '96vw' }"
      >
        <form [formGroup]="admitForm" (ngSubmit)="admit()" class="flex flex-col gap-5" novalidate>
          <div class="grid gap-4 sm:grid-cols-3">
            <app-form-field
              label="Division"
              for="admitDivision"
              [control]="admitForm.controls.divisionId"
              [required]="true"
              [hint]="a.decision.grantedClass ? 'Class: ' + a.decision.grantedClass.name : null"
            >
              <p-select
                inputId="admitDivision"
                formControlName="divisionId"
                [options]="admitDivisions()"
                optionLabel="name"
                optionValue="id"
                appendTo="body"
                [fluid]="true"
                placeholder="Choose"
              />
            </app-form-field>
            <app-form-field
              label="Admission number"
              for="admitNo"
              hint="Empty = next number"
              [error]="admitFieldError()"
            >
              <input pInputText id="admitNo" formControlName="admissionNo" [fluid]="true" />
            </app-form-field>
            <app-form-field label="Joined on" for="admitJoined">
              <p-datepicker
                inputId="admitJoined"
                formControlName="joinedOn"
                dateFormat="dd/mm/yy"
                appendTo="body"
                [fluid]="true"
              />
            </app-form-field>
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-sm font-semibold">Parents and guardians</h3>
              <p-button
                type="button"
                label="Add another"
                size="small"
                severity="secondary"
                (onClick)="addGuardianRow()"
              />
            </div>
            <p class="mb-3 text-xs text-muted-foreground">
              Taken from the application. Check them and correct anything that is wrong.
            </p>
            @for (row of guardianRows.controls; track row; let i = $index) {
              <div class="mb-3 rounded-md border p-3" [formGroup]="$any(row)">
                <div class="grid gap-3 sm:grid-cols-6">
                  <input
                    pInputText
                    class="sm:col-span-3"
                    formControlName="fullName"
                    placeholder="Full name"
                    [attr.aria-label]="'Guardian ' + (i + 1) + ' name'"
                  />
                  <p-select
                    class="sm:col-span-3"
                    formControlName="relationship"
                    [options]="relationships"
                    optionLabel="label"
                    optionValue="value"
                    appendTo="body"
                    [fluid]="true"
                    [ariaLabel]="'Guardian ' + (i + 1) + ' relationship'"
                  />
                  <input
                    pInputText
                    class="sm:col-span-2"
                    formControlName="mobile"
                    inputmode="tel"
                    placeholder="Mobile"
                    [attr.aria-label]="'Guardian ' + (i + 1) + ' mobile'"
                  />
                  <input
                    pInputText
                    class="sm:col-span-2"
                    formControlName="email"
                    type="email"
                    placeholder="Email"
                    [attr.aria-label]="'Guardian ' + (i + 1) + ' email'"
                  />
                  <input
                    pInputText
                    class="sm:col-span-2"
                    formControlName="occupation"
                    placeholder="Occupation"
                    [attr.aria-label]="'Guardian ' + (i + 1) + ' occupation'"
                  />
                </div>
                <div class="mt-2 flex items-center justify-between text-sm">
                  <label class="flex items-center gap-2">
                    <input
                      type="radio"
                      name="primaryGuardian"
                      [checked]="primaryIndex() === i"
                      (change)="primaryIndex.set(i)"
                    />
                    Primary contact
                  </label>
                  @if (guardianRows.length > 1) {
                    <button
                      type="button"
                      class="text-destructive underline-offset-4 hover:underline"
                      (click)="removeGuardianRow(i)"
                    >
                      Remove
                    </button>
                  }
                </div>
              </div>
            }
          </div>

          @if (admitError()) {
            <p-message severity="error" [text]="admitError()!" />
          }
          <div class="flex justify-end gap-2">
            <p-button
              type="button"
              label="Cancel"
              severity="secondary"
              (onClick)="admitOpen.set(false)"
            />
            <p-button type="submit" label="Admit student" [loading]="admitting()" />
          </div>
        </form>
      </p-dialog>

      <p-dialog
        [header]="dialogTitle()"
        [visible]="!!pending()"
        (visibleChange)="!$event && pending.set(null)"
        [modal]="true"
        [style]="{ width: '30rem', 'max-width': '95vw' }"
      >
        <form
          [formGroup]="decisionForm"
          (ngSubmit)="confirm()"
          class="flex flex-col gap-4"
          novalidate
        >
          @if (pending() === 'GRANTED') {
            <app-form-field
              label="Admit to class"
              for="grantClass"
              [control]="decisionForm.controls.classId"
              [required]="true"
            >
              <p-select
                inputId="grantClass"
                formControlName="classId"
                [options]="classes()"
                optionLabel="name"
                optionValue="id"
                appendTo="body"
                [fluid]="true"
                (onChange)="
                  chosenClass.set($event.value); decisionForm.controls.divisionId.reset(null)
                "
              />
            </app-form-field>
            <app-form-field
              label="Division"
              for="grantDivision"
              hint="Optional. You can assign the division later."
            >
              <p-select
                inputId="grantDivision"
                formControlName="divisionId"
                [options]="divisions()"
                optionLabel="name"
                optionValue="id"
                appendTo="body"
                [showClear]="true"
                [fluid]="true"
                placeholder="Not assigned yet"
              />
            </app-form-field>
          }
          <app-form-field
            [label]="pending() === 'REFUSED' ? 'Reason' : 'Note (optional)'"
            for="decisionNote"
          >
            <textarea
              pTextarea
              id="decisionNote"
              formControlName="note"
              rows="3"
              [autoResize]="true"
              [fluid]="true"
            ></textarea>
          </app-form-field>
          @if (decisionError()) {
            <p-message severity="error" [text]="decisionError()!" />
          }
          <div class="flex justify-end gap-2">
            <p-button
              type="button"
              label="Cancel"
              severity="secondary"
              (onClick)="pending.set(null)"
            />
            <p-button type="submit" [label]="dialogTitle()" [loading]="deciding()" />
          </div>
        </form>
      </p-dialog>
    } @else {
      <p class="mt-4 text-muted-foreground">Loading...</p>
    }
  `,
})
export class ApplicationPage {
  /** From the route: /app/admissions/:id */
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly fb = inject(FormBuilder);
  private readonly renderer = viewChild(FormRenderer);

  protected readonly actions = ACTIONS;
  protected readonly format = formatDate;
  protected readonly age = (dob: string) => ageText(dob);

  /** The child's photograph, if the form has one and it was filled in. */
  protected photoId(a: ApplicationDetail): string | null {
    const field = a.form.schema.sections
      .flatMap((s) => s.fields)
      .find((f) => f.system === 'student.photo');
    const value = field ? a.answers[field.id] : null;
    return typeof value === 'string' ? value : null;
  }

  protected readonly app = signal<ApplicationDetail | null>(null);
  protected readonly classes = signal<SchoolClass[]>([]);
  protected readonly error = signal<string | null>(null);

  // editing
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly errors = signal<AnswerErrors>({});
  protected readonly summary = signal<string | null>(null);
  protected readonly header = this.fb.group({
    formNo: [''],
    receivedOn: [null as Date | null],
  });

  // deciding
  protected readonly pending = signal<Decision | null>(null);
  protected readonly deciding = signal(false);
  protected readonly decisionError = signal<string | null>(null);
  protected readonly chosenClass = signal<string | null>(null);
  protected readonly decisionForm = this.fb.group({
    classId: [null as string | null],
    divisionId: [null as string | null],
    note: [''],
  });
  protected readonly divisions = computed(
    () => this.classes().find((c) => c.id === this.chosenClass())?.divisions ?? [],
  );
  protected readonly dialogTitle = computed(() => {
    const d = this.pending();
    return d === 'GRANTED'
      ? 'Grant admission'
      : d === 'REFUSED'
        ? 'Refuse application'
        : 'Mark as withdrawn';
  });

  // admitting as a student
  private readonly router = inject(Router);
  protected readonly relationships = RELATIONSHIPS;
  protected readonly admitOpen = signal(false);
  protected readonly admitting = signal(false);
  protected readonly admitError = signal<string | null>(null);
  protected readonly admitFieldError = signal<string | null>(null);
  protected readonly primaryIndex = signal(0);
  protected readonly admitForm = this.fb.group({
    divisionId: ['' as string, Validators.required],
    admissionNo: [''],
    joinedOn: [new Date() as Date | null],
    guardians: new FormArray<ReturnType<ApplicationPage['newGuardianRow']>>([]),
  });
  protected readonly guardianRows = this.admitForm.controls.guardians;
  protected readonly admitDivisions = computed(
    () =>
      this.classes().find((c) => c.id === this.app()?.decision.grantedClass?.id)?.divisions ?? [],
  );

  private newGuardianRow(g?: GuardianInput) {
    return this.fb.nonNullable.group({
      fullName: [g?.fullName ?? '', [Validators.required, Validators.minLength(2)]],
      relationship: [(g?.relationship ?? 'FATHER') as Relationship],
      mobile: [g?.mobile ?? '', Validators.pattern(/^(\+?[0-9]{10,15})?$/)],
      email: [g?.email ?? '', Validators.email],
      occupation: [g?.occupation ?? ''],
    });
  }

  protected addGuardianRow() {
    this.guardianRows.push(this.newGuardianRow());
  }

  protected removeGuardianRow(i: number) {
    this.guardianRows.removeAt(i);
    if (this.primaryIndex() >= this.guardianRows.length) this.primaryIndex.set(0);
  }

  protected openAdmit() {
    const a = this.app();
    if (!a) return;
    this.admitError.set(null);
    this.admitFieldError.set(null);
    this.guardianRows.clear();
    const suggested = a.suggestedGuardians;
    (suggested.length ? suggested : [undefined]).forEach((g) =>
      this.guardianRows.push(this.newGuardianRow(g)),
    );
    this.primaryIndex.set(
      Math.max(
        0,
        suggested.findIndex((g) => g.isPrimary),
      ),
    );
    this.admitForm.patchValue({
      divisionId: a.decision.grantedDivision?.id ?? '',
      admissionNo: '',
      joinedOn: new Date(),
    });
    this.admitOpen.set(true);
  }

  protected async admit() {
    const a = this.app();
    this.admitForm.markAllAsTouched();
    if (!a || this.admitForm.invalid || this.admitting()) {
      this.admitError.set('Choose a division and check the guardians.');
      return;
    }
    const v = this.admitForm.getRawValue();
    const guardians: GuardianInput[] = this.guardianRows.getRawValue().map((g, i) => ({
      fullName: g.fullName.trim(),
      relationship: g.relationship,
      ...(g.mobile.trim() ? { mobile: g.mobile.trim() } : {}),
      ...(g.email.trim() ? { email: g.email.trim() } : {}),
      ...(g.occupation.trim() ? { occupation: g.occupation.trim() } : {}),
      isPrimary: i === this.primaryIndex(),
    }));

    this.admitting.set(true);
    this.admitError.set(null);
    this.admitFieldError.set(null);
    try {
      const result = await firstValueFrom(
        this.api.admitApplication(a.id, {
          divisionId: v.divisionId ?? '',
          ...(v.admissionNo?.trim() ? { admissionNo: v.admissionNo.trim() } : {}),
          ...(v.joinedOn ? { joinedOn: toIsoDate(v.joinedOn) } : {}),
          guardians,
        }),
      );
      this.admitOpen.set(false);
      this.toast.add({
        severity: 'success',
        summary: 'Student admitted',
        detail: `Admission number ${result.admissionNo}`,
      });
      await this.router.navigate(['/app/students', result.studentId]);
    } catch (error) {
      const message = apiError(error);
      if (
        error instanceof HttpErrorResponse &&
        error.status === 409 &&
        /admission number/i.test(message)
      ) {
        this.admitFieldError.set(message);
      } else {
        this.admitError.set(message);
      }
    } finally {
      this.admitting.set(false);
    }
  }

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  protected actionLabel(decision: Decision, status: string): string {
    return decision === 'UNDER_REVIEW' && status !== 'RECEIVED'
      ? 'Reopen for review'
      : ACTIONS[decision].label;
  }

  // ---------- editing ----------

  protected startEdit() {
    const a = this.app();
    if (!a) return;
    this.errors.set({});
    this.summary.set(null);
    this.header.reset({ formNo: a.formNo, receivedOn: fromIsoDate(a.receivedOn) });
    this.editing.set(true);
  }

  protected cancelEdit() {
    this.editing.set(false);
  }

  protected async saveEdit() {
    const renderer = this.renderer();
    const a = this.app();
    if (!renderer || !a || this.saving()) return;

    this.errors.set({});
    this.summary.set(null);
    renderer.touchAll();
    if (!renderer.isValid()) {
      this.summary.set('Some answers need attention. They are marked above.');
      return;
    }
    const { formNo, receivedOn } = this.header.getRawValue();
    this.saving.set(true);
    try {
      const updated = await firstValueFrom(
        this.api.updateApplication(a.id, {
          answers: renderer.answers(),
          ...(formNo?.trim() ? { formNo: formNo.trim() } : {}),
          ...(receivedOn ? { receivedOn: toIsoDate(receivedOn) } : {}),
        }),
      );
      this.app.set(updated);
      this.editing.set(false);
      this.toast.add({ severity: 'success', summary: 'Application updated' });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 400 && error.error?.errors) {
        this.errors.set(error.error.errors as AnswerErrors);
        this.summary.set('Some answers were not accepted. They are marked above.');
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        this.errors.set({ formNo: apiError(error) });
      } else {
        this.toast.add({ severity: 'error', summary: 'Could not save', detail: apiError(error) });
      }
    } finally {
      this.saving.set(false);
    }
  }

  // ---------- deciding ----------

  protected begin(decision: Decision) {
    const a = this.app();
    if (!a) return;
    if (decision === 'UNDER_REVIEW') {
      void this.submit({ decision });
      return;
    }
    this.decisionError.set(null);
    this.chosenClass.set(a.class?.id ?? null);
    this.decisionForm.reset({ classId: a.class?.id ?? null, divisionId: null, note: '' });
    this.pending.set(decision);
  }

  protected async confirm() {
    const decision = this.pending();
    if (!decision || this.deciding()) return;
    const { classId, divisionId, note } = this.decisionForm.getRawValue();

    if (decision === 'GRANTED' && !classId) {
      this.decisionError.set('Choose the class the student is admitted to.');
      return;
    }
    if (decision === 'REFUSED' && !note?.trim()) {
      this.decisionError.set('Please give a reason for refusing.');
      return;
    }
    await this.submit({
      decision,
      ...(note?.trim() ? { note: note.trim() } : {}),
      ...(decision === 'GRANTED' && classId ? { classId } : {}),
      ...(decision === 'GRANTED' && divisionId ? { divisionId } : {}),
    });
  }

  private async submit(body: {
    decision: Decision;
    note?: string;
    classId?: string;
    divisionId?: string;
  }) {
    const a = this.app();
    if (!a) return;
    this.deciding.set(true);
    this.decisionError.set(null);
    try {
      this.app.set(await firstValueFrom(this.api.decideApplication(a.id, body)));
      this.pending.set(null);
      this.toast.add({ severity: 'success', summary: 'Decision saved' });
    } catch (error) {
      if (this.pending()) this.decisionError.set(apiError(error));
      else
        this.toast.add({
          severity: 'error',
          summary: 'Could not save the decision',
          detail: apiError(error),
        });
    } finally {
      this.deciding.set(false);
    }
  }

  private async load(id: string) {
    this.error.set(null);
    this.app.set(null);
    this.editing.set(false);
    try {
      const [app, classes] = await Promise.all([
        firstValueFrom(this.api.application(id)),
        firstValueFrom(this.api.classes()),
      ]);
      this.classes.set(classes);
      this.app.set(app);
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'This application was not found.'
          : apiError(error),
      );
    }
  }
}
