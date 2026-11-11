import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
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
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  /** The nth drop-down list on the bar (class, then division). */
  const select = (i: number) => fixture.debugElement.queryAll(By.css('p-select'))[i];
  const date = () => fixture.debugElement.query(By.css('p-datepicker'));
  const searchBox = () => el.querySelector('input[aria-label="Search"]') as HTMLInputElement;
  const pick = async (i: number, value: string | null) => {
    select(i).triggerEventHandler('ngModelChange', value);
    await settle();
  };
  const clearButton = () => fixture.debugElement.query(By.css('p-button'));
  return {
    fixture,
    el,
    select,
    date,
    searchBox,
    pick,
    clearButton,
    settle,
    host: fixture.componentInstance,
  };
}

describe('FilterBar', () => {
  it('draws every filter with Optimus components, not bare browser controls', () => {
    const { el, fixture } = setup();
    expect(fixture.debugElement.queryAll(By.css('p-select')).length).toBe(2);
    expect(fixture.debugElement.queryAll(By.css('p-datepicker')).length).toBe(1);
    expect(el.querySelector('input[aria-label="Search"]')!.classList.contains('p-inputtext')).toBe(
      true,
    );
    expect(el.querySelector('select')).toBeNull();
    expect(el.querySelector('input[type="date"]')).toBeNull();
  });

  it('emits only the filters that are set, as each is chosen', async () => {
    const { pick, date, settle, host } = setup();
    await pick(0, 'c1');
    expect(host.seen.at(-1)).toEqual({ classId: 'c1' });
    date().triggerEventHandler('ngModelChange', new Date(2026, 10, 1));
    await settle();
    expect(host.seen.at(-1)).toEqual({ classId: 'c1', from: '2026-11-01' });
    await pick(0, null);
    expect(host.seen.at(-1)).toEqual({ from: '2026-11-01' });
  });

  it('waits for a pause in typing before searching', async () => {
    vi.useFakeTimers();
    try {
      const { searchBox, host } = setup();
      for (const v of ['no', 'noor']) {
        searchBox().value = v;
        searchBox().dispatchEvent(new Event('input', { bubbles: true }));
      }
      expect(host.seen.length).toBe(0);
      vi.advanceTimersByTime(300);
      expect(host.seen).toEqual([{ search: 'noor' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears a dependent filter when the one it depends on changes', async () => {
    const { pick, host } = setup();
    await pick(0, 'c1');
    await pick(1, 'd1');
    expect(host.seen.at(-1)).toEqual({ classId: 'c1', divisionId: 'd1' });
    await pick(0, 'c2');
    expect(host.seen.at(-1)).toEqual({ classId: 'c2' });
  });

  it('counts the active filters and clears them all with one button', async () => {
    const { el, pick, date, settle, clearButton, host } = setup();
    expect(el.textContent).not.toContain('Clear filters');
    await pick(0, 'c1');
    date().triggerEventHandler('ngModelChange', new Date(2026, 10, 1));
    await settle();
    expect(el.textContent).toContain('Clear filters (2)');
    clearButton().triggerEventHandler('onClick', {});
    await settle();
    expect(host.seen.at(-1)).toEqual({});
    expect(el.textContent).not.toContain('Clear filters');
  });

  it('drops a value whose field has gone away', async () => {
    const { pick, settle, host } = setup();
    await pick(0, 'c1');
    host.fields.update((f) => f.filter((x) => x.key !== 'classId'));
    await settle();
    expect(host.seen.at(-1)).toEqual({});
  });
});
