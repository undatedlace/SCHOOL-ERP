# School ERP: V1 Plan

Status: planning, no code written yet. Last updated: 5 Nov 2026.

## 1. How we work (read this first)

Ismail writes all the code by hand to get hands-on experience.

**Claude Code must:**
- Not create, edit or delete project files unless Ismail explicitly asks for that specific change.
- Work one small step at a time: explain what the step does and why, give the code, then wait.
- Keep code chunks small enough to type and understand. Say which file each one goes in.
- Explain unfamiliar concepts and trade-offs briefly when they first come up.
- Give a way to verify each step (command, request or expected result).
- Review the code after Ismail has typed it, and point out bugs and better patterns.
- Ask before moving on to the next step or phase.

Read-only actions (reading files, checking errors, reviewing code) are fine without asking.

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

### Optimus UI check (do this before building screens)
Build a small test page, then confirm:
- [ ] Tailwind and Optimus styling work together
- [ ] Data table handles server-side filters, sorting and pagination
- [ ] Reactive form with validation works with its input, select and date controls
- [ ] It runs cleanly in the Angular setup we choose (including zoneless, if used)

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

### Phase 2: People
Admissions, students, guardians, enrollments, staff, teaching assignments, documents, Excel import.
**Done when:** a student is admitted into a division with linked parents, and a real school's data can be imported.

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

## 12. Next step

Start Phase 0, one step at a time. Before Phase 1, design the Prisma schema together, starting with auth, academics and students.
