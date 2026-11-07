# School ERP: V1 Plan

Status: Phases 0 and 1 done (merged). Phase 2 (people) in progress: admissions, the form builder, photographs, students, guardians, the admit flow, age limits, staff and teaching assignments are built. Last updated: 7 Nov 2026.

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
4. **Staff:** accounts for teachers and other staff. Teachers handle attendance, homework, exams and results.
5. **Parent and student portal:** report cards, pending fees, attendance, homework, results, notices and fee payment.
6. **Dashboard:** overall insights.

**Not in V1:** multi-school onboarding, subscriptions, payroll, library, inventory, transport, timetable, staff attendance, native mobile apps, and SMS/WhatsApp notifications.

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
| Payments | Razorpay | Phase 5 |
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
| `TEACHER` | Teaching staff | Attendance, homework, marks for assigned classes |
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
| Student attendance | Full | Read | - | Assigned classes | - | Own child (read) | Self (read) |
| Homework | Full | - | - | Assigned classes | - | Own child (read) | Self (read) |
| Marks entry | Full | - | - | Assigned subjects | - | - | - |
| Publish results | Full | - | - | - | - | Own child (read) | Self (read) |
| Fee structures | Full | - | Full | - | - | - | - |
| Record payments, receipts | Full | - | Full | - | - | - | - |
| Reverse a payment | Full | - | - | - | - | - | - |
| Own fees, pay online | - | - | - | - | - | Own child | Read |
| Notices | Full | Create | Create | Own classes | Read | Read | Read |
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
    homework/     homework by division and subject
    exams/        exams, marks, grading, results, report cards
    fees/         structures, invoices, payments, allocations, concessions, receipts, dues
    payments/     Razorpay orders and webhooks
    notices/      notices and audience targeting
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
    homework/
    exams/        exams, marks entry, publish, report cards
    fees/         structures, student ledger, record payment, dues by class
    notices/
    imports/
    settings/     school settings, users and roles
    portal/       child switcher, attendance, homework, results, fees, notices
```

- Route guards and a `*hasPermission` directive only control what's visible. The backend enforces access.
- Staff use `staff-shell` (sidebar, desktop first). Parents and students use `portal-shell` (mobile first).

## 9. Data rules to get right early

**Core tables:** `schools`, `users`, `sessions`, `roles`, `permissions`, `students`, `guardians`, `student_guardians`, `academic_years`, `classes`, `divisions`, `subjects`, `enrollments`, `staff`, `teaching_assignments`, `applications`, `attendance_records`, `homework`, `exams`, `exam_marks`, `fee_heads`, `fee_structures`, `fee_invoices`, `fee_instalments`, `payments`, `payment_allocations`, `concessions`, `notices`, `audit_logs`.

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
- Razorpay: verify webhook signatures and make processing idempotent.
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
- **Photographs:** the four photo boxes (child, mother, father, guardian) are a `photograph` question type. Files module: `POST /files` and `GET /files/:id`. Every file has a purpose that decides who may add and see it (`api/src/modules/files/file-purposes.ts`); the type is judged from the file's bytes (PNG, JPEG, WebP only; SVG, HTML and PDF are refused), 5 MB limit, private downloads, and a file you may not see looks the same as one that does not exist. Bytes go through a `FileStorage` interface: local disk in development (`FILES_DIR`), S3-compatible storage in production (not written yet). Photos are not yet resized, and camera location data (EXIF) is not yet removed from them; do that before launch. Uploaded files that are never attached to an application are not yet cleaned up.
- **Age limits (configurable):** each class has an optional minimum age in whole years and an "open for admission" switch, and each academic year has an optional "age counted as on" date (the paper form's "Age as on"); all set in Academic setup. The form has a display-only *Age limits table* block that draws itself from those settings (so the table on the form always matches them). While an application is filled in, and on the application page, the app advises whether the child's age suits the class and whether it is open, but never blocks saving (see open question 10). Rule in `api/src/common/age.ts`: age in whole months on the counting date, compared with the minimum.
- **Left out of the paper form on purpose:** "Age as on" (shown as an age calculated from the date of birth), "Date of birth in words", signatures (a tick box records that the signed undertaking was received), and "For office use only" (that is the status and decision).
- **UI:** neutral (zinc) theme, dark by default, with a toggle. Design tokens live in `web/src/styles.css`; the Optimus preset is `web/src/app/theme/optimus-preset.ts`.
- **Students, guardians, enrolments and the admit flow:** a granted application plus a division and the guardians' details becomes a student, guardians and the first enrolment, in one transaction (all or nothing). A student is never hard-deleted (status and left date) and holds no class: `enrollments` link student, academic year and division, one per year, so promotion will add rows and never rewrite history. A guardian is a person linked to students through `student_guardians` (relationship, primary contact); siblings share one guardian (same name and mobile number), while a father and mother who share a phone stay two people. Guardians can later be linked to a login (`guardians.user_id`). Admission numbers are sequential per school (a typed number is kept) and assigned under a lock; simultaneous admits of one application create exactly one student.
- **Who sees which students:** `students.read_all` (admin, office, accountant) sees every student. Anyone else with `students.read` sees the students they are a guardian of, plus, for a teacher, the students of the divisions they teach this academic year (class teacher or subject teacher), read only; student accounts see none yet. The access ends the moment an assignment is removed, the year changes, or the teacher leaves. A student you may not see looks the same as one that does not exist, and a parent does not see the admissions paperwork.
- **Staff:** a profile (name, designation, contact, joined and left dates, photograph) with an optional login. Never hard-deleted: leaving sets status and a left date, **switches the login off and signs the person out everywhere**, and rejoining switches it back on; an administrator cannot lock themselves out. A login is created together with the person or added later, only by someone with `users.manage`, only with staff roles (not parent or student), with a temporary password shown once. Employee numbers are sequential under a lock, or typed. `staff.read_all` (admin, office) sees everyone; teachers and other staff with `staff.read` see only their own record.
- **Teaching assignments:** one class teacher per division per academic year, and one teacher per subject per division per year (two plain tables with unique constraints). Assigned in Academic setup, Teaching tab; changing hands the place to someone else; only current staff can be assigned, and a conflict names who already holds the place. Teachers see their own classes on the dashboard and the students of those divisions in Students. Attendance, homework and marks (Phase 4) will use the same assignments to decide which classes a teacher may work on.
- **Next in Phase 2:** parent and student logins (mobile number or admission number, linked to guardians and students), student documents, and Excel import (students, guardians, staff and opening balances). Bulk promotion to the next year belongs to Phase 4.


### Phase 3: Fees
Fee heads and structures, invoices, instalments, concessions, offline payments, allocations, reversals, PDF receipts, dues by standard and division.
**Done when:** a part payment produces a receipt and the correct balance at student, division and standard level.

### Phase 4: Academics
Attendance, homework, exams, marks, grading, publishing, report card PDFs, year-end promotion.
**Done when:** a teacher can run attendance and marks for assigned classes, and admin can publish report cards and promote a class.

### Phase 5: Parent and student portal
Portal screens, notices, Razorpay online payment, PWA setup.
**Done when:** a parent can see each child's records, download a report card and pay part of a fee online, and the ledger updates correctly.

### Phase 6: Dashboard and launch
Insights, security review, backups, deployment, staff training data.

**Insights:** admissions per year (with comparison), staff joined and left per year, fees collected vs pending by standard and division, attendance trends, and result summaries.
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

## 12. Next step

Click through Phase 1 and the admissions, photographs, students and admit screens in a browser with each role and fix what that shows. Then build staff and teaching assignments, and parent and student logins.
