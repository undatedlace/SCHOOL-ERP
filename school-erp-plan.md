# School ERP: V1 Plan

Status: Phases 0 and 1 done (merged). Phase 2 (people) in progress: admissions, the form builder, photographs, students, guardians, the admit flow, age limits, staff and teaching assignments are built. Phase 3 (fees) is built; Phase 4 has started: attendance and year-end promotion are built. Phase 5 has started: notices, the portal screens and the installable app are built (results and report cards wait for Phase 4). Phase 6 has started: dashboard insights, deployment files and backup scripts are built. The SchoolHub restyle and the calendar are built (branch `feature/schoolhub-ui`). Last updated: 9 Nov 2026.

## 1. How we work (read this first)

Claude Code writes the code and works through the plan phase by phase. Ismail reviews and steers.

**Claude Code must:**
- Implement whole modules and features end to end (backend, frontend, tests) rather than step by step, and keep each phase's "Done when" as the target.
- Verify its own work before reporting: build, lint, tests, and real requests against the running app.
- Report briefly after each module: what was built, what was verified, and any decision Ismail should know about.
- Follow the plan's design decisions (sections 4 to 9). If something needs to change, say so and update the plan.
- Ask before: deleting or resetting data, changing a decision in this plan, adding a paid service, pushing, or anything outward-facing. Commit only when Ismail asks.
- Pin exact dependency versions, and keep secrets out of git.
- Keep this plan up to date as things are built.

## 2. What we're building

A school management system for **one school**, structured so it can become multi-school SaaS later.

**In V1**
1. **School admin:** authority over academic setup, admissions, staff and settings.
2. **Admissions and yearly insights:** student admissions, plus staff joining and leaving, tracked by year.
3. **Fees:** per student, by standard and division, with pending balances and part payments.
4. **Staff:** accounts for teachers and other staff. Teachers handle attendance, exams and results.
5. **Parent and student portal:** report cards, pending fees, attendance, results, notices and fees (viewing dues and receipts; online payment is on hold, see section 11).
6. **Dashboard:** overall insights.

**Not in V1:** multi-school onboarding, subscriptions, payroll, library, inventory, transport, timetable, native mobile apps, and SMS/WhatsApp notifications.

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Angular 22, standalone components | Lazy-loaded feature routes, no NgModules |
| UI | Optimus UI + Tailwind | Community fork of the last MIT-licensed PrimeNG. Pin exact versions |
| Forms | Reactive Forms | Don't assume Optimus controls support Signal Forms until tested |
| Backend | NestJS, TypeScript | Modular monolith, Swagger from day one |
| Database | PostgreSQL + Prisma | |
| Jobs | Redis + BullMQ | PDFs and notifications. Add when first needed |
| Files | S3-compatible storage | Student and staff documents, generated PDFs |
| Payments | Razorpay | **On hold** (decided 8 Nov 2026: not needed for now). Fees are recorded by the accountant (cash, cheque, UPI, bank transfer) |
| Parent access | Mobile-friendly web app (PWA) | **Assumption, see section 11** |
| Hosting | Docker on AWS Mumbai or equivalent | |

**Repo:** one repository with `api/` and `web/`. No Nx for now.

**As built (7 Nov 2026):** NestJS 12 (Vitest, oxlint), Angular 22.2 zoneless, Prisma 7.10.1 with `@prisma/adapter-pg`, Postgres 18 running locally (not Docker, for development), Optimus UI 2.0.2 (`@openng/optimus-ui`, not the React package named `optimus-ui`), Tailwind 4.3.4. The Prisma schema is a folder, `api/prisma/schema/*.prisma`, one file per domain. The generated client is in `api/src/generated/prisma` and is not committed (run `npx prisma generate`).

### Optimus UI check (done 5 Nov 2026)
- [x] Tailwind and Optimus styling work together
- [x] Data table handles server-side filters, sorting and pagination (lazy mode, tested paging and sorting)
- [x] Reactive form with validation works with its input, select and date controls
- [x] It runs cleanly in the Angular setup we choose (including zoneless, if used)

Wrap heavily used components (data table especially) in our own shared components. Fallback: Angular Material.

## 4. Staying ready for multi-school

**Do now**
- Add `school_id` to every school-owned table, and include it in unique constraints.
- Resolve the current school in one place (from the session), never from client input.
- Keep fee heads, grading rules and branding in the database or config, not code.

**Skip for now:** row-level security, subdomains, school onboarding, subscription billing.

## 5. Authentication

**Decision: server-side sessions in an httpOnly cookie, not JWT.**

| | Sessions | JWT |
|---|---|---|
| Log out or disable a user immediately | Yes, delete the session | Needs a denylist or short expiry plus refresh tokens |
| Role change applies immediately | Yes | Only after the token expires, unless checked server-side |
| Token handling in Angular | None, the browser sends the cookie | Refresh flow and interceptor logic |
| XSS exposure | Script can't read the cookie | High if stored in localStorage |
| Works without a DB lookup | No | Yes, but that doesn't matter at one-school scale |

Why it fits: this app holds children's data and money records, and a departing staff member must lose access immediately. There's one backend, so JWT's stateless benefit isn't needed. If native apps come later, the same session tokens can be sent as bearer tokens.

**Design**
- `sessions` table in Postgres: `id`, `user_id`, `school_id`, `token_hash`, `expires_at`, `last_seen_at`, `ip`, `user_agent`.
- Generate a random token, store only its SHA-256 hash, and send the raw token in the cookie.
- Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`.
- Serve the API on the same domain under `/api` (nginx in production, Angular proxy in development).
- CSRF: `SameSite=Lax` plus an `Origin` check on state-changing requests.
- Passwords: argon2id. Rate-limit login with `@nestjs/throttler`.
- Expiry: staff sessions are short (about 12 hours), parent sessions long (about 30 days, sliding).
- Rotate the session on login and password change. Password change revokes the user's other sessions.

**Login**
- Staff: email or mobile number plus password.
- Parents and students: mobile number or admission-linked ID plus password.
- First login: the school issues a temporary password, and the user must change it.
- Forgot password in V1: admin resets it. SMS OTP comes later, since India's SMS rules (DLT registration) add setup time and cost.
- MFA for admin and accountant: after V1.

**Endpoints:** `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/users/:id/reset-password`.

## 6. Roles and permissions (RBAC)

**Model:** `users` -> `user_roles` -> `roles` -> `role_permissions` -> `permissions`
- Code checks **permissions** (`fees.payment.create`), never role names.
- A user can hold several roles.
- Roles are seeded in the database. No role-editing screen in V1.

**Roles**
| Role | Who | Purpose |
|---|---|---|
| `SCHOOL_ADMIN` | Principal, management | Full control |
| `OFFICE_STAFF` | Front office | Admissions and student records |
| `ACCOUNTANT` | Accounts office | Fees and payments |
| `TEACHER` | Teaching staff | Attendance and marks for assigned classes |
| `STAFF` | Other faculty | Own profile and notices |
| `PARENT` | Guardians | Linked children only |
| `STUDENT` | Students | Own records, read-only |

"Class teacher" is an assignment, not a role. A future platform `SUPER_ADMIN` isn't needed in V1.

**Access matrix**
| Area | Admin | Office | Accountant | Teacher | Staff | Parent | Student |
|---|---|---|---|---|---|---|---|
| Users, roles, settings | Full | - | - | - | - | - | - |
| Academic setup | Full | Read | Read | Read | - | - | - |
| Admissions | Full | Full | Read | - | - | - | - |
| Student records | Full | Full | Read | Assigned classes (read) | - | Own child (read) | Self (read) |
| Staff records | Full | Read | - | Self | Self | - | - |
| Student attendance | Full (mark, change, remove) | Read | - | Assigned classes (mark, change) | - | Own child (read) | Self (read) |
| Staff attendance | Full (mark, change, remove, leave) | Read | - | Own (read) | Own (read) | - | - |
| Marks entry | Full | - | - | Assigned subjects | - | - | - |
| Publish results | Full | - | - | - | - | Own child (read) | Self (read) |
| Fee structures | Full | - | Full | - | - | - | - |
| Record payments, receipts | Full | - | Full | - | - | - | - |
| Reverse a payment | Full | - | - | - | - | - | - |
| Own fees (view dues, download receipts) | - | - | - | - | - | Own child | Read |
| Notices | Full | Create | Create | Own classes | Read | Read | Read |
| Calendar (events, holidays, exams) | Full | Full | Read | Read (own classes) | Read | Read (own child's classes) | Read |
| Dashboard | Full | Admissions | Fees | Assigned classes | - | - | - |

**Two layers of checks**
1. `PermissionsGuard` + `@RequirePermissions(...)`: can this user perform this action?
2. Scope checks in the service layer: is this *their* class or child? Never trust an ID from the client.

## 7. Backend modules (NestJS)

```
api/src/
  common/         guards, decorators, filters, pipes, pagination
  config/         environment config and validation
  database/       Prisma service
  modules/
    auth/         login, sessions, passwords
    users/        accounts and role assignment
    rbac/         roles, permissions, guard
    audit/        audit log of sensitive actions
    school/       school profile and settings
    academics/    academic years, classes, divisions, subjects
    admissions/   enquiries, applications, admit flow
    students/     students, guardians, enrollments, promotion, documents
    staff/        profiles, joining and exit dates, teaching assignments
    attendance/   daily student attendance
    staff-attendance/  attendance of teachers and other staff
    exams/        exams, marks, grading, results, report cards
    fees/         structures, invoices, payments, allocations, concessions, receipts, dues
    payments/     Razorpay orders and webhooks (ON HOLD, not built)
    notices/      notices and audience targeting
    calendar/     events, holidays, exams and meetings, with the notice audiences
    imports/      Excel import with validation
    insights/     dashboard queries
    files/        S3 uploads and signed URLs
    pdf/          receipts and report cards
```

Dependencies point one way. For example, `fees` uses `students`, never the reverse. `insights` only reads.

## 8. Frontend modules (Angular)

```
web/src/app/
  core/           auth service, guards, interceptors, API client
  layouts/        staff-shell, portal-shell, auth-shell
  shared/ui/      wrappers: data-table, form-field, page-header, status-tag
  shared/         pipes (currency in INR, dates), permission directive
  features/
    auth/         login, change password
    dashboard/    role-based insights
    academic-setup/
    admissions/
    students/     list, profile, promotion
    staff/        list, profile, assignments
    attendance/   mark by division, reports
    exams/        exams, marks entry, publish, report cards
    fees/         structures, student ledger, record payment, dues by class
    notices/
    calendar/     month view, agenda, event dialog, upcoming widget
    imports/
    settings/     school settings, users and roles
    portal/       child switcher, attendance, results, fees, notices
```

- Route guards and a `*hasPermission` directive only control what's visible. The backend enforces access.
- Staff use `staff-shell` (sidebar, desktop first). Parents and students use `portal-shell` (mobile first).

## 9. Data rules to get right early

**Core tables:** `schools`, `users`, `sessions`, `roles`, `permissions`, `students`, `guardians`, `student_guardians`, `academic_years`, `classes`, `divisions`, `subjects`, `enrollments`, `staff`, `teaching_assignments`, `applications`, `attendance_records`, `exams`, `exam_marks`, `fee_heads`, `fee_structures`, `fee_invoices`, `fee_instalments`, `payments`, `payment_allocations`, `concessions`, `notices`, `audit_logs`.

**Students and years**
- A student is not tied directly to a class. `enrollments` links student, academic year and division.
- Promotion creates new enrollments and never overwrites history. Yearly insights depend on this.
- One parent can have many children, and one child can have several guardians.

**Staff**
- Never hard-delete staff. Use joining and exit dates so history and yearly counts stay correct.
- Exit disables the login and revokes sessions.

**Fees**
- Flow: fee structure -> invoice per student -> instalments -> payments -> allocations.
- A payment can cover part of an instalment or several instalments.
- **Pending balance is calculated, never a manually edited number:** invoiced - concessions - allocated payments + reversals.
- Payments are append-only. Corrections are reversal entries with a required reason.
- Unpaid dues carry into the next academic year and stay visible.
- Support cash, cheque, UPI, bank transfer and online. Cheque bounces are reversals.
- Receipt numbers are sequential per academic year and unique.
- Money: `Decimal(12,2)`, never JS floating-point arithmetic.
- Razorpay (**on hold**): when it is built, verify webhook signatures and make processing idempotent. The `ONLINE` payment mode exists in the data but is refused for now.
- Write automated tests for ledger logic. This is the code that must not be wrong.

**Audit:** log logins, permission changes, payments, reversals, marks changes and result publishing.

## 10. Phases

Each phase ends with something working end to end.

### Phase 0: Setup and checks
Repo, NestJS, Angular, Prisma, Postgres in Docker, linting, Swagger, Optimus UI check.
**Done when:** the Angular test page calls a NestJS endpoint that reads from Postgres.

### Phase 1: Foundation
Auth, sessions, RBAC, audit, school settings, academic years, classes, divisions, subjects, app shells.
**Done when:** each role logs in and sees only what it should, and admin can set up a school year.

**Status (7 Nov 2026): built and tested, not yet clicked through in a browser.**
- API: login, logout, `/auth/me`, change-password (forced for temporary passwords, rotates the session), admin password reset, users and role assignment (protects the last School Admin), school profile, academic years (exactly one current), classes, divisions, subjects, audit log with filtering. Session guard, permissions guard, rate-limited login, Origin check, validation, Prisma error filter. 15 unit tests and 43 end-to-end tests (against `school_erp_test`, which the suite wipes and re-seeds; the database name must end in `_test`).
- Web: auth shell, staff shell (sidebar, phone menu), portal shell, login, change password, dashboard, school settings, users (search, filters, create, edit, reset password), audit log, academic setup (years, classes and divisions, subjects). Route guards, session interceptor, `*appHasPermission` directive. 33 unit tests.
- Notes: Prisma 7 does not seed after `migrate reset`, so run `npx prisma db seed`. The seed creates the admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` with a temporary password. A parent or student with no school-wide role gets a 30-day session; sliding renewal is implemented in the session guard. The portal home is a placeholder until Phases 4 and 5.
- Still to do in Phase 1: click through each role in a browser and fix what that shows.

### Phase 2: People
Admissions, students, guardians, enrollments, staff, teaching assignments, documents, Excel import.
**Done when:** a student is admitted into a division with linked parents, and a real school's data can be imported.

**Status (7 Nov 2026): admissions and the form builder are built; the rest of Phase 2 is not started.**
- **Form builder:** a form is data, not code. A definition is JSON in `form_definitions`, versioned (draft, published, archived). Field types: short text, long text, number, date, dropdown, choice buttons, tick box, repeating rows (for example siblings). The admin edits a draft (add, edit, move, remove questions and sections, preview), then publishes. Publishing creates a new immutable version; each application keeps the version it was filled in with, so changing the form never rewrites old applications. A few **core fields** (class applied for, surname, first name, gender, date of birth) are locked, because the admit flow needs them; the school can reword and move them but not remove or retype them. Structure and answers are checked on the server by `validateFormSchema` and `validateAnswers`.
- **Admissions:** office staff record an application from the paper form (the school's own form is the seeded first version). Form number is the number printed on the paper form, or the next number in the sequence per school and academic year (assigned under an advisory lock, so simultaneous saves never collide). Statuses: received, under review, granted (with class and division), refused (a reason is required), withdrawn. A granted application is final. A refused or withdrawn one can be reopened. Search by name or form number, filter by status and class, counts by status.
- **Photographs:** the four photo boxes (child, mother, father, guardian) are a `photograph` question type. Files module: `POST /files` and `GET /files/:id`. Every file has a purpose that decides who may add and see it (`api/src/modules/files/file-purposes.ts`); the type is judged from the file's bytes (PNG, JPEG, WebP only; SVG, HTML and PDF are refused), 5 MB limit, private downloads, and a file you may not see looks the same as one that does not exist. Bytes go through a `FileStorage` interface: local disk in development (`FILES_DIR`) and S3-compatible storage in production, chosen by `FILES_DRIVER` (`docs/s3-setup.md`; check credentials with `npm run s3:check`). The S3 driver is tested against an in-process S3-like server with the real AWS SDK; it has not yet been run against a real bucket. Every photo is re-encoded with `sharp` on upload (`image-clean.ts`): all metadata including camera and GPS data is removed, it is turned upright, shrunk to fit 1600 pixels, and a file that is not a decodable picture is refused. Uploads that are never attached to a student, staff member or application are removed by `npm run files:cleanup` (after `npm run build`; default: older than 24 hours; run it daily from cron once deployed).
- **Age limits (configurable):** each class has an optional minimum age in whole years and an "open for admission" switch, and each academic year has an optional "age counted as on" date (the paper form's "Age as on"); all set in Academic setup. The form has a display-only *Age limits table* block that draws itself from those settings (so the table on the form always matches them). While an application is filled in, and on the application page, the app advises whether the child's age suits the class and whether it is open, but never blocks saving (see open question 10). Rule in `api/src/common/age.ts`: age in whole months on the counting date, compared with the minimum.
- **Left out of the paper form on purpose:** "Age as on" (shown as an age calculated from the date of birth), "Date of birth in words", signatures (a tick box records that the signed undertaking was received), and "For office use only" (that is the status and decision).
- **UI:** (replaced by the SchoolHub look, see below; was neutral zinc, dark by default.) Design tokens live in `web/src/styles.css`; the Optimus preset is `web/src/app/theme/optimus-preset.ts`.
- **Students, guardians, enrolments and the admit flow:** a granted application plus a division and the guardians' details becomes a student, guardians and the first enrolment, in one transaction (all or nothing). A student is never hard-deleted (status and left date) and holds no class: `enrollments` link student, academic year and division, one per year, so promotion will add rows and never rewrite history. A guardian is a person linked to students through `student_guardians` (relationship, primary contact); siblings share one guardian (same name and mobile number), while a father and mother who share a phone stay two people. Guardians can later be linked to a login (`guardians.user_id`). Admission numbers are sequential per school (a typed number is kept) and assigned under a lock; simultaneous admits of one application create exactly one student.
- **Who sees which students:** `students.read_all` (admin, office, accountant) sees every student. Anyone else with `students.read` sees the students they are a guardian of, plus, for a teacher, the students of the divisions they teach this academic year (class teacher or subject teacher), read only; student accounts see none yet. The access ends the moment an assignment is removed, the year changes, or the teacher leaves. A student you may not see looks the same as one that does not exist, and a parent does not see the admissions paperwork.
- **Staff:** a profile (name, designation, contact, joined and left dates, photograph) with an optional login. Never hard-deleted: leaving sets status and a left date, **switches the login off and signs the person out everywhere**, and rejoining switches it back on; an administrator cannot lock themselves out. A login is created together with the person or added later, only by someone with `users.manage`, only with staff roles (not parent or student), with a temporary password shown once. Employee numbers are sequential under a lock, or typed. `staff.read_all` (admin, office) sees everyone; teachers and other staff with `staff.read` see only their own record.
- **Teaching assignments:** one class teacher per division per academic year, and one teacher per subject per division per year (two plain tables with unique constraints). Assigned in Academic setup, Teaching tab; changing hands the place to someone else; only current staff can be assigned, and a conflict names who already holds the place. Teachers see their own classes on the dashboard and the students of those divisions in Students. Attendance and marks (Phase 4) will use the same assignments to decide which classes a teacher may work on.
- **Parent and student logins:** office staff and admin (permission `portal.accounts.manage`, a small widening of the access matrix: the admin-only user screen is not needed to hand out a parent login) give a login from the student page. A parent signs in with the guardian's mobile number; a father and mother who share a phone share one login (the second is attached to the first, with no new password); a student signs in with the admission number (stored in `users.username`, case-insensitive). The school issues a temporary password, shown once, and the person must change it at first sign-in; reset is the same call. A parent or student with no staff role gets the 30-day sliding session. A student sees only themself (`students.userId`); marking a student as left disables the login and signs them out, and rejoining restores it. Mobile numbers and admission numbers that already belong to another login are refused with a clear message. The portal screens themselves (child switcher, results, fees) are still Phase 5.
- **Fixed on the way:** a teacher (or any user whose scope used OR) who searched the student list by name had the scope replaced by the search, so they could see students they do not teach. The scope and the search now combine with AND; covered by a test.
- **Student documents:** staff keep scanned papers on a student's record (birth certificate, transfer certificate, ID proof, previous report card, medical, other), as a PDF or a photograph of the paper (photographs are cleaned like any photo). Staff only: viewing needs `students.read_all`, changing needs `students.manage`; a parent never sees them. **PDF rules** (`pdf-check.ts`): the file must start with `%PDF-`; it is parsed for real (including objects packed in compressed streams and names written with # escapes) and refused if it contains JavaScript, launch or open-on-load actions, web addresses, attached files, rich media or forms that submit, if it is encrypted or damaged, or has more than 50 pages. A passing PDF is stored exactly as uploaded and served only as a download (`Content-Disposition: attachment`, `nosniff`, a sandboxing Content-Security-Policy). 10 MB limit. This is a structural check, not a virus scanner: **before launch, also scan uploads with ClamAV (or the host's scanner).**
- **Next in Phase 2:** Excel import (waiting for sample data). Phase 2 is otherwise complete.


### Phase 3: Fees
Fee heads and structures, invoices, instalments, concessions, offline payments, allocations, reversals, PDF receipts, dues by standard and division.
**Done when:** a part payment produces a receipt and the correct balance at student, division and standard level.

**Status (8 Nov 2026): the API and the main screens are built and tested; not yet clicked through in a browser.**
- **Rules kept:** the balance is never stored: invoiced - concessions (not taken back) - payments that were not reversed. All money maths is in whole paise by pure functions (`api/src/modules/fees/ledger.ts`, with its own tests); amounts reach the API as text with at most two decimals. Payments and concessions are append-only: a payment is cancelled by a reversal (whole payment, reason required, admin only), a concession by revoking it (reason required). Nothing is edited or deleted.
- **Fee heads and structures:** heads are switched off, never deleted. A structure is the template for one class in one year: amounts per head plus an instalment plan (percentages that add up to 100, with due dates). Saving it again replaces it, and invoices already made are copies, so they do not change. Instalment amounts are split to the paisa, the remainder going on the last one.
- **Invoices:** `generate` makes the year's invoice for every active student enrolled that year (safe to repeat; reports classes with no structure). An *opening balance* invoice carries dues from before the system or from an earlier year.
- **Payments:** the accountant records cash, cheque, UPI or bank transfer (cheque number or reference required; date not in the future; never more than is owed). By default a payment pays the oldest dues first (earlier years, then this year); the accountant may split it over chosen invoices. A payment covers part of an instalment or several. Receipts are numbered sequentially per academic year (`2026-27/00012`), and a one-page PDF receipt is available to staff and to the parent or student the fees belong to. Payments for one student are serialised under a lock, so two cashiers cannot both pay the same dues, and receipt numbers cannot repeat (both tested with simultaneous requests).
- **Decision (changes the plan's table list):** allocations point at an **invoice**, not at an instalment. What each instalment still owes is worked out on the fly by paying instalments in date order from the invoice's total paid; this stays correct when a concession changes the instalment amounts, which stored per-instalment allocations would not. The `fee_instalments` rows hold the amounts before concessions; concessions are shared across instalments in proportion.
- **Concessions:** admin only (`fees.concession.manage`), in rupees, with a reason; never more than what is still unpaid on the invoice.
- **Dues report:** by student, division and class for a year, adding up everything each student owes in all years, so earlier-year dues stay visible after promotion, with the overdue part (instalment date passed). Plus money collected between two dates by mode (reversed payments left out).
- **Access:** `fees.read_all` (admin, accountant) sees everything; a parent or student with `fees.read` sees only their own child's ledger and receipts (anything else looks like it does not exist). Teachers and office staff have no access to fees.
- **Screens:** *Fee setup* (kinds of fee; what each class pays and when, with a live total and a check that the shares make 100%; "Bill this year's fees"), *Fee dues* (totals, by class and division, by student, search, only-owing filter) and a *Fees* section on the student page (balance, what is due when with overdue marked, payments with receipt download, record payment, previous dues, concession, reverse with a reason). Parents and students see the same section without the buttons for changing anything. Money is shown in rupees with Indian digit grouping and is sent to the API as text.
- **Added 9 Nov 2026:** *Fee collection* page (accountant and admin): money received between two dates (today by default) with totals by payment mode and every receipt (reversed payments shown, struck through and not counted), searchable, with receipt download. *Copy fees from another year* on *Fee setup* (`POST /fee-structures/copy`): each class's structure is copied into the current year with due dates moved on by the number of years between the two; a class that already has fees for the new year is never overwritten; kinds of fee that were switched off are not carried over; no invoices are created; audited as `fees.structures_copied`.
- **Not built yet:** late fees (no rule given); automatic invoice creation at admission (staff run *generate*); online payment (on hold).

### Phase 4: Academics
Attendance, exams, marks, grading, publishing, report card PDFs, year-end promotion.

**Homework is not part of V1** (decided 8 Nov 2026: the school does not need it). It can be added later as its own module without changing anything else.
**Done when:** a teacher can run attendance and marks for assigned classes, and admin can publish report cards and promote a class.

**Status (9 Nov 2026): attendance and year-end promotion are built and tested; not yet clicked through in a browser. Exams, marks, grading and report cards are not started (they wait for the school's board, grading scheme and report card format).**
- **Attendance:** one record per student per day (`attendance_records`, unique on student and date), taken for a whole division at a time. Statuses: present, absent, late, on leave. Percentage = (present + late) / (present + late + absent); approved leave is left out of both sides, so it never counts against a child (`attendance-rules.ts`, with tests). A student's roster for a day is whoever was enrolled in that division on that date (enrolment dates and the date a student left are respected, so history stays whole after promotion or leaving).
- **Who may do what:** `attendance.read_all` (admin, office) reads every division; `attendance.mark_all` (admin) marks any division on any past date. A teacher, class teacher or subject teacher of a division this year, marks and reads only those divisions, and only for today and the **previous 7 days** (`TEACHER_EDIT_DAYS`); older corrections are the admin's. Parents and students read only their own child (`GET /attendance/students/:id`, same visibility rule as the student record). A division you may not use looks like one that does not exist. No future dates. Dates are counted in India time.
- **Screens:** *Attendance* page (divisions marked today, pick division and date, Present / Absent / Late / Leave per student with a note, "Mark everyone present", save; a Report tab with totals per student over a range and low attendance, under 75%, called out) and an *Attendance* section on the student page (percentage, counts, days not present), also shown to parents and students.
- **Assumptions to confirm with the school (open decision 16):** daily attendance, not per period; any teacher of the division may take it; the 7-day window; the 75% "low" line; the percentage rule above.
- **Year-end promotion:** *Year-end promotion* page (admin only, permission `students.promote`). Choose the year moving from and the year moving into (the current year and the next one by default), see every division with how many students are dealt with, open one, and for each student choose *Moves up*, *Stays in class* or *Leaves school* and the division. Defaults: move up to the division with the same name in the next class (A to A); in the last class the suggestion is that students leave. One press moves the whole division in one transaction (all or nothing). The old enrolment is kept and closed on the last day of the old year; a new enrolment starts on the first day of the new year, so history and yearly counts stay right. Leaving sets the student to left with that date, switches their login off and signs them out. Running it again skips anyone already moved, and simultaneous runs cannot double up (advisory lock). A higher class is decided by class list order, so the order in Academic setup matters. Refused: moving sideways or down (use *Stays in class*), staying back into another class, a new year that does not start after the old one. Audit entry `students.promoted`. Not done: roll numbers (they are not used yet), creating next year's fee invoices (the accountant still runs *Bill this year's fees*; unpaid dues already carry over).

### Phase 5: Parent and student portal
Portal screens, notices, PWA setup. (Razorpay online payment is **on hold**; parents see dues and download receipts, and pay at the school.)
**Done when:** a parent can see each child's records, download a report card, and see dues and download fee receipts. (Paying part of a fee online is on hold.)

**Status (9 Nov 2026): notices and the portal screens are built and tested; not yet clicked through in a browser. Results and report cards (waiting for Phase 4) are not done.**
- **Notices:** plain text only (shown exactly as written, never as HTML), a title, a message of up to 5,000 characters, an audience and an optional last day. Audiences: *Everyone*, *Staff only*, *Classes* and *Divisions*. Parents and students receive class and division notices through their child's enrolment this year (a child who has left stops receiving them); teachers receive the notices of classes they teach; "staff only" never reaches a person who is only a parent or student. Admin, office and accountant (`notices.read_all`) see every notice and may write to any audience. A teacher (`notices.create` without `read_all`) may write only to the divisions they teach this year, and cannot widen it later. Only the author, or the admin (`notices.manage_all`), can change or remove a notice; a person who cannot see a notice gets "not found". After its last day a notice disappears for readers and stays visible to those who may change it. Removing archives it (never deleted). Audited: `notice.created`, `notice.updated`, `notice.archived`.
- **Portal (parent and student, mobile first):** tabs Home, Attendance, Fees and Notices. A parent with several children switches between them (the choice is only remembered on that device; the API still decides what may be seen, and it is forgotten on sign out). Home shows attendance for the year, what is owed ("pay at the school office"), and the latest notices. Attendance and Fees reuse the student page sections without any buttons for changing anything; fees include receipt download.
- **PWA (installable app):** a web manifest (standalone, dark theme colours, neutral placeholder icons to be replaced with the school's logo) and Angular's service worker (`@angular/service-worker` 22.2.4, production builds only). It keeps only the app's own files (scripts, styles, icons) so the app opens fast and can be added to a phone's home screen. **It never caches anything from `/api`** (no data groups; `/api/**` is excluded from navigation; a test guards this), so children's data is never stored by the service worker. In production nginx must serve `ngsw.json`, `ngsw-worker.js` and `index.html` with `Cache-Control: no-cache` so updates reach users, and the manifest and icons from the site root.
- **Not built:** read receipts, scheduled publishing, attachments on notices, push notifications, offline use of data, and report cards and results in the portal (they follow Phase 4).

### SchoolHub restyle and calendar (10 Nov 2026, branch `feature/schoolhub-ui`)

A look taken from the "SchoolHub" Figma template, plus a calendar. **This changes two earlier decisions:** the theme is now **light by default** (dark stays as a toggle) with lavender, yellow and sky accents instead of neutral zinc, and the staff menu is **grouped** instead of one flat list.

- **Look:** tokens in `web/src/styles.css` (`--lavender`, `--sun`, `--sky`, a pale lavender page, white rounded borderless cards with a soft shadow, larger corners). A floating sidebar with line icons (`shared/ui/icon.ts`), a top bar with the notices bell, the theme toggle and the signed-in person, and coloured shortcut tiles on the dashboard. Colour is never the only cue (labels are always written).
- **Grouped menu:** `core/nav.ts` holds `NAV_ENTRIES` (single links and groups) and `visibleEntries()`, which drops pages a person may not open and any group left empty. Groups: Admissions (applications, admission form), Students (all students, year-end promotion), Staff, Academics, Finance (fee dues, fee collection, fee setup), Settings (school settings, users, audit log); Dashboard, Calendar, Attendance and Notices stay single links. A group opens by itself when you are on one of its pages and can be folded by hand. Hidden pages are still protected by the route guard and the API.
- **Calendar:** `calendar_events` and `calendar_event_targets` (same four audiences as notices: everyone, staff only, classes, divisions). Kinds: event, holiday, exam, meeting. Dates are inclusive and an event may span days (up to 60); optional start and end times (India time). Plain text only. Archived, never deleted. Permissions: `calendar.read` (every role), `calendar.manage` (admin, office). Who sees an event follows the same rules as notices (a parent sees events for their child's class and division; a staff-only event never reaches a parent or student). `GET /calendar?from=&to=` returns the events touching those days (at most 400 days), `POST`, `PATCH /:id`, `DELETE /:id`, and `GET /calendar/audiences`. Audited: `calendar.event_created`, `calendar.event_updated`, `calendar.event_archived`.
- **Telling people:** when an event is created with "Also send a notice about it", a notice is posted to the same audience (through the notice rules), shown until the event ends, and the event remembers it. **In V1 this is an in-app notice only**: there is no push, SMS, WhatsApp or e-mail (still "not in V1"). Changing or removing the event afterwards does not change a notice already sent. It cannot be used for an event already over.
- **Screens:** *Calendar* with four views chosen from a Day / Week / Month / Year switch (the choice is remembered on that device): **Month** (bordered grid, up to two events a day and "N more"), **Week** and **Day** (hours down the side, an "all-day" band for untimed and multi-day events, overlapping events side by side, opens scrolled to 7 am), and **Year** (twelve small months, a dot under days with events; a month's name opens that month and a day opens that day). Today is a red circle, Previous / Today / Next step by the current view, and an agenda for the chosen day sits beside it (add, change and remove for people who manage it), an *Upcoming* card on the staff dashboard and the portal home, and a *Calendar* tab in the portal (read only).
- **Attendance grid:** the Report tab on *Attendance* is now a grid like the template: students down the side, one column per day (every day for a range up to 31 days, otherwise only the days taken), a mark in each box (tick present, cross absent, L late, Lv on leave; the letter and a label carry the meaning, not colour alone), a dash where nothing was taken, Sundays greyed, and the attendance percentage with "Low" under 75% at the end. *This month* and *Last month* shortcuts sit beside the From and To dates. `GET /attendance/divisions/:id/report` now also returns `markedDates` and each student's `days` (date to status); the same visibility rules apply. Taking attendance is unchanged.
- **Student attendance, admin powers (added 10 Nov 2026):** besides marking any division on any past date, the admin can now **remove** a saved mark (`DELETE /attendance/divisions/:id/students/:studentId?date=`, `attendance.mark_all` only, audited as `attendance.mark_removed`); the student then shows as not marked. "On leave" is how leave is recorded, with a note. Teachers still mark and change only their own divisions, for the last 7 days, and cannot remove a mark.
- **Staff attendance (new, decided 10 Nov 2026; moves "staff attendance" into V1):** the attendance of teachers and other staff, in `staff_attendance_records` (one per person per day; statuses present, absent, late, on leave; a note such as the reason). **The admin marks, changes and removes it for any past date** (`staff_attendance.manage`); office staff can look (`staff_attendance.read_all`); a teacher or other staff member sees only their own (`staff_attendance.read`, *My attendance*). Who is listed on a day: staff who had joined by then and had not left, so leavers stay in the past grid. Audited: `staff_attendance.marked`, `staff_attendance.mark_removed`. Screens: *Attendance* is now a group in the menu with *Students*, *Staff* (take and report grid, remove, mark everyone present) and *My attendance* (hidden for admin and office, who hold the wider permission). **Method of capture is not decided yet** (how teachers will log in and out): every record is `source = MANUAL`, and the table already has `check_in_at` and `check_out_at` (empty) so a login/logout, biometric or QR method can be added later without changing it.
- **Not built (attendance):** leave **requests and approval** (a parent or teacher applies, the admin approves; today the admin simply marks "on leave"), half days, holidays that excuse everyone, check-in and check-out times.
- **Not built:** recurring events, a global search box in the top bar (it would have been a dead control), unread counts on the bell, drag to move events.

### Phase 6: Dashboard and launch
Insights, security review, backups, deployment, staff training data.

**Insights:** admissions per year (with comparison), staff joined and left per year, fees collected vs pending by standard and division, attendance trends, and result summaries.

**Status (9 Nov 2026): dashboard insights are built and tested (except result summaries); the deployment files, backup and restore scripts and a first security review are done; none of it is clicked through in a browser, and the Docker images are untested.**
- **Insights (read-only, `api/src/modules/insights`):** each card appears only to people who may see it, and the API enforces it (`GET /insights/...`). *Admissions by year* (`insights.admissions`: admin, office): applications received, granted, refused, withdrawn, admitted and students enrolled for each of the last five academic years, with the change on the year before. *Staff by year* (`insights.staff`: admin only): who joined and left each year and the strength at year end. *Fees* (`fees.read_all`: admin, accountant): billed, collected, pending and overdue, collected against billed by class, and money received in each month of the year (reversed payments left out). *Attendance* (`attendance.read`, limited to the divisions the person may see): how many divisions were marked today, a trend line for the last 30 days (7 to 90 allowed) with the 75% line, and the lowest divisions. Admin and office see every division; a teacher sees their own; a parent or student sees nothing here. Charts are plain HTML and SVG with the numbers written beside them (no chart library, no colour used alone).
- **Not built:** result summaries (they need exams and marks) and a per-division fee drill-down on the dashboard (the *Fee dues* page has it).
- **Deployment and backups (written, partly tested):** `api/Dockerfile`, `web/Dockerfile` (nginx serving the app and forwarding `/api`, security headers, a Content-Security-Policy in report-only mode, `no-cache` for the service worker files, API responses never cached), `deploy/docker-compose.yml` and `deploy/.env.production.example`, and the guide `docs/deployment.md`. **The Docker files have not been built or run** (no Docker daemon was available); the first deployment checklist in the guide covers it. `deploy/backup.sh` (compressed dump, verified readable, retention, optional off-site copy and files archive) and `deploy/restore-check.sh` (restores into a throwaway database and compares row counts and the payment total with the live one) **were run against real databases**, including a deliberate mismatch that the check caught. Swagger is now off in production.
- **Security review (9 Nov 2026, a first pass, not a penetration test):** dependency audits of the API and web are clean (`npm audit --omit=dev`, 0 vulnerabilities); the session cookie is `HttpOnly`, `Secure` in production and `SameSite=Lax`; state-changing requests are origin-checked; login is rate limited; passwords use argon2id; uploads are re-encoded or structurally checked and served privately; every list is scoped in the service layer (tests cover parents, teachers and strangers); the service worker never caches `/api`. Still to do before launch: enforce the Content-Security-Policy after a browser check, virus-scan uploads (ClamAV), add MFA for admin and accountant (planned after V1), review the DPDP Act questions with an adviser, and test the Docker deployment and a real restore on the production host.
**Done when:** the school can run on the system with restore-tested backups.

## 11. Open decisions

| # | Question | Working assumption | Affects |
|---|---|---|---|
| 1 | PWA or store apps for parents? | PWA | Stack, Phase 5 |
| 2 | Is there a deadline? Is Ismail building solo? | Not set | Phase scope |
| 3 | Do students get their own logins? | Yes, read-only | RBAC, consent |
| 4 | School's board and report card format? | Unknown, need a sample | Phase 4 |
| 5 | School's fee structure and instalment rules? | Unknown, need a sample | Phase 3 |
| 6 | Existing data format and opening balances? | Excel | Phase 2, 3 |
| 7 | Does a separate front office role exist? | Yes | RBAC |
| 8 | Consent and retention for children's data under India's DPDP Act? | Needs checking with a qualified adviser before launch | Phases 2, 5 |
| 9 | Should parents apply online themselves, or only the office enter paper forms? | Office enters paper forms. The form renderer is reusable for a public page later | Phase 2, 5 |
| 10 | Should the age limits be enforced (the paper form lists Nursery 3, Junior KG 4, Senior KG 5, Std 1 six, Std 2 seven)? | Configurable and advisory: the office is warned but can still save. Making it a hard block is a small change once the school decides | Admissions |
| 11 | Is a fee or registration payment taken at admission? | No. The paper form has "Fees paid on" and "Fee receipt no."; these link to fees in Phase 3 | Phase 3 |
| 12 | Form number format and who may enter a number by hand? | Anyone entering may type the paper number; otherwise sequential per year | Admissions |
| 13 | Which classes does the school run, and are there divisions from the start (the form mentions Play Group to Std 2)? | Set up in Academic setup | Admissions |
| 14 | Online payment through Razorpay? | **On hold** (8 Nov 2026). Offline payments only; the ledger is ready for it | Phase 5 |
| 15 | Fee rules the school has not given yet: instalments, late fee, who approves concessions | Assumed: instalments are a percentage plan per class; no late fee; concessions are approved by the admin only (`fees.concession.manage`); the accountant records payments | Phase 3 |
| 17 | How teachers' attendance is captured (login/logout, biometric, QR, or the admin marking by hand), and whether leave needs requests and approval? | Admin marks by hand for now; leave is the admin marking "on leave"; the data model is ready for check-in/out | Phase 4 |
| 16 | How the school takes attendance: daily or per period, who may take it, how far back it can be corrected, the minimum percentage, and how leave is counted? | Daily for the whole division; any teacher of the division (class or subject); teachers correct up to 7 days back, the admin any time; 75% is called low; approved leave is not counted against the child | Phase 4 |

## 12. Next step

Click through the new screens in a browser with each role and fix what that shows. Then parent and student logins, student documents, and the photo hardening (resize, strip camera location data).

**Checkpoint: waiting for the school's sample data.** These cannot be built well without real samples, so they are paused until the school provides them:
- An Excel sample of existing students, guardians and staff, and any opening balances (Phase 2 Excel import, Phase 3 opening dues).
- The board and report card format (Phase 4).
- The fee structure and instalment rules (Phase 3).

**Checkpoint: real S3 bucket.** Create the bucket and key (`docs/s3-setup.md`), paste the settings into `api/.env`, and run `npm run s3:check`.
