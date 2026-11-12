import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectButtonModule } from '@openng/optimus-ui/selectbutton';

export interface FilterCard<T extends string = string> {
  value: T;
  label: string;
  /** The main figure, for example "₹1,20,000". */
  amount: string;
  /** A line under it, for example "62 students · ₹40,000 to collect". */
  hint?: string;
}

/**
 * A row of cards that also act as a filter (for example Everyone, Boys, Girls): pick one and the
 * page shows only that. It is an Optimus select button laid out as cards, so each card is a
 * toggle that says whether it is pressed, and works from the keyboard.
 */
@Component({
  selector: 'app-filter-cards',
  imports: [FormsModule, SelectButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <p-selectbutton
      class="app-card-select"
      [options]="cards()"
      optionLabel="label"
      optionValue="value"
      [allowEmpty]="false"
      [ngModel]="value()"
      (ngModelChange)="changed.emit($event)"
      [attr.aria-label]="label()"
    >
      <ng-template #item let-card>
        <span class="flex w-full flex-col items-start gap-1 text-left">
          <span class="app-eyebrow">{{ card.label }}</span>
          <span class="text-xl font-bold tracking-tight text-foreground tabular-nums">{{
            card.amount
          }}</span>
          @if (card.hint) {
            <span class="text-xs font-normal text-muted-foreground">{{ card.hint }}</span>
          }
        </span>
      </ng-template>
    </p-selectbutton>
  `,
})
export class FilterCards {
  readonly cards = input.required<FilterCard[]>();
  readonly value = input.required<string>();
  /** What the group filters, for screen readers ("Show fees for boys or girls"). */
  readonly label = input.required<string>();
  readonly changed = output<string>();
}
