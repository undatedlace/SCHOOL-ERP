import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { StaffShell, yearProgress } from './staff-shell';

async function setup(permissions: string[]) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const auth = TestBed.inject(AuthService);
  auth.clear();
  auth.me.set({
    id: 'u',
    fullName: 'Linda Adora',
    roles: ['SCHOOL_ADMIN'],
    permissions,
    mustChangePassword: false,
  });
  const fixture = TestBed.createComponent(StaffShell);
  fixture.detectChanges();
  TestBed.inject(HttpTestingController).expectOne('/api/school').flush({ name: 'Test School' });
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const nav = (el: HTMLElement) => el.querySelector('nav[aria-label="Main"]') as HTMLElement;
const groupButton = (el: HTMLElement, label: string) =>
  Array.from(nav(el).querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as
    HTMLButtonElement | undefined;

describe('StaffShell sidebar', () => {
  it('shows a group as one folded item', async () => {
    const { el } = await setup(['fees.read_all', 'calendar.read']);
    const finance = groupButton(el, 'Finance')!;
    expect(finance).toBeTruthy();
    expect(finance.getAttribute('aria-expanded')).toBe('false');
    expect(nav(el).textContent).not.toContain('Fee dues');
  });

  it('opens and folds a group when it is pressed', async () => {
    const { fixture, el } = await setup(['fees.read_all']);
    const button = () => groupButton(el, 'Finance')!;

    button().click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(nav(el).textContent).toContain('Fee dues');
    expect(nav(el).textContent).toContain('Fee collection');

    button().click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(nav(el).textContent).not.toContain('Fee dues');
  });

  it('leaves out groups the person may not use, and shows their initials', async () => {
    const { el } = await setup(['calendar.read']);
    expect(groupButton(el, 'Finance')).toBeUndefined();
    expect(groupButton(el, 'Settings')).toBeUndefined();
    expect(nav(el).textContent).toContain('Calendar');
    expect(el.textContent).toContain('LA');
  });
});

describe('StaffShell frame', () => {
  it('puts pages under Overview, School office and Administration', async () => {
    const { el } = await setup(['calendar.read', 'students.read', 'settings.manage']);
    const titles = Array.from(nav(el).querySelectorAll('p')).map((p) => p.textContent?.trim());
    expect(titles).toEqual(['Overview', 'School office', 'Administration', 'Account']);
  });

  it('collapses the menu to icons and remembers it on this device', async () => {
    const { fixture, el } = await setup(['calendar.read']);
    const button = el.querySelector('button[aria-label="Collapse the menu"]') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('button[aria-label="Expand the menu"]')).not.toBeNull();
    expect(localStorage.getItem('sidebar-collapsed')).toBe('1');
    (el.querySelector('button[aria-label="Expand the menu"]') as HTMLButtonElement).click();
    expect(localStorage.getItem('sidebar-collapsed')).toBe('0');
  });
});

describe('yearProgress', () => {
  const year = { startDate: '2026-04-01', endDate: '2027-03-31' };

  it('says which month of the year it is and how many days are left', () => {
    const p = yearProgress(year, new Date('2026-11-12T10:00:00'));
    expect(p).toMatchObject({ started: true, month: 8, months: 12, daysLeft: 139 });
    expect(p.share).toBeGreaterThan(0.6);
    expect(p.share).toBeLessThan(0.62);
  });

  it('accepts full timestamps from the API', () => {
    const p = yearProgress(
      { startDate: '2026-04-01T00:00:00.000Z', endDate: '2027-03-31T00:00:00.000Z' },
      new Date('2026-04-01T09:00:00'),
    );
    expect(p).toMatchObject({ started: true, month: 1, daysLeft: 364 });
  });

  it('knows when the year has not started yet', () => {
    const p = yearProgress(year, new Date('2026-02-01T09:00:00'));
    expect(p.started).toBe(false);
    expect(p.share).toBe(0);
  });
});
