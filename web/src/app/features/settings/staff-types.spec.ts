import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from '@openng/optimus-ui/api';
import { StaffType } from '../../core/models';
import { StaffTypes } from './staff-types';

const type = (over: Partial<StaffType> = {}): StaffType => ({
  id: 't1',
  name: 'Teacher',
  isTeaching: true,
  active: true,
  staffCount: 12,
  formKey: 'staff-t1',
  ...over,
});

async function setup(rows: StaffType[]) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), MessageService],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(StaffTypes);
  fixture.detectChanges();
  http.expectOne((r) => r.url === '/api/staff-types' && r.params.get('all') === 'true').flush(rows);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as
      HTMLButtonElement | undefined;
  return { fixture, http, el, button };
}

describe('StaffTypes', () => {
  it('lists each type with its staff count and a link to its onboarding form', async () => {
    const { el } = await setup([
      type(),
      type({ id: 't2', name: 'Peon', isTeaching: false, staffCount: 3, formKey: 'staff-t2' }),
    ]);
    expect(el.textContent).toContain('Teacher');
    expect(el.textContent).toContain('12');
    expect(el.textContent).toContain('Peon');
    const link = el.querySelector('a[href="/app/settings/forms/staff-t1"]');
    expect(link?.textContent).toContain('Edit onboarding form');
  });

  it('adds a type', async () => {
    const { fixture, http, button } = await setup([type()]);
    button('Add a staff type')!.click();
    fixture.detectChanges();
    expect(button('Save')!.disabled).toBe(true);
    const name = document.getElementById('st-name') as HTMLInputElement;
    name.value = 'Driver';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    const teaching = document.getElementById('st-teaching') as HTMLInputElement;
    teaching.checked = false;
    fixture.detectChanges();
    button('Save')!.click();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/staff-types');
    expect(req.request.body).toEqual({ name: 'Driver', isTeaching: false });
    req.flush(type({ id: 't3', name: 'Driver' }));
    await fixture.whenStable();
    http
      .expectOne((r) => r.url === '/api/staff-types')
      .flush([type(), type({ id: 't3', name: 'Driver' })]);
    await fixture.whenStable();
  });

  it('says so when a name is already taken', async () => {
    const { fixture, http, button } = await setup([type()]);
    button('Add a staff type')!.click();
    fixture.detectChanges();
    const name = document.getElementById('st-name') as HTMLInputElement;
    name.value = 'Teacher';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    button('Save')!.click();
    http
      .expectOne((r) => r.method === 'POST')
      .flush(
        { message: 'There is already a staff type "Teacher"' },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.body.textContent).toContain('There is already a staff type');
  });

  it('switches a type off and on', async () => {
    const { fixture, http, el } = await setup([type()]);
    (
      Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Switch off',
      ) as HTMLButtonElement
    ).click();
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url === '/api/staff-types/t1');
    expect(req.request.body).toEqual({ active: false });
    req.flush(type({ active: false }));
    await fixture.whenStable();
    http.expectOne((r) => r.url === '/api/staff-types').flush([type({ active: false })]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Switched off');
    expect(el.textContent).toContain('Switch on');
  });
});
