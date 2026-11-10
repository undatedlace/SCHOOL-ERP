# Architecture review after the 10 Nov discussion

Status: decisions 1, 2, 3 and 5 confirmed on 10 Nov 2026. Built so far: the small fixes in section 9 and step T1 (roles and temporary-password expiry). Written 10 Nov 2026.
This document turns the discussion with the school into design decisions and a build order. Where it
changes something already in `school-erp-plan.md`, that is stated, and the plan is only changed once the
decisions in section 8 are confirmed.

## 1. The question: a separate "School Staff" role for clerks and peons?

**No new role. Add a "staff type" instead.**

A role answers "what may this person do in the software?". A staff type answers "what kind of employee
is this?". They are different things and mixing them is what makes systems hard to grow.

| | Role (permissions) | Staff type (HR data) |
|---|---|---|
| Examples | Super Admin, School Admin, Accountant, Teacher, Staff | Teacher, Clerk, Peon, Driver, Librarian, Lab assistant |
| Decides | Which screens and actions | Which onboarding form, which documents, which leave rules, how attendance is tracked |
| Set by | Seeded, changed rarely | The school, in a settings screen (no code change) |
| Needs a login? | Yes, by definition | Often not: a peon may never log in |

Consequences:

- A peon is a staff record with type "Peon" and **no login**. Nothing else is needed.
- A clerk who must use the software gets the role that matches the work (`STAFF` for notices only,
  `ACCOUNTANT` for fees, `OFFICE_STAFF` for admissions help). A person can hold several roles.
- Adding "Driver" or "Librarian" next year is a row in a table, not a release.
- The existing `OFFICE_STAFF` role stays available but is not in the school's list of roles. The school's
  five roles map as: Super Admin, School Admin, Teacher (`TEACHER`), Accountant (`ACCOUNTANT`),
  Student/parent (`STUDENT`, `PARENT`), plus `STAFF` for non-teaching employees who log in.

## 2. Role model v2

Roles stay as permission bundles in the database, checked in code as permissions (never by role name).

| Role | Who | Notes |
|---|---|---|
| `SUPER_ADMIN` | Trustees | Everything. Controls who holds power. Never blocked by a missing permission. |
| `SCHOOL_ADMIN` | Principal's office | Runs the school day to day. All operations, **minus** the Super-Admin-only list below. |
| `ACCOUNTANT` | Accounts | Fees only, plus read of student lists. |
| `TEACHER` | Teaching staff | Assigned classes: attendance, homework, results. Sees the student directory. |
| `STAFF` | Other employees with a login | Own profile, leaves, notices, calendar. |
| `PARENT`, `STUDENT` | Families | Own child only, read only. |

**Proposed Super-Admin-only actions** (everything else a School Admin can do):

1. Create, change, disable or remove **admin accounts** (Super Admin and School Admin) and change who holds which role.
2. Change the **school profile and settings** (name, address, logo, academic calendar rules).
3. Read the **audit log**.
4. **Permanent erasure** of a student or staff record (a legal erasure request), which does not exist yet.

Reasoning: the trustees keep control of identity and accountability; the School Admin keeps control of
operations. Two admins cannot lock each other out because the "keep at least one active Super Admin"
guard moves to the Super Admin role.

Both admins can edit the admission form, admit students, onboard staff, mark staff attendance and approve
leave, and use all of Finance (including reversals and concessions, as today).

## 3. What the platform needs underneath (the scalability work)

The discussion adds a lot of features. They fit one architecture if these five building blocks are done once.

### 3.1 One configurable forms engine (not one per module)

Admission already uses a versioned, data-driven form (`form_definitions`). Staff onboarding needs the same
thing, per staff type. Generalise it rather than copying it.

- A form definition gets a **subject**: `ADMISSION`, or `STAFF:<staff type id>`. Later: leave application, transfer certificate.
- Add one field type, **document upload** (PDF or photo, required or optional, with a label such as
  "Aadhaar" or "Teaching degree"). It reuses the file rules already built (type from bytes, cleaning, private download).
- Versioning, preview, publish, locked core fields and server-side validation carry over unchanged.
- A staff record stores its answers against the version it was filled with, exactly like an application.
- Only Super Admin and School Admin may edit any form (permission `forms.manage`, now held by both).

### 3.2 A notification platform, built before any channel

Homework, results, fee reminders, event reminders and the future mobile app all need to "tell someone".
Build one mechanism and let each feature use it.

- An **outbox**: when something happens (`homework.assigned`, `result.published`, `fee.due_reminder`,
  `event.created`), the same database transaction writes a `notifications` row per recipient. Nothing is lost if a
  later step fails, and nothing is sent twice.
- **In-app inbox** first (bell icon with an unread count, which the new top bar already has room for).
- Channels are workers that read the outbox: **push** (for the mobile app), **email**, later **SMS/WhatsApp**.
  They run as background jobs (Redis and BullMQ, added when the first channel needs them).
- Per-user preferences and templates live in tables, so the school can change wording without a release.
- Notices and calendar events keep working as they do; they simply also write to the outbox.

### 3.3 Search and filters as a shared contract

- Every list endpoint accepts the same shape: `page`, `pageSize`, `sort`, and named filters. The web list
  components are built once on top of it (the Optimus data table is already wrapped for this).
- **Global search** is one endpoint, `GET /search?q=`, that asks each module for matches **through that module's
  own permission and scope rules** (a teacher never gets a hit the list screens would hide). Results are grouped:
  students, staff, applications, guardians.
- Start on PostgreSQL (`pg_trgm` and `unaccent` with GIN indexes). That is comfortable to hundreds of thousands
  of rows, which is far beyond one school. Hide it behind a `SearchProvider` interface so a dedicated engine can
  replace it for many schools without touching callers.

### 3.4 Delete means archive, with one controlled way to erase

"Delete the student" is a business word. Students have fees, receipts, attendance and exam history, so a row
that disappears would break money records and yearly counts.

- **Remove** = archive: status `REMOVED`, with who, when and a **required reason**. Hidden from lists by default,
  visible with a filter, **restorable** by an admin. Their login is switched off and sessions ended.
- Records that carry money are never physically deleted.
- **Permanent erasure** is a separate, Super-Admin-only action for a lawful erasure request, which anonymises
  personal fields and keeps the numbers the books need. It is audited. (Check the rules with an adviser; see
  open decision 8.)

### 3.5 A mobile-ready API

The mobile app comes later; the web app should already behave like a client of a stable API.

- Version the API (`/api/v1`) and keep the OpenAPI description as the contract.
- Accept the same session token as a **bearer token** for native clients (already anticipated in the plan), plus a
  `devices` table to register push tokens.
- No screen-specific logic in the API: it returns data, the clients draw it. No HTML or server-rendered fragments.
- Pagination and `If-None-Match` support on list and calendar endpoints keep mobile data use low.

### 3.6 Smaller but real

- **Multi-school ready** stays as it is: `school_id` on every table, resolved from the session. Super Admin is a
  school-level role. A platform owner for many schools is a separate concept for later and lives outside these roles.
- **One authorisation helper** (`can(auth, permission, scope)`) so "assigned to me" rules are not re-implemented per
  module. Today the same idea is written separately in attendance, notices and calendar.
- **Observability**: request ids in every log line, a health endpoint, and error reporting, before real users.
- **Temporary passwords expire** (see 5.2).

## 4. Module changes, by module

### Admission
- Hover problem: names now look like links all the time (**done**).
- Edit the form: Super Admin and School Admin only (already admin-only; extended to both).
- More filters (status, class, date received, gender, age eligible) and global search.

### Students
- The list shows everyone granted and enrolled, filtered by year, class, division, gender, status, fee status.
- Edit details; **remove** (archive with reason, restorable); **move to another division or class within the same
  year** (this changes the enrolment, so the class teacher and attendance follow automatically); year-end
  promotion stays as it is.
- **Visibility change you described**: a teacher sees the whole student list but controls only their assigned
  students. Proposal: everyone with `students.directory` sees a **limited row** (name, class, division, admission
  number, photo). Guardian phone numbers, addresses, documents, fees and attendance details open only for assigned students.
- Worked example for the school's size (Nursery 2x30, Jr KG 2x40, Sr KG 2x40, Std 1 2x60, Std 2 1x30, Std 3 1x30,
  about 360 children): the current design handles this trivially; the loading plan should create these classes and
  divisions in Academic setup first, then import students.

### Staff
- **Staff types** table, each with its own onboarding form and document list (section 3.1).
- Teacher onboarding form: personal details, qualification, subjects, previous experience, documents.
  Non-teaching types: a shorter form and different documents.
- Staff list for the two admins with filters (type, designation, status, joined year) and search.
- Staff attendance stays in the Attendance group; a **staff calendar** shows holidays, events and leaves.

### Leave management (new, needs a decision on the rules)
- Leave types per staff type (casual, sick, earned, unpaid), yearly entitlement per academic year, balances.
- A staff member applies; the School Admin approves or rejects; an approved leave marks attendance as "on leave"
  automatically and appears on the staff calendar; leaves "marked to be taken" are future approved leaves.
- The school's list of holidays for the year lives in the Calendar (kind: holiday) and is used by both.

### Teacher work (new: homework and results)
- **Homework and assignments** return to V1 (dropped on 8 Nov, requested again). To a whole division, to several,
  or to individual students; title, instructions, due date, attachments. Parents see it in the portal and, later, the app.
- **Tests and results**: do not wait for the board's grading scheme. Build a flexible core now: a test (name, type
  such as mock, unit or term, subject, division, maximum marks, date), marks per student, an "absent" mark, then
  **publish** to parents. Grades and the report card are a layer on top once the school gives the scheme.

### Accountant
- Fee structures, collection and dues as built.
- **Fee reminders to the class teacher**: an accountant action "notify class teacher" for chosen students; it writes
  to the outbox (in-app now, email when that channel exists). The class teacher is the teacher assigned to the
  student's division.

### Students and parents (accounts)
- One login per student that the parent can hold (what the school described). Today there is a parent login (mobile)
  and a student login (admission number). Proposal: keep both; the school hands out whichever it wants. See decision 8.5.
- The temporary password must be changed **within 2 days**; after that the login is locked and an admin resets it (5.2).

### Calendar
- As built, plus the staff calendar view and the leave overlay for staff.

### Attendance
- Unchanged ("pretty good for now").

### Academic setup
- Moved above Admissions in the menu (**done**): the order of use is school, year, classes, then admissions.

## 5. Data model additions

New tables (each carries `school_id`):

| Table | Purpose |
|---|---|
| `staff_types` | The school's types of employee, each linked to a form definition |
| `form_definitions.subject` (column) | `ADMISSION` or `STAFF:<id>` |
| `staff_documents` | Uploaded documents against a staff record, linked to the form's document fields |
| `leave_types`, `leave_policies`, `leave_balances`, `leave_requests` | Leave rules, yearly entitlement, balances, applications and decisions |
| `notifications`, `notification_templates`, `notification_preferences` | The outbox and in-app inbox |
| `devices` | Push tokens for the mobile app |
| `homework`, `homework_targets` | An assignment and who it goes to (division or individual) |
| `assessments`, `assessment_marks` | A test and each student's marks |
| `students.removed_at/by/reason`, status `REMOVED` | Archive instead of delete |
| `users.temp_password_expires_at` | Two-day expiry for first passwords |

Rules kept: money in `Decimal(12,2)`, never hard-delete people or money, enrolments never overwritten,
append-only payments, audit of sensitive actions.

### 5.2 Temporary password expiry
A new account or a reset sets `temp_password_expires_at = now + 2 days`. Sign-in with an expired temporary password
is refused with a clear message ("Ask the school office for a new temporary password"). The admin's existing reset
action issues a fresh one. Staff accounts use the same rule (the number of days is a setting).

## 6. Build order (each step ends with something working and tested)

| Step | What | Depends on |
|---|---|---|
| T0 | Menu order, readable name links (**done**) | - |
| T1 | **Role model v2**: `SUPER_ADMIN`, `SCHOOL_ADMIN` split, admin-account guard, temp password expiry (**done**) | Decision 1 |
| T2 | **Search and filters**: shared list contract, global search in the top bar, filters on admissions, students, staff | T1 |
| T3 | **Students v2**: edit, archive and restore, move within a year, teachers read all students, student ID and e-mail convention in school settings | T1, T2, decisions 8.2, 8.3 |
| T4 | **Staff v2**: staff types, per-type forms and documents, filters | T1, forms engine (3.1) |
| T5 | **Leave management** and the staff calendar | T4, decision 8.4 |
| T6 | **Notifications platform** (outbox, in-app inbox, bell) and the fee reminder to class teachers | T1 |
| T7 | **Homework and assignments** | T6 |
| T8 | **Tests and results** with publish | T6 |
| T9 | **Mobile readiness**: `/api/v1`, bearer tokens, devices, push channel | T6 |

T1 comes first because every later step depends on who is allowed to do what. T6 comes before homework and
results so those features never need their own way of telling parents.

## 7. Risks and how they are handled

| Risk | Handling |
|---|---|
| The role split changes permissions across the whole app | Do it first, with the existing permission tests extended; no feature code checks role names |
| Teachers seeing all students raises a privacy question | Limited "directory" row for non-assigned students; full detail only for assigned ones; tested like the existing scope rules |
| "Delete" loses money history | Archive instead; erase only through the audited Super-Admin action |
| Dynamic forms for staff become a second system | One engine with a `subject`, shared validation and renderer |
| Notifications duplicated per feature | Single outbox; features only write events |
| Search leaks hidden records | Each module answers search through its own scope rules; tested per role |
| Leave rules differ from what we assume | Rules are data (types, entitlements, approval), confirmed with the school before building T5 |
| Mobile app later forces API rework | Versioned, documented API and bearer tokens from T9; no UI logic in the API |

## 8. Decisions (confirmed by Ismail on 10 Nov 2026 unless marked open)

1. **Super Admin vs School Admin: confirmed, the widest version.** Only the Super Admin can manage admin accounts and
   roles, change the school profile and settings, read the audit log, permanently erase records, **and reverse
   payments or give concessions**. The School Admin does everything else, including the rest of Finance (setting
   fee structures, recording payments, billing, dues).
2. **Remove a student: confirmed.** Archive with a required reason, restorable; permanent erasure only by the Super Admin.
3. **Teachers see all students: confirmed in the widest form.** A teacher reads the full record of every student
   (the proposal was a limited row) and changes only the students of their assigned divisions. Scanned documents
   (birth certificate and so on) still need their own permission and are not part of "full details" until the
   school says otherwise (open question for T3).
4. **Leave: open.** Needs the school's leave policy. Default stands: staff apply, School Admin approves, approved
   leave marks attendance "on leave".
5. **Accounts for families: confirmed, one login per student, held by the parent.** Each student gets a login ID by
   the school's convention, for example `hesj0001` for Hera English School Jogeshwari, and a temporary password that
   must be changed within 2 days. When the school has its own email domain, the login becomes the student's school
   e-mail address (`hesj0001@<domain>`); until then the ID itself is the login. **The convention is a school
   setting, not code** (prefix, number of digits, where the counter starts, optional e-mail domain), because every
   school names things differently. The parent mobile-number login is postponed to a later discussion.
6. **Email in V1: open.** Default: in-app first; email once the school has a sender address.

### 8.1 Student ID and e-mail convention (new, from decision 5)

- School settings gain: **student ID prefix** (for example `hesj`), **digits** (4), **next number**, and an optional
  **e-mail domain**. The ID is `prefix + zero-padded number`, assigned under the same lock that numbers admissions
  today, so two admits never collide. Admission numbers and student IDs become the same thing (today the admission
  number is the student's login name).
- With a domain set, the student's e-mail is `<id>@<domain>` and is shown on the student page; the account's login
  accepts either the ID or the e-mail.
- Changing the prefix later affects new students only; issued IDs never change.
- Siblings each have their own ID and login. A parent with two children uses two logins (or the mobile login later).

## 9. Done in this step

- Academic setup now sits above Admissions in the staff menu.
- **T1 built (10 Nov):** `SUPER_ADMIN` and `SCHOOL_ADMIN` roles as in decision 1 (`admins.manage` permission; the seeded first login is now a Super Admin; "keep one active Super Admin" guard), admin accounts can be created, changed, disabled or reset only by a Super Admin, and temporary passwords stop working after 2 days (`TEMP_PASSWORD_DAYS`, default 2) with a clear message and an audit entry. 12 new tests.
- Names that open something (admission list, students, staff, fee lists and similar) are coloured and underlined at
  all times, so a row no longer looks empty until hovered.
