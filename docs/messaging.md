# Messaging: API contract

Messages between a student's family and the student's teachers. Built in `api/src/modules/messaging`. The
mobile app and the web app both code against this page. Paths are shown as `/api/messages...`; `/api/v1/messages...`
is the same API (see T9 in the plan). A mobile client sends `Authorization: Bearer <token>` and `X-Client: mobile`.

## Rules in one place

- **One conversation is one student plus one teacher** about one subject. A new subject is a new conversation.
- **The family side** is any login that sees the student as family: the student's own login (`students.userId`) or a
  linked guardian login. The mobile app uses student logins only; guardian logins work through the same rule.
  **The teacher side** is `teacherUserId`.
- **Who may start**
  - A family login: with the student's **class teacher or a subject teacher of the student's division in the current
    academic year**, who must be a current staff member with an active login.
  - A teacher: with a **student of a division they teach this year** (class teacher or subject teacher).
- **The scope is checked at start and on every send.** When it no longer holds (the teacher's assignment was removed, the
  teacher left, the year changed, the student left or is not in a class this year) or the conversation is `CLOSED`, the
  conversation is **read only**: `canReply: false` and `readOnlyReason` says why. History stays readable.
- **Administrators** (`messages.read_all`: Super Admin and School Admin) list and open every conversation, **read only**,
  and can **close** one with a reason. Each time an administrator opens a conversation they are not part of, the audit
  log gets `messages.conversation_viewed`. They cannot send.
- Anyone who is neither a participant nor an administrator gets **404** for a conversation or one of its files.
  Starting with someone you are not allowed to write to is **403**; naming a student who is not yours is **404**.
- **Text is plain** (never HTML), 1 to 2,000 characters; the subject is up to 120. Messages are append-only: no edit, no
  delete. Nothing is hard-deleted.
- **Attachments:** up to 3 files per message (PDF, JPEG, PNG or WebP, 10 MB each). Upload first with
  `POST /api/files` (multipart, `purpose=message-attachment`), then pass the returned ids as `fileIds`. Photos are
  re-encoded and PDFs are checked by the file module. Only your own, not yet attached, uploads can be attached. A file is
  downloaded only through `GET /api/messages/:id/files/:fileId` (participants and administrators); the generic
  `GET /api/files/:id` refuses this purpose.
- **Quiet hours** (school settings, India time; see below). A family message to a teacher in quiet hours is stored and the
  teacher's inbox notification is written at once, but it carries `pushAt` (the end of quiet hours) so a push channel
  waits. The send response carries `deliveredQuietly: true`; the app should say "The teacher will see this in school
  hours." Messages to families never use quiet hours.
- **Rate limit:** 30 sends an hour per user (starting a conversation counts as a send). The 31st gets **429**.
- **Safety line:** show `The school can read messages for safety.` (the detail response carries it as `safetyNotice`).
- **Notifications:** a new conversation or message writes one notification for the other side. `type` is
  `message.received`; the title is generic and never contains the message text: `New message from <teacher name>`
  (to a family) or `New message about <student first name>` (to a teacher). `link` is `/portal/messages/<id>` for a
  family and `/app/messages/<id>` for a teacher. Closing a conversation sends `message.closed` to both sides.
- **Audit:** `messages.conversation_started`, `messages.conversation_closed`, `messages.conversation_viewed`. Message
  bodies are never copied into audit details.

## Permissions

| Permission | Roles | Meaning |
|---|---|---|
| `messages.use` | Student, Parent, Teacher | Take part: list own conversations, start, send, read, contacts, upload attachments |
| `messages.read_all` | Super Admin, School Admin | Read every conversation (`?all=true`), open any, close |

(The Super Admin role holds every permission, so it also holds `messages.use`; it can send only where it is a
participant.) The scope rules above are checked in the service, not by the permission.

## Shapes

```jsonc
// Conversation (a row in the inbox; also inside the detail and send responses)
{
  "id": "uuid",
  "subject": "Question about homework",
  "status": "OPEN",                       // OPEN | CLOSED
  "myRole": "family",                     // family | teacher | admin (admin = reading only)
  "createdAt": "2026-11-14T14:25:43.484Z",
  "lastMessageAt": "2026-11-14T14:25:43.494Z",
  "closedAt": null,                       // ISO time when CLOSED
  "closeReason": null,                    // text when CLOSED
  "student": { "id": "uuid", "name": "Diya Iyer", "className": "Nursery", "divisionName": "A", "photoFileId": null },
  "teacher": { "userId": "uuid", "name": "Farzana Sultana", "subjects": ["English", "EVS"], "isClassTeacher": true },
  "lastMessage": { "bodyPreview": "first 120 characters...", "senderIsMe": true, "createdAt": "..." },   // null if none
  "unreadCount": 0,                       // messages from the other side after I last read (0 for admin views)
  "canReply": true,                       // false for admin, closed, or scope lost
  "readOnlyReason": null                  // string when canReply is false
}

// Message
{
  "id": "uuid",
  "body": "plain text",
  "createdAt": "2026-11-14T14:25:43.494Z",
  "senderIsMe": true,
  "sender": { "userId": "uuid", "name": "Diya Iyer", "side": "family" },        // side: family | teacher
  "files": [ { "id": "uuid", "name": "page4.png", "mimeType": "image/png", "sizeBytes": 2048 } ]
}

// Page (as the other lists)
{ "items": [ ... ], "total": 12, "page": 1, "pageSize": 20 }
```

`readOnlyReason` values: `This conversation was closed by the school.` / `There is no current academic year.` /
`This student is no longer at the school.` / `This student is not in a class this year.` /
`This teacher no longer teaches this student's class.` / for administrators
`Administrators can read conversations but not reply.`

## Endpoints

All need a signed-in session. Errors use the usual `{ "message", "error", "statusCode" }` body.

### `GET /api/messages` : my conversations

Query: `page` (1), `pageSize` (20, max 100), `unread=true` (only conversations with unread messages), `q` (searches
subject, student name and teacher name; words are all required), `classId`, `divisionId`, `teacherUserId`, `from`,
`to` (days, `2026-11-14`, compared to the last message in India time), and `all=true` (administrators only, otherwise
403): every conversation in the school, newest first, `unreadCount` 0.

Response: a Page of **Conversation**. Without `all`, unread conversations come first, then the most recent. People
without `messages.use` or `messages.read_all` get 403. Only conversations the caller takes part in are returned
(an administrator's own list is usually empty).

### `GET /api/messages/unread-count`

`messages.use`. `{ "unread": 2, "unreadMessages": 5 }`: conversations with unread messages, and the messages in them.
For the tab badge.

### `GET /api/messages/contacts`

`messages.use`. Query: `as=family|teacher` (default `teacher` when the person teaches a division this year, otherwise
`family`), `q` and `divisionId` (teacher list), `page`, `pageSize`.

Family list (one item per student and teacher, class teacher first):

```json
{ "kind": "family", "total": 3, "page": 1, "pageSize": 3, "items": [
  { "studentId": "uuid", "studentName": "Diya Iyer", "className": "Nursery", "divisionName": "A",
    "teacherUserId": "uuid", "teacherName": "Farzana Sultana", "subjects": ["English", "EVS"], "isClassTeacher": true } ] }
```

Teacher list (students of the divisions the teacher teaches this year, by class, division and name):

```json
{ "kind": "teacher", "total": 28, "page": 1, "pageSize": 20, "items": [
  { "studentId": "uuid", "name": "Diya Iyer", "admissionNo": "DS0002", "className": "Nursery",
    "divisionId": "uuid", "divisionName": "A", "photoFileId": null } ] }
```

### `POST /api/messages` : start

`messages.use`. Body:

```json
{ "studentId": "uuid?", "teacherUserId": "uuid?", "subject": "text, 1 to 120", "body": "text, 1 to 2000", "fileIds": ["uuid"] }
```

- Family login: send `teacherUserId`. `studentId` is taken from the login; it is required (and checked) only when the
  login sees several students.
- Teacher: send `studentId` only.
- Errors: 400 (no student/teacher chosen, a text rule, bad or reused file, more than 3 files), 403 (not that student's
  teacher / not your teacher / not a messages user), 404 (a student that is not yours or does not exist), 429.

Response `201`:

```json
{ "conversation": { ...Conversation }, "message": { ...Message }, "deliveredQuietly": false }
```

### `GET /api/messages/:id` : open

Participants and administrators (everyone else 404). Query: `before=<messageId>` (messages older than that one) and
`limit` (30, max 100). Messages come **oldest first within the page, newest last**. The newest page has no `before`.

```json
{ ...Conversation,
  "safetyNotice": "The school can read messages for safety.",
  "messages": [ { ...Message } ],
  "hasMore": true,
  "nextBefore": "uuid of the oldest message in this page, or null" }
```

To page back, call again with `before=<nextBefore>` while `hasMore` is true. Opening does not mark as read: call
`POST /:id/read` once the messages are on screen. An administrator opening a conversation (without `before`) is audited.

### `POST /api/messages/:id/messages` : send

`messages.use`. Body `{ "body": "text", "fileIds": ["uuid"] }`. Response `201`:
`{ "conversation": { ...Conversation }, "message": { ...Message }, "deliveredQuietly": true }`.
Errors: 403 when the conversation is read only (the message is the `readOnlyReason`) or the caller is an administrator,
404 for a non-participant, 400 for text or file problems, 429 over 30 an hour.

### `POST /api/messages/:id/read`

Marks everything up to now as read for the caller (a no-op for an administrator who is not a participant). Response
`200`: `{ "unread": 1, "unreadMessages": 3 }` (the caller's totals, as in `unread-count`).

### `POST /api/messages/:id/close`

`messages.read_all`. Body `{ "reason": "3 to 500 characters" }`. Response `200`: the **Conversation** (now `CLOSED`,
`canReply: false`, `closeReason` set). 400 if already closed or the reason is too short, 404 if it does not exist,
403 for a participant without `messages.read_all`. Both sides get a `message.closed` notification.

### `GET /api/messages/:id/files/:fileId`

A message attachment, for the participants and for administrators with `messages.read_all`; 404 for anyone else or for
a file that is not on this conversation. Images are returned inline, PDFs as a download; responses carry
`X-Content-Type-Options: nosniff` and a sandboxing Content-Security-Policy.

## School settings (quiet hours)

Stored on the school and changed in **Settings, School settings** (`settings.manage`, the Super Admin) or with
`PATCH /api/school`:

| Field | Default | Meaning |
|---|---|---|
| `messageQuietStart` | `"19:00"` | Quiet hours begin (India time, `HH:mm`) |
| `messageQuietEnd` | `"07:00"` | Quiet hours end |
| `messageQuietSundays` | `true` | Sundays are quiet all day |

`GET /api/school` returns them. A family message sent in quiet hours gets `pushAt` = the next time quiet hours end
(after a quiet Sunday, that is Monday at `messageQuietEnd`). `pushAt` is an optional field on the `NewNotification`
passed to `NotificationsService.notify`; the notification store itself does not keep it until the push channel adds
the column.

## Notes for the mobile app

- The family side of a student account is always that student; no student id is needed when starting.
- `photoFileId` on a student is the id of the student's photograph. The generic `/api/files/:id` route may not allow a
  family to open it; show initials when it fails.
- Poll `GET /api/messages/unread-count` for the tab badge (the web app refreshes the inbox every 30 seconds).
- Web routes: staff `/app/messages` and `/app/messages/:id`, portal `/portal/messages` and `/portal/messages/:id`
  (these are the `link` values in notifications).
