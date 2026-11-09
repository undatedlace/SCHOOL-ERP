import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { SelectModule } from '@openng/optimus-ui/select';
import { Api } from '../../core/api';
import { apiError } from '../../core/api-error';
import { AcademicYear, PromotionAction, PromotionPlan, PromotionStatus } from '../../core/models';
import { PageHeader } from '../../shared/ui/page-header';
import {
  ACTIONS,
  Choices,
  choicesFrom,
  counts,
  entries,
  missingDivision,
  targets,
} from './promotion-utils';

@Component({
  selector: 'app-promotion-page',
  imports: [FormsModule, ButtonModule, MessageModule, SelectModule, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Year-end promotion"
      subtitle="Move each class into the next year. Old records are kept; new ones are added."
    />

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>Moving from</span>
        <p-select
          [options]="years()"
          optionLabel="name"
          optionValue="id"
          [ngModel]="fromId()"
          (ngModelChange)="onYears($event, toId())"
          aria-label="Moving from"
          class="w-48"
        />
      </div>
      <div class="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>Moving into</span>
        <p-select
          [options]="years()"
          optionLabel="name"
          optionValue="id"
          [ngModel]="toId()"
          (ngModelChange)="onYears(fromId(), $event)"
          aria-label="Moving into"
          class="w-48"
        />
      </div>
    </div>

    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else if (!fromId() || !toId()) {
      <p-message
        severity="info"
        text="Set up next year in Academic setup first, then choose the two years here."
      />
    } @else if (plan(); as p) {
      <button type="button" class="mb-3 text-sm underline" (click)="back()">
        Back to all classes
      </button>
      <h2 class="mb-1 text-lg font-semibold">
        {{ p.division.class.name }}-{{ p.division.name }}: {{ p.from.name }} into {{ p.to.name }}
      </h2>
      @if (p.nextClass === null) {
        <p class="mb-3 text-sm text-muted-foreground">
          This is the last class, so the suggestion is that students leave the school. You can keep
          anyone back instead.
        </p>
      } @else {
        <p class="mb-3 text-sm text-muted-foreground">
          Students move up to {{ p.nextClass.name }} by default. Change anyone who stays back or is
          leaving. Nothing is saved until you press the button at the bottom.
        </p>
      }
      @if (p.students.length === 0) {
        <p-message severity="info" text="Everyone in this division has already been dealt with." />
      } @else {
        <ul class="divide-y rounded-lg border bg-card">
          @for (s of p.students; track s.studentId) {
            <li class="flex flex-wrap items-center gap-3 p-3">
              <div class="min-w-40 flex-1">
                <div class="font-medium">{{ s.name }}</div>
                <div class="text-xs text-muted-foreground">Admission no. {{ s.admissionNo }}</div>
              </div>
              <p-select
                [options]="actions"
                optionLabel="label"
                optionValue="value"
                [ngModel]="choice(s.studentId).action"
                (ngModelChange)="setAction(p, s.studentId, $event)"
                [attr.aria-label]="'What happens to ' + s.name"
                class="w-44"
              />
              @if (choice(s.studentId).action !== 'LEFT') {
                <p-select
                  [options]="options(p, choice(s.studentId).action)"
                  optionLabel="label"
                  optionValue="id"
                  placeholder="Choose division"
                  [ngModel]="choice(s.studentId).divisionId"
                  (ngModelChange)="setDivision(s.studentId, $event)"
                  [attr.aria-label]="'Division for ' + s.name"
                  class="w-44"
                />
              }
            </li>
          }
        </ul>
        <div
          class="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t bg-background py-3"
        >
          <p-button
            [label]="'Move ' + p.students.length + ' students'"
            [loading]="saving()"
            [disabled]="missing() > 0"
            (onClick)="confirmRun(p)"
          />
          <span class="text-sm text-muted-foreground">
            {{ summary().PROMOTE }} move up, {{ summary().REPEAT }} stay, {{ summary().LEFT }}
            leave.
            @if (missing() > 0) {
              Choose a division for {{ missing() }} more.
            }
          </span>
        </div>
      }
    } @else if (status(); as st) {
      @if (st.divisions.length === 0) {
        <p-message
          severity="info"
          text="No students were enrolled in the year you are moving from."
        />
      } @else {
        <ul class="divide-y rounded-lg border bg-card">
          @for (d of st.divisions; track d.id) {
            <li class="flex flex-wrap items-center gap-3 p-3">
              <div class="min-w-40 flex-1 font-medium">{{ d.class.name }}-{{ d.name }}</div>
              <div class="text-sm text-muted-foreground">
                @if (d.remaining === 0) {
                  All {{ d.total }} dealt with
                } @else {
                  {{ d.done }} of {{ d.total }} dealt with
                }
              </div>
              <p-button
                [label]="d.remaining === 0 ? 'Done' : 'Open'"
                size="small"
                [outlined]="true"
                [disabled]="d.remaining === 0"
                (onClick)="open(d.id)"
              />
            </li>
          }
        </ul>
      }
    } @else {
      <p class="text-muted-foreground">Loading...</p>
    }
  `,
})
export class PromotionPage {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly actions = ACTIONS;
  protected readonly years = signal<AcademicYear[]>([]);
  protected readonly fromId = signal<string | null>(null);
  protected readonly toId = signal<string | null>(null);
  protected readonly status = signal<PromotionStatus | null>(null);
  protected readonly plan = signal<PromotionPlan | null>(null);
  protected readonly choices = signal<Choices>({});
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly missing = computed(() => {
    const p = this.plan();
    return p ? missingDivision(p, this.choices()) : 0;
  });
  protected readonly summary = computed(() => {
    const p = this.plan();
    return p ? counts(p, this.choices()) : { PROMOTE: 0, REPEAT: 0, LEFT: 0 };
  });

  constructor() {
    void this.start();
  }

  private async start() {
    try {
      const years = (await firstValueFrom(this.api.years())).sort((a, b) =>
        a.startDate.localeCompare(b.startDate),
      );
      this.years.set(years);
      const current = years.find((y) => y.isCurrent) ?? years[years.length - 1];
      const next = current ? years.find((y) => y.startDate > current.startDate) : undefined;
      if (current && next) {
        this.fromId.set(current.id);
        this.toId.set(next.id);
        await this.loadStatus();
      }
    } catch (error) {
      this.error.set(apiError(error));
    }
  }

  protected options(plan: PromotionPlan, action: PromotionAction) {
    return targets(plan, action).map((d) => ({
      id: d.id,
      label: `${action === 'PROMOTE' ? plan.nextClass?.name : plan.division.class.name}-${d.name}`,
    }));
  }
  protected choice(id: string) {
    return this.choices()[id] ?? { action: 'PROMOTE' as PromotionAction, divisionId: null };
  }

  protected onYears(from: string | null, to: string | null) {
    this.fromId.set(from);
    this.toId.set(to);
    this.plan.set(null);
    this.status.set(null);
    this.error.set(null);
    if (from && to) void this.loadStatus();
  }

  protected setAction(plan: PromotionPlan, id: string, action: PromotionAction) {
    // Keep the division only if it is still a valid place for the new action.
    const keep = targets(plan, action).some((d) => d.id === this.choice(id).divisionId);
    const same = action === 'REPEAT' ? plan.division.id : null;
    this.choices.update((c) => ({
      ...c,
      [id]: { action, divisionId: keep ? this.choice(id).divisionId : same },
    }));
  }
  protected setDivision(id: string, divisionId: string) {
    this.choices.update((c) => ({ ...c, [id]: { ...this.choice(id), divisionId } }));
  }

  protected back() {
    this.plan.set(null);
    void this.loadStatus();
  }

  protected async open(divisionId: string) {
    try {
      const plan = await firstValueFrom(
        this.api.promotionPlan(this.fromId()!, this.toId()!, divisionId),
      );
      this.plan.set(plan);
      this.choices.set(choicesFrom(plan));
    } catch (error) {
      this.error.set(apiError(error));
    }
  }

  protected confirmRun(plan: PromotionPlan) {
    const n = this.summary();
    this.confirmation.confirm({
      header: 'Move these students',
      message: `Move ${plan.students.length} students of ${plan.division.class.name}-${plan.division.name} into ${plan.to.name}? ${n.PROMOTE} move up, ${n.REPEAT} stay in the class and ${n.LEFT} leave the school (their login is switched off). Old records are kept.`,
      acceptLabel: 'Move them',
      rejectLabel: 'Cancel',
      accept: () => void this.run(plan),
    });
  }

  private async run(plan: PromotionPlan) {
    this.saving.set(true);
    try {
      const r = await firstValueFrom(
        this.api.runPromotion({
          fromAcademicYearId: plan.from.id,
          toAcademicYearId: plan.to.id,
          divisionId: plan.division.id,
          entries: entries(plan, this.choices()),
        }),
      );
      this.toast.add({
        severity: r.skipped.length ? 'warn' : 'success',
        summary: 'Done',
        detail: `${r.promoted} moved up, ${r.repeated} stayed, ${r.left} left${
          r.skipped.length ? `, ${r.skipped.length} skipped` : ''
        }.`,
      });
      this.plan.set(null);
      await this.loadStatus();
    } catch (error) {
      this.toast.add({ severity: 'error', summary: 'Could not move', detail: apiError(error) });
    } finally {
      this.saving.set(false);
    }
  }

  private async loadStatus() {
    const from = this.fromId();
    const to = this.toId();
    if (!from || !to) return;
    try {
      this.status.set(await firstValueFrom(this.api.promotionStatus(from, to)));
    } catch (error) {
      this.error.set(apiError(error));
    }
  }
}
