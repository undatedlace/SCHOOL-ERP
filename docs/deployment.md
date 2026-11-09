# Deploying and backing up

Everything for a first deployment is in `deploy/`, `api/Dockerfile` and `web/Dockerfile`.
**These files have not been run yet** (no Docker was available when they were written); the backup
and restore scripts have been run against a real database. Do the checklist at the end on the first
deployment and fix anything it shows.

## What runs where

| Part | How | Notes |
|---|---|---|
| Web app + proxy | `web` container (nginx) | Serves the app and forwards `/api` to the API, so the browser sees one address and the session cookie is first-party. |
| API | `api` container (Node 24) | Runs as a non-root user. Swagger (`/api/docs`) is switched off in production. |
| Database | `db` container (PostgreSQL 18) | Not published to the network. Data is in the `pgdata` volume. A managed PostgreSQL (for example Amazon RDS in Mumbai) is better: set `DATABASE_URL` for the API and remove the `db` service. |
| Files | S3 bucket (`FILES_DRIVER=s3`) | See `docs/s3-setup.md`. Turn on **versioning** for the bucket so an overwritten or deleted file can be recovered. |
| HTTPS | In front of `web` | A load balancer, Caddy or similar ends TLS and forwards to port 80 with `X-Forwarded-Proto: https`. The session cookie is `Secure`, so the app does not work over plain http in production. |

## First deployment

1. Copy `deploy/.env.production.example` to `deploy/.env.production` and fill it in (a long random database password, the real `https://` address in `APP_ORIGINS`, the S3 settings). The file is ignored by git.
2. `cd deploy && docker compose --env-file .env.production up -d --build`
3. Create the tables: `docker compose --env-file .env.production run --rm api npx prisma migrate deploy --config prisma7.config.ts`
4. Create the roles and the first administrator (set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` for this one command): `docker compose --env-file .env.production run --rm -e SEED_ADMIN_EMAIL=you@school.org -e SEED_ADMIN_PASSWORD='a-long-temporary-password' api npx prisma db seed --config prisma7.config.ts`. The administrator must change the password at first sign-in.
5. Open the address, sign in, change the password, then set up the school (Academic setup, classes, staff, fees).

## Updating

`git pull`, then `docker compose --env-file .env.production up -d --build`, then run the migrate command from step 3 again (it only applies new changes). The seed is safe to run again after an update that adds permissions. Take a backup first.

## Backups

`deploy/backup.sh` writes a compressed dump, checks that it can be read, and removes backups older than 30 days. It needs `pg_dump` 18 on the machine that runs it.

```
DATABASE_URL='postgresql://school:PASSWORD@localhost:5432/school_erp' \
BACKUP_DIR=/var/backups/school-erp ./backup.sh
```

- Run it **every night** from cron, for example `30 1 * * * ...`. Backups sit in a folder only the owner can read.
- Keep a copy **off the server** (`BACKUP_S3_URI=s3://bucket/dir` uses the AWS CLI), in a different bucket from the uploaded files, with a retention rule. A backup kept only on the machine it protects is lost with the machine.
- With a managed database, also turn on its own automated backups and point-in-time recovery; use this script as an extra, portable copy.
- Uploaded files: with S3, versioning covers them. With `FILES_DRIVER=local`, set `FILES_DIR` and the script archives that folder as well.
- The dump contains children's data and money records. Treat the backup folder and any off-site copy as sensitive: restrict access and encrypt the bucket.

## Restore test (do this, then repeat weekly)

`deploy/restore-check.sh` restores the newest backup into a throwaway database and compares the row count of every table, and the total of all payments, with the live database. It prints `OK` or shows what differs and exits with an error. Run it right after a backup.

```
DATABASE_URL='postgresql://school:PASSWORD@localhost:5432/school_erp' \
BACKUP_DIR=/var/backups/school-erp ./restore-check.sh
```

**Restoring for real** (the live database is lost or damaged): create an empty database, then
`pg_restore --no-owner --dbname=postgresql://.../school_erp_new FILE.dump`, point `DATABASE_URL` at it, and run the migrate command (it applies anything newer than the backup). Practise this once on a spare machine before it is needed. Note what the school can lose: everything entered since the last backup, so for a school that records fees all day, a nightly backup plus point-in-time recovery on the managed database is the safer setup.

## Housekeeping to schedule

- Daily: `npm run files:cleanup` in the API (removes uploads that were never attached): `docker compose run --rm api node dist/cli/files-cleanup.js`.
- Weekly: the restore check above.
- Before launch: scan uploads with ClamAV (or the host's scanner); turn the Content-Security-Policy in `web/nginx-security-headers.conf` from report-only to enforced after checking the pages in a browser; set up uptime monitoring on `/api/health`.

## Checklist for the first deployment

- [ ] `docker compose build` succeeds for both images (not yet tried).
- [ ] The app opens over https, and signing in keeps you signed in (the cookie is `Secure`).
- [ ] `/api/docs` returns 404.
- [ ] A photo upload works (5 MB) and a 10 MB document upload works; 12 MB is refused.
- [ ] After a new build, an open browser picks up the update (the service worker files are served with `no-cache`).
- [ ] The first backup and restore check both pass.
