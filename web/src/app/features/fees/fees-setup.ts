import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { DatePickerModule } from '@openng/optimus-ui/datepicker';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { TabsModule } from '@openng/optimus-ui/tabs';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AcademicYear, CopyResult, FeeHead, FeeStructure, SchoolClass } from '../../core/models';
import { formatDate, toIsoDate, fromIsoDate } from '../../shared/dates';
import { HasPermission } from '../../shared/has-permission.directive';
import { inr, isMoney } from '../../shared/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Badge } from '../../shared/ui/badge';

@Component({
  selector: 'app-fees-setup',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TabsModule,
    HasPermission,
    PageHeader,
    Badge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Fee setup"
      [crumbs]="[{ label: 'Dashboard', link: '/app/dashboard' }, { label: 'Fee setup' }]"
      subtitle="What each class pays, and when. Then bill the year's fees to every student."
    >
      <p-button
        *appHasPermission="'fees.structure.manage'"
        label="Copy fees from another year"
        severity="secondary"
        [outlined]="true"
        (onClick)="openCopy()"
      />
      <p-button
        *appHasPermission="'fees.structure.manage'"
        label="Bill this year's fees"
        severity="secondary"
        [loading]="busy()"
        (onClick)="generate()"
      />
    </app-page-header>

    @if (!year()) {
      <p-message severity="warn" text="Set a current academic year first (Academic setup)." />
    } @else {
      <p class="mb-4 text-sm text-muted-foreground">
        Academic year: <strong>{{ year()!.name }}</strong>
      </p>
      <section class="overflow-hidden rounded-xl bg-card shadow-sm">
        <p-tabs value="structures" class="app-card-tabs">
          <p-tablist>
            <p-tab value="structures">Class fees</p-tab>
            <p-tab value="heads">Kinds of fee</p-tab>
          </p-tablist>
          <p-tabpanels>
            <p-tabpanel value="structures">
              <p-table [value]="rows()" [loading]="loading()">
                <ng-template #header>
                  <tr>
                    <th>Class</th>
                    <th>Total</th>
                    <th>Fees</th>
                    <th>Instalments</th>
                    <th><span class="sr-only">Actions</span></th>
                  </tr>
                </ng-template>
                <ng-template #body let-r>
                  <tr>
                    <td class="font-medium">{{ r.cls.name }}</td>
                    <td>
                      @if (r.structure) {
                        {{ money(r.structure.total) }}
                      } @else {
                        <app-badge label="Not set" severity="warn" />
                      }
                    </td>
                    <td class="text-sm text-muted-foreground">
                      @for (i of r.structure?.items ?? []; track i.feeHeadId) {
                        <span class="mr-2">{{ i.feeHead }} {{ money(i.amount) }}</span>
                      }
                    </td>
                    <td class="text-sm text-muted-foreground">
                      @for (i of r.structure?.instalments ?? []; track i.seq) {
                        <span class="mr-2"
                          >{{ i.label }} {{ i.percent }}% by {{ date(i.dueDate) }}</span
                        >
                      }
                    </td>
                    <td class="text-right" *appHasPermission="'fees.structure.manage'">
                      <p-button
                        [label]="r.structure ? 'Edit' : 'Set up'"
                        size="small"
                        [text]="true"
                        (onClick)="openStructure(r.cls, r.structure)"
                      />
                    </td>
                  </tr>
                </ng-template>
                <ng-template #emptymessage>
                  <tr>
                    <td colspan="5" class="p-4 text-center text-muted-foreground">
                      Add classes in Academic setup first.
                    </td>
                  </tr>
                </ng-template>
              </p-table>
            </p-tabpanel>

            <p-tabpanel value="heads">
              <div
                class="mb-3 flex flex-wrap items-end gap-2"
                *appHasPermission="'fees.structure.manage'"
              >
                <input
                  pInputText
                  [formControl]="newHead"
                  placeholder="New kind of fee, for example Tuition"
                  class="w-72"
                  aria-label="Name of the new kind of fee"
                />
                <p-button label="Add" (onClick)="addHead()" [disabled]="newHead.invalid" />
              </div>
              <p-table [value]="heads()">
                <ng-template #header
                  ><tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th><span class="sr-only">Actions</span></th>
                  </tr></ng-template
                >
                <ng-template #body let-h>
                  <tr>
                    <td class="font-medium">{{ h.name }}</td>
                    <td>
                      <app-badge
                        [label]="h.isActive ? 'In use' : 'Switched off'"
                        [severity]="h.isActive ? 'secondary' : 'warn'"
                      />
                    </td>
                    <td class="text-right" *appHasPermission="'fees.structure.manage'">
                      <p-button
                        [label]="h.isActive ? 'Switch off' : 'Switch on'"
                        size="small"
                        [text]="true"
                        (onClick)="toggleHead(h)"
                      />
                    </td>
                  </tr>
                </ng-template>
                <ng-template #emptymessage
                  ><tr>
                    <td colspan="3" class="p-4 text-center text-muted-foreground">
                      No kinds of fee yet. Add Tuition, Exam fee, and so on.
                    </td>
                  </tr></ng-template
                >
              </p-table>
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      </section>
    }

    <p-dialog
      [header]="'Fees for ' + (editingClass()?.name ?? '')"
      [(visible)]="open"
      [modal]="true"
      [style]="{ width: '44rem', 'max-width': '96vw' }"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-5" novalidate>
        <section>
          <h3 class="mb-2 text-sm font-semibold">Fees</h3>
          <div formArrayName="items" class="flex flex-col gap-2">
            @for (item of items.controls; track $index) {
              <div [formGroupName]="$index" class="flex items-start gap-2">
                <p-select
                  formControlName="feeHeadId"
                  [options]="activeHeads()"
                  optionLabel="name"
                  optionValue="id"
                  placeholder="Kind of fee"
                  appendTo="body"
                  class="w-56"
                  [attr.aria-label]="'Kind of fee ' + ($index + 1)"
                />
                <input
                  pInputText
                  formControlName="amount"
                  inputmode="decimal"
                  placeholder="Amount"
                  class="w-36"
                  [attr.aria-label]="'Amount ' + ($index + 1)"
                />
                <p-button
                  type="button"
                  label="Remove"
                  size="small"
                  severity="danger"
                  [text]="true"
                  (onClick)="items.removeAt($index)"
                />
              </div>
            }
          </div>
          <div class="mt-2 flex items-center justify-between">
            <p-button
              type="button"
              label="Add a fee"
              size="small"
              severity="secondary"
              [outlined]="true"
              (onClick)="addItem()"
            />
            <span class="text-sm"
              >Total: <strong>{{ money(totalText()) }}</strong></span
            >
          </div>
        </section>

        <section>
          <h3 class="mb-2 text-sm font-semibold">When it is paid</h3>
          <div formArrayName="instalments" class="flex flex-col gap-2">
            @for (inst of instalments.controls; track $index) {
              <div [formGroupName]="$index" class="flex flex-wrap items-start gap-2">
                <input
                  pInputText
                  formControlName="label"
                  placeholder="Name, for example Term 1"
                  class="w-44"
                  [attr.aria-label]="'Instalment name ' + ($index + 1)"
                />
                <p-datepicker
                  formControlName="dueDate"
                  dateFormat="dd/mm/yy"
                  appendTo="body"
                  placeholder="Due date"
                  [attr.aria-label]="'Due date ' + ($index + 1)"
                />
                <input
                  pInputText
                  formControlName="percent"
                  inputmode="decimal"
                  placeholder="%"
                  class="w-20"
                  [attr.aria-label]="'Percent ' + ($index + 1)"
                />
                <p-button
                  type="button"
                  label="Remove"
                  size="small"
                  severity="danger"
                  [text]="true"
                  (onClick)="instalments.removeAt($index)"
                />
              </div>
            }
          </div>
          <div class="mt-2 flex items-center justify-between">
            <p-button
              type="button"
              label="Add an instalment"
              size="small"
              severity="secondary"
              [outlined]="true"
              (onClick)="addInstalment()"
            />
            <span class="text-sm" [class.text-destructive]="percentTotal() !== 100"
              >Shares add up to <strong>{{ percentTotal() }}%</strong> (must be 100%)</span
            >
          </div>
        </section>

        @if (formError()) {
          <p-message severity="error" [text]="formError()!" />
        }
        <div class="flex justify-end gap-2">
          <p-button type="button" label="Cancel" severity="secondary" (onClick)="open.set(false)" />
          <p-button type="submit" label="Save" [loading]="busy()" />
        </div>
      </form>
    </p-dialog>

    <p-dialog
      header="Copy fees from another year"
      [(visible)]="copyOpen"
      [modal]="true"
      [style]="{ width: '30rem', 'max-width': '95vw' }"
    >
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted-foreground">
          Copies what each class pays, and moves the due dates on by the number of years between the
          two. A class that already has fees for {{ year()?.name }} is left as it is. Nothing is
          billed to students by this.
        </p>
        <p-select
          [options]="otherYears()"
          optionLabel="name"
          optionValue="id"
          placeholder="Copy from..."
          [ngModel]="copyFrom()"
          (ngModelChange)="copyFrom.set($event)"
          aria-label="Copy from"
          appendTo="body"
        />
        @if (copyResult(); as r) {
          <div class="text-sm" role="status">
            <p class="font-medium">
              Copied {{ r.copied.length }} class{{ r.copied.length === 1 ? '' : 'es' }}.
            </p>
            @if (r.copied.length) {
              <p class="text-muted-foreground">{{ r.copied.join(', ') }}</p>
            }
            @if (r.skipped.length) {
              <p class="mt-2 font-medium">Left alone:</p>
              <ul class="list-disc pl-5 text-muted-foreground">
                @for (k of r.skipped; track k.class) {
                  <li>{{ k.class }}: {{ k.reason }}</li>
                }
              </ul>
            }
          </div>
        }
        <div class="flex justify-end gap-2">
          <p-button
            type="button"
            label="Close"
            severity="secondary"
            (onClick)="copyOpen.set(false)"
          />
          <p-button
            label="Copy fees"
            [disabled]="!copyFrom()"
            [loading]="copying()"
            (onClick)="runCopy()"
          />
        </div>
      </div>
    </p-dialog>
  `,
})
export class FeesSetup {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(MessageService);

  protected readonly money = inr;
  protected readonly date = formatDate;

  protected readonly year = signal<AcademicYear | null>(null);
  protected readonly classes = signal<SchoolClass[]>([]);
  protected readonly structures = signal<FeeStructure[]>([]);
  protected readonly heads = signal<FeeHead[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly allYears = signal<AcademicYear[]>([]);
  protected readonly otherYears = computed(() =>
    this.allYears().filter((y) => y.id !== this.year()?.id),
  );
  protected readonly copyOpen = signal(false);
  protected readonly copyFrom = signal<string | null>(null);
  protected readonly copying = signal(false);
  protected readonly copyResult = signal<CopyResult | null>(null);

  protected readonly activeHeads = computed(() => this.heads().filter((h) => h.isActive));
  protected readonly rows = computed(() =>
    this.classes().map((cls) => ({
      cls,
      structure: this.structures().find((s) => s.class.id === cls.id) ?? null,
    })),
  );

  protected readonly newHead = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.maxLength(60),
  ]);

  protected readonly open = signal(false);
  protected readonly editingClass = signal<SchoolClass | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = this.fb.nonNullable.group({
    items: this.fb.array([this.newItem()]),
    instalments: this.fb.array([this.newInstalment()]),
  });
  protected get items() {
    return this.form.controls.items as FormArray;
  }
  protected get instalments() {
    return this.form.controls.instalments as FormArray;
  }
  private readonly formTick = signal(0);

  protected readonly totalText = computed(() => {
    this.formTick();
    let paise = 0;
    for (const c of this.items.controls) {
      const v = String(c.value.amount ?? '').trim();
      if (isMoney(v)) {
        const [w, f = ''] = v.split('.');
        paise += Number(w) * 100 + Number(f.padEnd(2, '0'));
      }
    }
    return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
  });
  protected readonly percentTotal = computed(() => {
    this.formTick();
    const sum = this.instalments.controls.reduce((a, c) => a + (Number(c.value.percent) || 0), 0);
    return Math.round(sum * 100) / 100;
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.formTick.update((n) => n + 1));
    void this.load();
  }

  private newItem() {
    return this.fb.nonNullable.group({
      feeHeadId: ['', Validators.required],
      amount: ['', Validators.required],
    });
  }
  private newInstalment() {
    return this.fb.nonNullable.group({
      label: ['', Validators.required],
      dueDate: [null as Date | null, Validators.required],
      percent: ['', Validators.required],
    });
  }
  protected addItem() {
    this.items.push(this.newItem());
  }
  protected addInstalment() {
    this.instalments.push(this.newInstalment());
  }

  private async load() {
    this.loading.set(true);
    try {
      const [years, classes, heads] = await Promise.all([
        firstValueFrom(this.api.years()),
        firstValueFrom(this.api.classes()),
        firstValueFrom(this.api.feeHeads()),
      ]);
      const current = years.find((y) => y.isCurrent) ?? null;
      this.year.set(current);
      this.allYears.set(years);
      this.classes.set(classes);
      this.heads.set(heads);
      if (current) this.structures.set(await firstValueFrom(this.api.feeStructures(current.id)));
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not load', detail: apiError(error) });
    } finally {
      this.loading.set(false);
    }
  }

  // ---------- kinds of fee ----------

  protected async addHead() {
    if (this.newHead.invalid) return;
    try {
      await firstValueFrom(this.api.createFeeHead({ name: this.newHead.value.trim() }));
      this.newHead.reset('');
      this.heads.set(await firstValueFrom(this.api.feeHeads()));
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not add', detail: apiError(error) });
    }
  }

  protected async toggleHead(h: FeeHead) {
    try {
      await firstValueFrom(this.api.updateFeeHead(h.id, { isActive: !h.isActive }));
      this.heads.set(await firstValueFrom(this.api.feeHeads()));
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not change', detail: apiError(error) });
    }
  }

  // ---------- class fees ----------

  protected openStructure(cls: SchoolClass, s: FeeStructure | null) {
    this.formError.set(null);
    this.editingClass.set(cls);
    this.items.clear();
    this.instalments.clear();
    for (const i of s?.items ?? [{ feeHeadId: '', amount: '' }]) {
      this.items.push(this.newItem());
      this.items
        .at(this.items.length - 1)
        .patchValue({ feeHeadId: i.feeHeadId, amount: i.amount === '' ? '' : String(i.amount) });
    }
    for (const i of s?.instalments ?? [{ label: '', dueDate: '', percent: 100 }]) {
      this.instalments.push(this.newInstalment());
      this.instalments.at(this.instalments.length - 1).patchValue({
        label: i.label,
        dueDate: i.dueDate ? fromIsoDate(i.dueDate) : null,
        percent: String(i.percent),
      });
    }
    this.open.set(true);
  }

  protected async save() {
    const cls = this.editingClass();
    const year = this.year();
    this.form.markAllAsTouched();
    if (!cls || !year || this.busy()) return;
    const raw = this.form.getRawValue();
    if (this.form.invalid) {
      this.formError.set('Fill in every row, or remove the ones you do not need');
      return;
    }
    if (raw.items.some((i: { amount: string }) => !isMoney(i.amount.trim()))) {
      this.formError.set('Each amount must be like 1500 or 1500.50');
      return;
    }
    if (this.percentTotal() !== 100) {
      this.formError.set('The instalment shares must add up to 100%');
      return;
    }
    this.busy.set(true);
    this.formError.set(null);
    try {
      await firstValueFrom(
        this.api.saveFeeStructure({
          academicYearId: year.id,
          classId: cls.id,
          items: raw.items.map((i: { feeHeadId: string; amount: string }) => ({
            feeHeadId: i.feeHeadId,
            amount: i.amount.trim(),
          })),
          instalments: raw.instalments.map(
            (i: { label: string; dueDate: Date | null; percent: string }) => ({
              label: i.label.trim(),
              dueDate: toIsoDate(i.dueDate!),
              percent: Number(i.percent),
            }),
          ),
        }),
      );
      this.open.set(false);
      this.structures.set(await firstValueFrom(this.api.feeStructures(year.id)));
      this.toast.add({ severity: 'success', summary: 'Saved' });
    } catch (error) {
      this.formError.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected openCopy() {
    this.copyResult.set(null);
    // The most recent earlier year is the likely source.
    const year = this.year();
    const earlier = this.otherYears()
      .filter((y) => !year || y.startDate < year.startDate)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    this.copyFrom.set(earlier[0]?.id ?? null);
    this.copyOpen.set(true);
  }

  protected async runCopy() {
    const year = this.year();
    const from = this.copyFrom();
    if (!year || !from || this.copying()) return;
    this.copying.set(true);
    try {
      this.copyResult.set(await firstValueFrom(this.api.copyFeeStructures(from, year.id)));
      this.structures.set(await firstValueFrom(this.api.feeStructures(year.id)));
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not copy', detail: apiError(error) });
    } finally {
      this.copying.set(false);
    }
  }

  protected async generate() {
    const year = this.year();
    if (!year || this.busy()) return;
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.generateInvoices({ academicYearId: year.id }));
      const missing = r.noStructure.map((m) => `${m.className} (${m.students})`).join(', ');
      this.toast.add({
        severity: r.noStructure.length ? 'warn' : 'success',
        summary: `Billed ${r.created} student${r.created === 1 ? '' : 's'}`,
        detail:
          (r.alreadyHad ? `${r.alreadyHad} already had their fees. ` : '') +
          (missing ? `No fees set for: ${missing}.` : ''),
        life: 8000,
      });
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not bill', detail: apiError(error) });
    } finally {
      this.busy.set(false);
    }
  }
}
