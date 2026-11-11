import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { CheckboxModule } from '@openng/optimus-ui/checkbox';
import { DialogModule } from '@openng/optimus-ui/dialog';
import { InputNumberModule } from '@openng/optimus-ui/inputnumber';
import { InputTextModule } from '@openng/optimus-ui/inputtext';
import { SelectModule } from '@openng/optimus-ui/select';
import { FormsModule } from '@angular/forms';
import { TagModule } from '@openng/optimus-ui/tag';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AcademicYear, LeaveEntitlementRow, LeaveType, StaffType } from '../../core/models';
import { parseDays } from '../leave/leave-utils';
import { PageHeader } from '../../shared/ui/page-header';

const key = (typeId: string, staffTypeId: string | null) => `${typeId}:${staffTypeId ?? ''}`;

/**
 * Set up before the year starts by the Super Admin or School Admin: the kinds of leave, and how many days
 * of each the year gives (to everyone, with a different number allowed for a type of staff).
 */
@Component({
  selector: 'app-leave-settings',
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TagModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Leave"
      subtitle="The kinds of leave staff can take and how many days a year each gives. Set this up before the year starts."
    />

    @if (error()) {
      <p class="mb-3 text-sm text-destructive" role="alert">{{ error() }}</p>
    }

    <section class="mb-8" aria-labelledby="kinds">
      <div class="mb-3 flex items-center justify-between">
        <h2 id="kinds" class="font-semibold">Kinds of leave</h2>
        <p-button label="Add a kind" size="small" (onClick)="openType(null)" />
      </div>
      <ul class="divide-y rounded-xl bg-card shadow-sm">
        @for (t of types(); track t.id) {
          <li class="flex flex-wrap items-center gap-3 p-3">
            <span class="font-medium">{{ t.name }}</span>
            @if (t.unlimited) {
              <p-tag value="No yearly limit" severity="info" />
            }
            @if (t.carryForwardDays > 0) {
              <p-tag
                [value]="'Carries up to ' + t.carryForwardDays + ' days'"
                severity="secondary"
              />
            }
            @if (!t.active) {
              <p-tag value="Switched off" severity="secondary" />
            }
            <span class="ml-auto space-x-3">
              <button type="button" class="app-link" (click)="openType(t)">Change</button>
              <button type="button" class="app-link" (click)="toggleType(t)">
                {{ t.active ? 'Switch off' : 'Switch on' }}
              </button>
            </span>
          </li>
        } @empty {
          <li class="p-4 text-sm text-muted-foreground">
            No kinds yet. Add the kinds the school gives, for example Casual, Sick and Earned leave.
          </li>
        }
      </ul>
    </section>

    <section aria-labelledby="allowance">
      <div class="mb-3 flex flex-wrap items-end gap-3">
        <h2 id="allowance" class="mr-auto font-semibold">Days a year</h2>
        <div class="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>Academic year</span>
          <p-select
            inputId="ls-year"
            [options]="years()"
            optionLabel="name"
            optionValue="id"
            [ngModel]="yearId() || null"
            (ngModelChange)="pickYear($event)"
            ariaLabel="Academic year"
            appendTo="body"
            styleClass="min-w-44"
          />
        </div>
        <div class="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>Start from another year</span>
          <p-select
            inputId="ls-copy"
            [options]="otherYears()"
            optionLabel="name"
            optionValue="id"
            placeholder="Choose a year"
            [showClear]="true"
            [ngModel]="copyFrom() || null"
            (ngModelChange)="copyFrom.set($event ?? '')"
            ariaLabel="Start from another year"
            appendTo="body"
            styleClass="min-w-44"
          />
        </div>
        <p-button
          label="Copy"
          severity="secondary"
          size="small"
          [disabled]="!copyFrom() || !yearId()"
          (onClick)="copy()"
        />
      </div>

      @if (activeTypes().length === 0) {
        <p class="rounded-xl bg-card p-4 text-sm shadow-sm">Add a kind of leave above first.</p>
      } @else {
        <div class="overflow-x-auto rounded-xl bg-card shadow-sm">
          <table class="w-full min-w-[34rem] text-sm">
            <thead>
              <tr class="bg-accent text-left">
                <th scope="col" class="px-4 py-3">Kind of leave</th>
                <th scope="col" class="px-4 py-3">Everyone</th>
                @for (s of staffTypes(); track s.id) {
                  <th scope="col" class="px-4 py-3">{{ s.name }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (t of activeTypes(); track t.id) {
                <tr class="border-t">
                  <th scope="row" class="px-4 py-2 text-left font-medium">
                    {{ t.name }}
                    @if (t.unlimited) {
                      <span class="block text-xs font-normal text-muted-foreground"
                        >No limit: days are not checked</span
                      >
                    }
                  </th>
                  <td class="px-4 py-2">
                    <input
                      class="h-9 w-20 rounded-md border bg-background px-2"
                      inputmode="decimal"
                      [attr.aria-label]="t.name + ', everyone'"
                      [value]="cell(t.id, null)"
                      (input)="setCell(t.id, null, $any($event.target).value)"
                    />
                  </td>
                  @for (s of staffTypes(); track s.id) {
                    <td class="px-4 py-2">
                      <input
                        class="h-9 w-20 rounded-md border bg-background px-2"
                        inputmode="decimal"
                        placeholder="same"
                        [attr.aria-label]="t.name + ', ' + s.name"
                        [value]="cell(t.id, s.id)"
                        (input)="setCell(t.id, s.id, $any($event.target).value)"
                      />
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          Whole or half days (for example 12 or 7.5). A staff type left as "same" gets the number
          under Everyone. Empty means no days.
        </p>
        @if (gridError()) {
          <p class="mt-2 text-sm text-destructive" role="alert">{{ gridError() }}</p>
        }
        <div class="mt-4">
          <p-button label="Save the allowance" [loading]="saving()" (onClick)="save()" />
        </div>
      }
    </section>

    <p-dialog
      [header]="editing() ? 'Change this kind of leave' : 'Add a kind of leave'"
      [visible]="typeOpen()"
      (visibleChange)="!$event && typeOpen.set(false)"
      [modal]="true"
      [style]="{ width: '28rem', 'max-width': '95vw' }"
    >
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1 text-sm">
          <span id="lt-name-label">Name</span>
          <input
            pInputText
            aria-labelledby="lt-name-label"
            maxlength="60"
            placeholder="For example Casual leave"
            [fluid]="true"
            [value]="typeName()"
            (input)="typeName.set($any($event.target).value)"
          />
        </div>
        <div class="flex items-start gap-2 text-sm">
          <p-checkbox
            [binary]="true"
            ariaLabel="No yearly limit"
            [ngModel]="typeUnlimited()"
            (ngModelChange)="setUnlimited($event)"
          />
          <span
            >No yearly limit<span class="block text-muted-foreground"
              >For example unpaid leave. The days are not checked.</span
            ></span
          >
        </div>
        @if (!typeUnlimited()) {
          <div class="flex flex-col gap-1 text-sm">
            <span id="lt-carry-label">Days that can carry into the next year</span>
            <p-inputnumber
              [min]="0"
              [max]="365"
              [step]="0.5"
              [maxFractionDigits]="1"
              ariaLabelledBy="lt-carry-label"
              [ngModel]="typeCarry()"
              (ngModelChange)="typeCarry.set($event ?? 0)"
              styleClass="w-32"
            />
            <small class="text-muted-foreground"
              >Unused days up to this many move into next year's balance. 0 means none carry
              over.</small
            >
          </div>
        }
        @if (typeError()) {
          <p class="text-sm text-destructive" role="alert">{{ typeError() }}</p>
        }
        <div class="flex justify-end gap-2">
          <p-button label="Cancel" severity="secondary" (onClick)="typeOpen.set(false)" />
          <p-button label="Save" [disabled]="typeName().trim().length < 2" (onClick)="saveType()" />
        </div>
      </div>
    </p-dialog>
  `,
})
export class LeaveSettings {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  protected readonly types = signal<LeaveType[]>([]);
  protected readonly staffTypes = signal<StaffType[]>([]);
  protected readonly years = signal<AcademicYear[]>([]);
  protected readonly yearId = signal('');
  protected readonly copyFrom = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly gridError = signal<string | null>(null);
  protected readonly saving = signal(false);
  /** What is typed in each box, by leave kind and staff type. */
  private readonly grid = signal<Record<string, string>>({});

  protected readonly activeTypes = computed(() => this.types().filter((t) => t.active));
  protected readonly otherYears = computed(() =>
    this.years().filter((y) => y.id !== this.yearId()),
  );

  protected readonly typeOpen = signal(false);
  protected readonly editing = signal<LeaveType | null>(null);
  protected readonly typeName = signal('');
  protected readonly typeUnlimited = signal(false);
  protected readonly typeCarry = signal(0);
  protected readonly typeError = signal<string | null>(null);

  constructor() {
    void this.start();
  }

  private async start() {
    try {
      const [types, staffTypes, years] = await Promise.all([
        firstValueFrom(this.api.leaveTypes(true)),
        firstValueFrom(this.api.staffTypes()),
        firstValueFrom(this.api.years()),
      ]);
      this.types.set(types);
      this.staffTypes.set(staffTypes);
      this.years.set(years);
      const current = years.find((y) => y.isCurrent) ?? years[0];
      if (current) await this.pickYear(current.id);
    } catch (error) {
      this.error.set(apiError(error));
    }
  }

  protected async pickYear(id: string) {
    this.yearId.set(id);
    this.gridError.set(null);
    try {
      const res = await firstValueFrom(this.api.leaveEntitlements(id));
      this.grid.set(
        Object.fromEntries(
          res.items.map((i) => [key(i.leaveTypeId, i.staffTypeId), String(i.days)]),
        ),
      );
    } catch (error) {
      this.error.set(apiError(error));
    }
  }

  protected cell(typeId: string, staffTypeId: string | null) {
    return this.grid()[key(typeId, staffTypeId)] ?? '';
  }

  protected setCell(typeId: string, staffTypeId: string | null, value: string) {
    this.grid.update((g) => ({ ...g, [key(typeId, staffTypeId)]: value }));
  }

  protected async save() {
    this.gridError.set(null);
    const items: LeaveEntitlementRow[] = [];
    for (const [k, text] of Object.entries(this.grid())) {
      if (text.trim() === '') continue;
      const days = parseDays(text);
      if (days === null) {
        this.gridError.set(
          `"${text}" is not a number of days. Use whole or half days, for example 12 or 7.5.`,
        );
        return;
      }
      const [leaveTypeId, staffTypeId] = k.split(':');
      items.push({ leaveTypeId, staffTypeId: staffTypeId || null, days });
    }
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.saveLeaveEntitlements(this.yearId(), items));
      this.toast.add({ severity: 'success', summary: 'Leave allowance saved' });
    } catch (error) {
      this.gridError.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async copy() {
    this.gridError.set(null);
    try {
      await firstValueFrom(this.api.copyLeaveEntitlements(this.copyFrom(), this.yearId()));
      this.toast.add({ severity: 'success', summary: 'Copied' });
      this.copyFrom.set('');
      await this.pickYear(this.yearId());
    } catch (error) {
      this.gridError.set(apiError(error));
    }
  }

  protected setUnlimited(on: boolean) {
    this.typeUnlimited.set(on);
    if (on) this.typeCarry.set(0);
  }

  protected openType(t: LeaveType | null) {
    this.editing.set(t);
    this.typeName.set(t?.name ?? '');
    this.typeUnlimited.set(t?.unlimited ?? false);
    this.typeCarry.set(t?.carryForwardDays ?? 0);
    this.typeError.set(null);
    this.typeOpen.set(true);
  }

  protected async saveType() {
    const t = this.editing();
    const body = {
      name: this.typeName().trim(),
      unlimited: this.typeUnlimited(),
      carryForwardDays: this.typeUnlimited() ? 0 : this.typeCarry(),
    };
    try {
      await firstValueFrom(
        t ? this.api.updateLeaveType(t.id, body) : this.api.createLeaveType(body),
      );
      this.typeOpen.set(false);
      this.types.set(await firstValueFrom(this.api.leaveTypes(true)));
    } catch (error) {
      this.typeError.set(apiError(error));
    }
  }

  protected async toggleType(t: LeaveType) {
    try {
      await firstValueFrom(this.api.updateLeaveType(t.id, { active: !t.active }));
      this.types.set(await firstValueFrom(this.api.leaveTypes(true)));
    } catch (error) {
      this.error.set(apiError(error));
    }
  }
}
