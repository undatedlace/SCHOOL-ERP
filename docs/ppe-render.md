# PPE: the test copy on Render

A public test copy of the School ERP, so people can explore it, find bugs and suggest improvements before the school uses it. **Sample data only: never real children's details.** The app shows a "Test environment" strip and a *Send feedback* link to say so.

## What runs where (all free)

| Part | Where | Notes |
|---|---|---|
| Web app | Render static site `school-erp-ppe` | Built from `web/`. Forwards `/api/*` to the API, so the browser sees one address and the session cookie is first-party. |
| API | Render free web service `school-erp-api-ppe` | Built from `api/Dockerfile`. Applies new migrations as it starts (free services have no pre-deploy step). Sleeps after 15 minutes without requests, so an uptime check keeps it awake. |
| Database | Neon free Postgres | A free Render service has no disk, so Postgres cannot run there; Render's own free Postgres is deleted after 30 days. Neon's free plan does not expire (0.5 GB is plenty for demo data). |
| Files | Your S3 bucket, under the `ppe/` prefix | Keys entered in Render, never in git. |
| Uptime | Your uptime monitor | Checks `/api/health` every minute: it keeps the API awake and proves site, API and database all work. |

Everything is described in `render.yaml` (a Render Blueprint) at the repository root.

## Setting it up (once)

1. **Neon:** create a free project in the **Singapore** region (next to Render's Singapore region). Create a database whose name contains `ppe`, for example `school_erp_ppe` (the reset script refuses any other name). Copy the connection string (it ends in `?sslmode=require`).
2. **Google Form** for feedback: ask for the page, the role they signed in as, what happened, what they expected, and an optional screenshot. Copy its link (`https://forms.gle/...`).
3. **Render:** *New, Blueprint*, choose this repository and the branch to deploy (`main`). Render reads `render.yaml` and asks for the secrets:
   - `DATABASE_URL`: the Neon connection string.
   - `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: your bucket and an IAM key limited to that bucket (see `docs/s3-setup.md`). `S3_REGION` is `ap-south-1`; change it in Render if the bucket is elsewhere.
   - `FEEDBACK_URL`: the Google Form link (must start with `https://`).
   If Render gives the services other addresses than `school-erp-ppe.onrender.com` and `school-erp-api-ppe.onrender.com` (the name was taken), change `APP_ORIGINS` on the API and the `/api/*` rewrite on the static site to match.
4. **Fill the database** from your laptop, once the API has started (its first start creates the tables):
   ```sh
   cd api
   export DATABASE_URL='postgresql://...neon.tech/school_erp_ppe?sslmode=require'
   SEED_SCHOOL_NAME='Heera English School (Test)' \
   SEED_ADMIN_EMAIL='you@example.com' SEED_ADMIN_PASSWORD='a-long-temporary-password' \
     npx prisma db seed --config prisma7.config.ts
   DEMO_PASSWORD='choose-a-demo-password' npm run seed:demo
   ```
   The first command creates the school, the roles and your **Super Admin** login. The second adds about 100 students with families, staff, fees, attendance, applications, notices and events, and prints the demo logins.

   Then create yourself as the **platform owner** (onboards further schools at `/platform/login`):
   ```sh
   npm run build && npm run owner:create -- you@example.com "Your Name"
   ```
   It prints a temporary password; sign in at `https://school-erp-ppe.onrender.com/platform/login` and change it. Testers can then try onboarding a second school there; once there are two schools, the school sign-in page offers "Signing in to another school?" for a school code (the demo school needs none).
5. **Uptime:** an HTTP(S) monitor on `https://school-erp-ppe.onrender.com/api/health`, every minute, expecting status 200 and the word `ok`.
6. Open `https://school-erp-ppe.onrender.com`, sign in as the Super Admin and change the password.

## Logins to give testers

All demo logins share `DEMO_PASSWORD` and do not have to change it. Keep the Super Admin for yourself.

| Role | Sign in with |
|---|---|
| Principal (School Admin) | `principal@demo.school` |
| Accountant | `accounts@demo.school` |
| Front office | `office@demo.school` |
| Teacher (Nursery A) | `teacher@demo.school` |
| Parent | `9000000001` (also `9000000002` to `9000000012`) |
| Student | an admission number in lower case, for example `ds0002` |

Testers share these logins, so one person's changes are seen by all. If a tester changes a demo password, reset it from *Settings, Users* (or the student page for parent and student logins), or reset the whole copy.

## Checks after the first deploy

- Sign in through the site; something that changes data (for example a notice) saves. This proves the cookie and the Origin check work through the `/api` rewrite.
- Upload a student photo; it appears in the bucket under `ppe/`.
- Each demo login sees what its role should.
- The "Test environment" strip and *Send feedback* show; `/api/docs` returns 404.
- The uptime monitor is green.

**If signing in fails through the rewrite** (Render's static-site proxy does not pass on the cookie or the `Origin` header), the fallback is for the API to serve the built web app itself, which keeps one free service and one address. Ask for it to be built.

## Updating

Merging to the deployed branch redeploys: the static site when `web/` changes, the API when `api/` changes (it applies new migrations as it starts). After a change that adds permissions, run the seed command from step 4 again (safe to repeat; it never renames the school or changes your password).

## Starting over

When the demo data has been messed up:

```sh
PPE_DATABASE_URL='postgresql://...neon.tech/school_erp_ppe?sslmode=require' \
SEED_SCHOOL_NAME='Heera English School (Test)' \
SEED_ADMIN_EMAIL='you@example.com' SEED_ADMIN_PASSWORD='a-long-temporary-password' \
DEMO_PASSWORD='choose-a-demo-password' \
deploy/ppe-reset.sh
```

It deletes everything in that database and fills it again. It refuses a database whose name does not contain `ppe`, and asks you to type the name back. Needs `psql` on your laptop.

## Locked out of the Super Admin

```sh
cd api && npm run build
DATABASE_URL='postgresql://...' npm run admin:reset-password -- you@example.com
```

Prints a new temporary password (works for 2 days, must be changed at sign-in) and signs you out everywhere. Audited as `auth.password_reset_cli`.

## Not set up for PPE

The daily jobs (`files:cleanup`, `homework:remind`) need Render cron jobs, which are paid. Run them by hand from a laptop if needed. There is no custom domain yet; the `onrender.com` address is used.
