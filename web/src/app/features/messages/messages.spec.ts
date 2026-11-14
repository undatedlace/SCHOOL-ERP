import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from '@openng/optimus-ui/api';
import { NAV_ENTRIES, visibleEntries } from '../../core/nav';
import { MessageThread } from './message-thread';
import { ChatMessage, Conversation, ConversationDetail } from './messages-api';

const row = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'c1',
  subject: 'About homework',
  status: 'OPEN',
  myRole: 'family',
  createdAt: '2026-11-14T08:00:00Z',
  lastMessageAt: '2026-11-14T08:05:00Z',
  closedAt: null,
  closeReason: null,
  student: {
    id: 's1',
    name: 'Noor Khan',
    className: 'Std 1',
    divisionName: 'A',
    photoFileId: null,
  },
  teacher: { userId: 't1', name: 'Asha Rao', subjects: ['Maths'], isClassTeacher: false },
  lastMessage: null,
  unreadCount: 0,
  canReply: true,
  readOnlyReason: null,
  ...over,
});
const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  body: 'Hello <b>teacher</b>',
  createdAt: '2026-11-14T08:00:00Z',
  senderIsMe: true,
  sender: { userId: 'u1', name: 'Noor Khan', side: 'family' },
  files: [],
  ...over,
});
const detail = (over: Partial<ConversationDetail> = {}): ConversationDetail => ({
  ...row(),
  safetyNotice: 'The school can read messages for safety.',
  messages: [msg()],
  hasMore: false,
  nextBefore: null,
  ...over,
});

function render(d: ConversationDetail) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), MessageService],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(MessageThread);
  fixture.componentRef.setInput('conversationId', d.id);
  fixture.detectChanges();
  http.expectOne((r) => r.url === `/api/messages/${d.id}`).flush(d);
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}
const settle = async (f: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  await f.whenStable();
  await new Promise((r) => setTimeout(r));
  f.detectChanges();
};

describe('message thread', () => {
  it('shows messages as plain text, the safety line and a reply box', async () => {
    const { fixture, el } = render(
      detail({
        messages: [
          msg(),
          msg({
            id: 'm2',
            senderIsMe: false,
            sender: { userId: 't1', name: 'Asha Rao', side: 'teacher' },
            body: 'Please see page 4',
            files: [{ id: 'f1', name: 'page4.png', mimeType: 'image/png', sizeBytes: 2048 }],
          }),
        ],
      }),
    );
    await settle(fixture);
    // Shown exactly as written, never as HTML.
    expect(el.textContent).toContain('Hello <b>teacher</b>');
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toContain('The school can read messages for safety.');
    expect(el.querySelector('textarea[aria-label="Your message"]')).not.toBeNull();
    // Attachments go through the messaging route.
    const link = el.querySelector('a[href="/api/messages/c1/files/f1"]');
    expect(link?.textContent).toContain('page4.png');
    expect(el.textContent).toContain('Asha Rao');
  });

  it('marks an unread conversation as read when it is opened', async () => {
    const { fixture, http } = render(detail({ unreadCount: 2 }));
    await settle(fixture);
    http.expectOne('/api/messages/c1/read').flush({ unread: 0 });
  });

  it('shows a read-only banner and no reply box when it cannot be replied to', async () => {
    const { fixture, el } = render(
      detail({
        canReply: false,
        readOnlyReason: "This teacher no longer teaches this student's class.",
      }),
    );
    await settle(fixture);
    expect(el.textContent).toContain('This conversation is read only.');
    expect(el.textContent).toContain('no longer teaches');
    expect(el.querySelector('textarea[aria-label="Your message"]')).toBeNull();
  });

  it('sends a reply, and tells a family when the teacher will see it in school hours', async () => {
    const { fixture, http, el } = render(detail());
    await settle(fixture);
    const box = el.querySelector('textarea[aria-label="Your message"]') as HTMLTextAreaElement;
    box.value = 'Thank you';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const send = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Send'),
    ) as HTMLButtonElement;
    send.click();
    const req = http.expectOne('/api/messages/c1/messages');
    expect(req.request.body).toEqual({ body: 'Thank you', fileIds: [] });
    req.flush({
      conversation: row(),
      message: msg({ id: 'm9', body: 'Thank you' }),
      deliveredQuietly: true,
    });
    await settle(fixture);
    expect(el.textContent).toContain('The teacher will see this in school hours.');
    expect(el.textContent).toContain('Thank you');
  });

  it('lets an administrator close with a reason, and never offers a reply box', async () => {
    const { fixture, http, el } = render(
      detail({
        myRole: 'admin',
        canReply: false,
        readOnlyReason: 'Administrators can read conversations but not reply.',
      }),
    );
    await settle(fixture);
    expect(el.querySelector('textarea[aria-label="Your message"]')).toBeNull();
    const closeBtn = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Close',
    ) as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    fixture.detectChanges();
    await settle(fixture);
    const box = document.querySelector('#close-reason') as HTMLTextAreaElement;
    box.value = 'Moved to a meeting';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const confirm = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Close conversation'),
    ) as HTMLButtonElement;
    confirm.click();
    const req = http.expectOne('/api/messages/c1/close');
    expect(req.request.body).toEqual({ reason: 'Moved to a meeting' });
    req.flush(row({ status: 'CLOSED', canReply: false, myRole: 'admin' }));
    await settle(fixture);
    expect(el.textContent).toContain('Closed');
  });
});

describe('Messages in the menu', () => {
  const has =
    (...permissions: string[]) =>
    (p: string) =>
      permissions.includes(p);
  const labels = (...p: string[]) => visibleEntries(NAV_ENTRIES, has(...p)).map((e) => e.label);

  it('is shown to people who can take part or read everything, and to nobody else', () => {
    expect(labels('messages.use')).toContain('Messages');
    expect(labels('messages.read_all')).toContain('Messages');
    expect(labels('notices.read')).not.toContain('Messages');
  });
});
