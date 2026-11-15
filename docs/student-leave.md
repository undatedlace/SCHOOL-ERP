# Student leave ("Report absence"): API contract

A family (a student's own login, or a guardian's login) tells the school a child will be away. The
student's **class teacher** (or a school administrator) approves or refuses. There is no allowance and
no balance. Approved leave **pre-fills "on leave"** in the attendance roster; attendance is never written
automatically.

All paths are under `/api` (and `/api/v1`). Dates are `"YYYY-MM-DD"` (India time). Text is plain.
Nothing is deleted: a request ends as `APPROVED`, `REFUSED` or `WITHDRAWN`.

## Permissions

| Permission | Roles | Meaning |
|---|---|---|
| `student_leave.request` | STUDENT, PARENT | Ask for a student they are family of; withdraw |
| `student_leave.decide` | TEACHER | Decide for students of divisions where they are **class teacher this year** |
| `student_leave.read_all` | SUPER_ADMIN, SCHOOL_ADMIN, OFFICE_STAFF | Read every request |
| `student_leave.decide_all` | SUPER_ADMIN, SCHOOL_ADMIN | Decide any request |

Scope is checked in the service. A request the caller may not see is `404`, never `403`. Someone who
sees the request but may not decide it gets `403`.

## Rules

- Family only: the student must be the caller's own student login, or a child of one of the caller's guardian
  records. Another student is `404`.
- `fromDate` is today or later and no more than 60 days ahead; `toDate` (default `fromDate`) is not before it.
- Both days sit in **one academic year**: the current year, or the next one if it exists.
- Sundays and **school holidays** are not counted. A holiday is a calendar event of kind Holiday for
  everyone, or for the student's class or division (a staff-only holiday does not count). A request that counts
  zero days is `400`.
- `halfDay` only when `fromDate == toDate`; it counts 0.5.
- No overlap with the same student's `PENDING` or `APPROVED` request (`409`).
- A family may withdraw a `PENDING` request, or an `APPROVED` one whose `fromDate` is after today.
- A refusal needs a note.

## Shapes

### Request item (`StudentLeave`)

```json
{
  "id": "uuid",
  "student": { "id": "uuid", "name": "Zaid Khan", "className": "Std 1", "divisionName": "A" },
  "fromDate": "2026-11-16",
  "toDate": "2026-11-18",
  "halfDay": false,
  "days": 3,
  "reason": "Fever",
  "status": "PENDING",
  "requestedBy": { "name": "Imran Shaikh" },
  "decidedBy": null,
  "decidedAt": null,
  "decisionNote": null,
  "withdrawnAt": null,
  "createdAt": "2026-11-14T10:00:00.000Z",
  "canWithdraw": true,
  "canDecide": false
}
```

- `status`: `PENDING | APPROVED | REFUSED | WITHDRAWN`.
- `days`: a number (`0.5` for a half day). `className` and `divisionName` are for the **current** year, or `null`.
- `decidedBy` is `{ "name": string | null }` once decided, otherwise `null`.
- `canWithdraw`: the caller is family and the request is `PENDING`, or `APPROVED` and not yet started.
- `canDecide`: the request is `PENDING` and the caller is the class teacher or holds `decide_all`.

### `GET /student-leave`

Query (all optional): `status`, `studentId`, `divisionId` (students in that division this year), `from`
(leave touching this day or later), `to` (touching this day or earlier), `page` (1), `pageSize` (20, max 100).
A family sees its students' requests; a teacher with `decide` sees the divisions where they are class teacher;
`read_all` / `decide_all` see everything. Newest leave first, waiting requests before others.

```json
{
  "items": [ /* StudentLeave */ ],
  "total": 12,
  "page": 1,
  "pageSize": 20,
  "counts": { "PENDING": 2, "APPROVED": 7, "REFUSED": 1, "WITHDRAWN": 2 }
}
```

`counts` follow the other filters but **ignore `status`**, for tabs. `403` if the caller holds none of the four
permissions.

### `GET /student-leave/preview?fromDate&toDate&halfDay&studentId`

Needs `student_leave.request`. `studentId` is optional when the login sees exactly one active student
(several students and no `studentId` is answered in `problem`; `404` if none or not theirs). **Always `200`**
for a request that would be refused (dates, no counted days, outside the academic year, several students, an
overlap): the sentence is in `problem`.

```json
{
  "studentId": "uuid",
  "fromDate": "2026-11-16",
  "toDate": "2026-11-22",
  "halfDay": false,
  "days": 5,
  "countedDates": ["2026-11-16", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"],
  "skipped": [
    { "date": "2026-11-17", "reason": "HOLIDAY" },
    { "date": "2026-11-22", "reason": "SUNDAY" }
  ],
  "problem": null
}
```

When `problem` is set, `days` is 0 and the lists are empty (for example
`"Those days are Sundays or school holidays, so there is nothing to report"`,
`"The first day cannot be in the past"`, `"There is already a request for some of those days"`).

### `POST /student-leave`

Needs `student_leave.request`.

```json
{ "studentId": "uuid (optional if one student)", "fromDate": "2026-11-16", "toDate": "2026-11-18", "halfDay": false, "reason": "Fever" }
```

`reason`: 1 to 500 characters, trimmed. Returns `201` with a `StudentLeave` (`status: "PENDING"`).
`400` invalid dates / no counted days / several students and no `studentId`; `404` not your student; `409` overlap.

### `GET /student-leave/:id`

`200` with a `StudentLeave`, or `404`.

### `POST /student-leave/:id/decision`

```json
{ "approve": true, "note": "optional" }
```

`approve: false` needs a non-empty `note` (`400`). Returns `200` with the updated `StudentLeave`. `404` if not
visible, `403` if visible but the caller is not the class teacher and lacks `decide_all`, `409` if the request
is no longer `PENDING`.

### `POST /student-leave/:id/withdraw`

No body. `200` with the updated `StudentLeave` (`status: "WITHDRAWN"`). `403` if the caller is not family,
`409` if the request is refused, already withdrawn, or approved and already started.

## Attendance roster change

`GET /attendance/divisions/:divisionId?date=YYYY-MM-DD` — each element of `students` gains two fields:

```json
{
  "studentId": "uuid",
  "admissionNo": "hesj0001",
  "name": "Zaid Khan",
  "rollNo": 1,
  "status": null,
  "note": null,
  "approvedLeave": { "requestId": "uuid", "halfDay": false },
  "suggestedStatus": "ON_LEAVE"
}
```

- `approvedLeave`: an `APPROVED` request covering that date (`null` otherwise). Never on a Sunday.
- `suggestedStatus`: `"ON_LEAVE"` only for a student with **no saved mark** that day who has approved leave;
  otherwise `null`. A saved mark always wins (`status` is set and `suggestedStatus` is `null`, though
  `approvedLeave` still shows).
- Nothing is written when the roster is read. The screen pre-selects "Leave"; the teacher's save is the record.

## Notifications

Types and links (the in-app inbox; titles are short and generic):

| When | Who | `type` | Title | Link |
|---|---|---|---|---|
| New request | the class teacher (with a login); if none, everyone with `decide_all` | `student_leave.requested` | `Leave request for <first name>` | `/app/student-leave` |
| Approved | the student's own login and every guardian login | `student_leave.approved` | `Leave approved` | `/portal/absence` |
| Refused | same | `student_leave.refused` | `Leave not approved` | `/portal/absence` |
| Approved leave withdrawn | the class teacher | `student_leave.withdrawn` | `Leave withdrawn for <first name>` | `/app/student-leave` |

## Audit

`student_leave.requested`, `student_leave.decided` (metadata `decision`), `student_leave.withdrawn`
(metadata `wasApproved`); entity type `student_leave_request`.
