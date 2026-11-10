import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FilterBar, FilterField, FilterValues } from './filter-bar';

@Component({
  imports: [FilterBar],
  template: `<app-filter-bar [fields]="fields()" (changed)="seen.push($event)" />`,
})
class Host {
  readonly fields = signal<FilterField[]>([
    { key: 'search', label: 'Search', type: 'search' },
    {
      key: 'classId',
      label: 'Class',
      type: 'select',
      options: [
        { label: 'Std 1', value: 'c1' },
        { label: 'Std 2', value: 'c2' },
      ],
    },
    {
      key: 'divisionId',
      label: 'Division',
      type: 'select',
      dependsOn: 'classId',
      options: [{ label: 'A', value: 'd1' }],
    },
    { key: 'from', label: 'From', type: 'date' },
  ]);
  readonly seen: FilterValues[] = [];
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const select = (label: string) =>
    el.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement & HTMLInputElement;
  const change = async (control: HTMLElement, value: string, event = 'change') => {
    (control as HTMLInputElement).value = value;
    control.dispatchEvent(new Event(event, { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, el, select, change, host: fixture.componentInstance };
}

describe('FilterBar', () => {
  it('emits only the filters that are set, as each is chosen', async () => {
    const { select, change, host } = setup();
    await change(select('Class'), 'c1');
    expect(host.seen.at(-1)).toEqual({ classId: 'c1' });
    await change(select('From'), '2026-11-01');
    expect(host.seen.at(-1)).toEqual({ classId: 'c1', from: '2026-11-01' });
    await change(select('Class'), '');
    expect(host.seen.at(-1)).toEqual({ from: '2026-11-01' });
  });

  it('waits for a pause in typing before searching', async () => {
    vi.useFakeTimers();
    try {
      const { select, change, host } = setup();
      const box = select('Search');
      await change(box, 'no', 'input');
      await change(box, 'noor', 'input');
      expect(host.seen.length).toBe(0);
      vi.advanceTimersByTime(300);
      expect(host.seen).toEqual([{ search: 'noor' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears a dependent filter when the one it depends on changes', async () => {
    const { select, change, host } = setup();
    await change(select('Class'), 'c1');
    await change(select('Division'), 'd1');
    expect(host.seen.at(-1)).toEqual({ classId: 'c1', divisionId: 'd1' });
    await change(select('Class'), 'c2');
    expect(host.seen.at(-1)).toEqual({ classId: 'c2' });
  });

  it('counts the active filters and clears them all with one button', async () => {
    const { fixture, el, select, change, host } = setup();
    expect(el.textContent).not.toContain('Clear filters');
    await change(select('Class'), 'c1');
    await change(select('From'), '2026-11-01');
    expect(el.textContent).toContain('Clear filters (2)');
    const clear = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear filters'),
    ) as HTMLButtonElement;
    clear.click();
    fixture.detectChanges();
    expect(host.seen.at(-1)).toEqual({});
    expect(el.textContent).not.toContain('Clear filters');
  });

  it('drops a value whose field has gone away', async () => {
    const { fixture, select, change, host } = setup();
    await change(select('Class'), 'c1');
    host.fields.update((f) => f.filter((x) => x.key !== 'classId'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.seen.at(-1)).toEqual({});
  });
});
