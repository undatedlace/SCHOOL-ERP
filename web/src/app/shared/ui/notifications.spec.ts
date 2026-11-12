import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppNotification } from '../../core/models';
import { NotificationsPage } from '../../features/notifications/notifications-page';
import { NotificationBell } from './notification-bell';
import { timeAgo } from './time-ago';

const note = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1',
  type: 'leave.requested',
  title: 'Asha Rao asked for leave',
  body: 'Casual leave, 2026-11-20',
  link: '/app/leave',
  read: false,
  createdAt: new Date().toISOString(),
  ...over,
});
const page = (items: AppNotification[], unread = items.filter((i) => !i.read).length) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 8,
  unread,
});

function providers() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  return TestBed.inject(HttpTestingController);
}

describe('timeAgo', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  it('speaks in plain words', () => {
    expect(timeAgo('2026-11-11T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-11T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-11-11T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-10T12:00:00Z', now)).toBe('1 day ago');
    expect(timeAgo('2026-11-08T12:00:00Z', now)).toBe('3 days ago');
    expect(timeAgo('2026-10-01T12:00:00Z', now)).toMatch(/1 Oct 2026/);
  });
});

describe('NotificationBell', () => {
  async function setup(unread: number) {
    const http = providers();
    const fixture = TestBed.createComponent(NotificationBell);
    fixture.detectChanges();
    http.expectOne('/api/notifications/unread-count').flush({ unread });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, http, el, button: el.querySelector('button') as HTMLButtonElement };
  }

  it('shows how many are unread, in the label and as a badge, and caps big numbers', async () => {
    const a = await setup(3);
    expect(a.button.getAttribute('aria-label')).toBe('Notifications, 3 unread');
    expect(a.el.textContent).toContain('3');
    TestBed.resetTestingModule();
    const b = await setup(150);
    expect(b.el.textContent).toContain('99+');
    TestBed.resetTestingModule();
    const c = await setup(0);
    expect(c.button.getAttribute('aria-label')).toBe('Notifications');
    expect(c.el.querySelector('[aria-hidden="true"].bg-destructive')).toBeNull();
  });

  it('lists the latest when opened, and opening one marks it read and goes to its page', async () => {
    const { fixture, http, el, button } = await setup(1);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    button.click();
    http
      .expectOne((r) => r.url === '/api/notifications')
      .flush(page([note(), note({ id: 'n2', title: 'Old one', read: true })]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Asha Rao asked for leave');
    expect(el.textContent).toContain('Old one');
    (
      Array.from(el.querySelectorAll('ul button')).find((b) =>
        b.textContent?.includes('Asha Rao'),
      ) as HTMLButtonElement
    ).click();
    http.expectOne('/api/notifications/n1/read').flush({ unread: 0 });
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    expect(navigate).toHaveBeenCalledWith('/app/leave');
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('Notifications');
  });

  it('marks everything read', async () => {
    const { fixture, http, el, button } = await setup(2);
    button.click();
    http.expectOne((r) => r.url === '/api/notifications').flush(page([note(), note({ id: 'n2' })]));
    await fixture.whenStable();
    fixture.detectChanges();
    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Mark all as read'),
      ) as HTMLButtonElement
    ).click();
    http.expectOne('/api/notifications/read-all').flush({ unread: 0 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('Notifications');
    expect(el.textContent).not.toContain('Mark all as read');
  });

  it('says when there is nothing new', async () => {
    const { fixture, http, el, button } = await setup(0);
    button.click();
    http.expectOne((r) => r.url === '/api/notifications').flush(page([]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Nothing new.');
  });
});

describe('NotificationsPage', () => {
  async function setup(items: AppNotification[]) {
    const http = providers();
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/notifications').flush({ ...page(items), pageSize: 20 });
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('lists messages with unread ones marked, and a count on the Unread tab', async () => {
    const { el } = await setup([note(), note({ id: 'n2', title: 'Read one', read: true })]);
    expect(el.textContent).toContain('Asha Rao asked for leave');
    expect(el.textContent).toContain('· unread');
    expect(el.textContent).toContain('Unread (1)');
  });

  it('asks only for unread ones on the Unread tab', async () => {
    const { fixture, http, el } = await setup([note()]);
    (
      Array.from(el.querySelectorAll('[role="group"] [role="button"]')).find((b) =>
        b.textContent?.includes('Unread'),
      ) as HTMLButtonElement
    ).click();
    const req = http.expectOne((r) => r.url === '/api/notifications');
    expect(req.request.params.get('unread')).toBe('true');
    req.flush({ ...page([]), pageSize: 20 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Nothing unread.');
  });

  it('says so when there is nothing at all', async () => {
    const { el } = await setup([]);
    expect(el.textContent).toContain('No notifications yet.');
  });
});
