import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { AuthService } from '../../core/auth.service';
import { Notice, Page } from '../../core/models';
import { NoticeCard } from './notice-card';
import { NoticesPage } from './notices-page';

const notice = (over: Partial<Notice> = {}): Notice => ({
  id: 'n1',
  title: 'Holiday',
  body: 'School is closed on Friday.',
  audience: 'ALL',
  classes: [],
  divisions: [],
  createdBy: { id: 'u1', fullName: 'Asha Rao' },
  createdAt: '2026-11-08T10:00:00.000Z',
  expiresOn: null,
  expired: false,
  canChange: false,
  ...over,
});
const page = (items: Notice[]): Page<Notice> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
});

function signIn(permissions: string[]) {
  const auth = TestBed.inject(AuthService);
  auth.clear();
  auth.me.set({ id: 'u', fullName: 'U', roles: [], permissions, mustChangePassword: false });
}

describe('NoticeCard', () => {
  it('shows the text exactly as written, never as HTML', () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(NoticeCard);
    fixture.componentRef.setInput(
      'notice',
      notice({ body: '<b>bold</b> <img src=x onerror=alert(1)>' }),
    );
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('<b>bold</b>');
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
  });

  it('tells staff who a notice went to, and parents nothing about it', () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(NoticeCard);
    fixture.componentRef.setInput('notice', notice({ audience: 'STAFF' }));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('To:');
    fixture.componentRef.setInput('showAudience', true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('To: Staff only');
  });
});

describe('NoticesPage', () => {
  function setup(permissions: string[]) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MessageService,
        ConfirmationService,
      ],
    });
    signIn(permissions);
    const fixture = TestBed.createComponent(NoticesPage);
    fixture.detectChanges();
    return {
      fixture,
      http: TestBed.inject(HttpTestingController),
      el: fixture.nativeElement as HTMLElement,
    };
  }
  const buttons = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());

  it('a reader sees notices and no way to write or change them', async () => {
    const { fixture, http, el } = setup(['notices.read']);
    http.expectOne((r) => r.url === '/api/notices').flush(page([notice()]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Holiday');
    const all = buttons(el).join('|');
    for (const word of ['New notice', 'Change', 'Remove', 'Ones I can change']) {
      expect(all, word).not.toContain(word);
    }
  });

  it('a writer can change and remove only the notices the server says they may', async () => {
    const { fixture, http, el } = setup(['notices.read', 'notices.create']);
    http
      .expectOne((r) => r.url === '/api/notices')
      .flush(
        page([
          notice({ id: 'a', title: 'Mine', canChange: true }),
          notice({ id: 'b', title: 'Theirs' }),
        ]),
      );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(buttons(el)).toContain('New notice');
    const cards = Array.from(el.querySelectorAll('app-notice-card'));
    const change = (c: Element) =>
      Array.from(c.querySelectorAll('button')).some((b) => b.textContent?.includes('Change'));
    expect(change(cards[0])).toBe(true);
    expect(change(cards[1])).toBe(false);
  });

  it('says so when there are no notices', async () => {
    const { fixture, http, el } = setup(['notices.read']);
    http.expectOne((r) => r.url === '/api/notices').flush(page([]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('There are no notices');
  });
});
