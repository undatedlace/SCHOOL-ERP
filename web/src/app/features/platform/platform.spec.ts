import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { PlatformSchoolRow, suggestSchoolCode } from '../../core/platform.service';
import { Login } from '../auth/login';
import { PlatformSchoolsPage } from './schools-page';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      MessageService,
      ConfirmationService,
    ],
  });
  return TestBed.inject(HttpTestingController);
}

const row = (over: Partial<PlatformSchoolRow> = {}): PlatformSchoolRow => ({
  id: 's1',
  name: 'Heera English School',
  code: 'heera',
  status: 'ACTIVE',
  createdAt: '2026-11-01T00:00:00Z',
  isHome: true,
  students: 185,
  staff: 14,
  logins: 30,
  ...over,
});

describe('suggestSchoolCode', () => {
  it('makes the same code the server would', () => {
    expect(suggestSchoolCode('Heera English School')).toBe('heera-english-school');
    expect(suggestSchoolCode(' St. Mary’s (Andheri) ')).toBe('st-mary-s-andheri');
  });
});

describe('PlatformSchoolsPage', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('school-code');
    } catch {
      // ignore
    }
  });

  it('lists schools with counts, marks the home school and a paused one', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(PlatformSchoolsPage);
    fixture.detectChanges();
    http.expectOne('/api/platform/schools').flush([
      row(),
      row({
        id: 's2',
        name: 'Second School',
        code: 'second',
        isHome: false,
        status: 'SUSPENDED',
        students: 15,
      }),
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Heera English School');
    expect(text).toContain('Home school');
    expect(text).toContain('Paused');
    expect(text).toContain('200'); // students across schools
  });
});

describe('Login school code', () => {
  it('offers a school code only when there is more than one school', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(Login);
    // The banner is not on this page in the test, so ask for the app info here.
    const info = TestBed.inject((await import('../../shared/ui/env-banner')).AppInfoService);
    info.load();
    fixture.detectChanges();
    http
      .expectOne('/api/app-info')
      .flush({ environmentLabel: null, feedbackUrl: null, schoolCodeOffered: true });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#school-code')).toBeNull();
    const ask = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('another school'),
    ) as HTMLButtonElement;
    ask.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#school-code')).not.toBeNull();
  });

  it('sends the code with the sign-in', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const cmp = fixture.componentInstance as unknown as {
      codeOpen: { set(v: boolean): void };
      form: { setValue(v: object): void };
      submit(): Promise<void>;
    };
    cmp.codeOpen.set(true);
    cmp.form.setValue({ identifier: 'trustee@x.in', password: 'pw', schoolCode: ' HESJ ' });
    void cmp.submit();
    const req = http.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({
      identifier: 'trustee@x.in',
      password: 'pw',
      schoolCode: 'hesj',
    });
  });
});
