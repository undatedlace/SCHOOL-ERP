import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from '@openng/optimus-ui/api';
import { SchoolSettings } from './school-settings';

const school = {
  id: 's',
  name: 'Hera English School',
  address: null,
  phone: null,
  email: null,
  board: null,
  studentIdPrefix: 'hesj',
  studentIdDigits: 4,
  studentEmailDomain: null,
};

async function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), MessageService],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(SchoolSettings);
  fixture.detectChanges();
  http.expectOne('/api/school').flush(school);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = (id: string) => el.querySelector(`#${id}`) as HTMLInputElement;
  const type = (id: string, value: string) => {
    const i = input(id);
    i.value = value;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  return { fixture, el, http, input, type };
}

describe('SchoolSettings student IDs', () => {
  it('shows the saved convention and an example of the next ID', async () => {
    const { el, input } = await setup();
    expect(input('studentIdPrefix').value).toBe('hesj');
    expect(el.textContent).toContain('hesj0001');
  });

  it('updates the example as the settings change, with the e-mail once a domain is typed', async () => {
    const { el, type } = await setup();
    type('studentIdPrefix', 'HERA');
    type('studentIdDigits', '3');
    expect(el.textContent).toContain('hera001');
    expect(el.textContent).not.toContain('@');
    type('studentEmailDomain', 'School.in');
    expect(el.textContent).toContain('hera001@school.in');
  });

  it('sends the student ID settings even when emptied, so "none" can be saved', async () => {
    const { fixture, http, type, el } = await setup();
    type('studentIdPrefix', '');
    const save = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save changes'),
    ) as HTMLButtonElement;
    save.click();
    fixture.detectChanges();
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url === '/api/school');
    expect(req.request.body).toMatchObject({
      name: 'Hera English School',
      studentIdPrefix: '',
      studentIdDigits: 4,
      studentEmailDomain: '',
    });
    req.flush({ ...school, studentIdPrefix: null });
    await fixture.whenStable();
  });

  it('refuses a prefix that starts with a digit or a bad domain', async () => {
    const { fixture, type, el } = await setup();
    type('studentIdPrefix', '9bad');
    type('studentEmailDomain', 'not a domain');
    const save = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save changes'),
    ) as HTMLButtonElement;
    save.click();
    fixture.detectChanges();
    expect(
      fixture.debugElement.injector.get(HttpTestingController).match('/api/school').length,
    ).toBe(0);
  });
});
