import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { StaffShell } from './staff-shell';

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
