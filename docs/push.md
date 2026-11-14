# Push notifications (backend)

The phone app gets a push message when something new lands in its inbox. This page is about the server side. The app side (asking permission, getting the token, opening the right screen) is built separately.

## How it works

1. The phone app signs in and calls `POST /api/devices` with its Expo push token. A person may have several devices.
2. Any feature tells a person something through `NotificationsService.notify` / `notifyPermission`. That writes the inbox row as before. In the same write, the row is marked `push_status = PENDING` with `push_at = now` for people who have at least one device, and `NONE` for people who have none. (One extra query looks up the devices of everyone in the call.)
3. Right after the write, the server starts sending what is due, in the background. It never waits for it and never fails the feature that called it: a problem is only written to the log.
4. The sender reads due `PENDING` rows, finds each person's devices, builds one message per device and hands them to the chosen driver.

`push_status` values: `NONE` (no device, or nobody can receive it any more, or it was already read in the app by the time it was due), `PENDING`, `SENT` (at least one device accepted it), `FAILED` (gave up).

A feature that wants to hold a push back (quiet hours) sets `pushAt` (a `Date`) on the `NewNotification`. The inbox row appears at once; only the push waits.

## What a push contains

Pushes travel through other companies' servers and show on a locked screen, so **a push never contains the notification's own title or body, or any name, mark or amount.**

- `title`: a generic text chosen from the notification **type** only (`api/src/modules/push/push-text.ts`): `message.*` is "New message", `homework.*` "Homework update", `leave.*` and `student_leave.*` "Leave update", `assessment.*`, `result.*` and `results.*` "New results", `fee.*` and `fees.*` "Fees update", `notice.*` "New notice", `timetable.*` "Timetable update", anything else "School update". Add a line to that file when a feature adds a new type.
- `body`: always "Open the app to read it."
- `data`: `{ notificationId, link }` so the app can open the right screen after sign-in and mark the message read.

`buildPushMessage` takes only the id, type and link, so the real text cannot get in by accident. A unit test and an end-to-end test guard this.

## Retries

- A failed try (the push service answered with an error, or could not be reached) keeps the row `PENDING` and moves `push_at` forward by **1 minute, then 5, then 30**. After those three retries (four tries in all) the row becomes `FAILED` and is not tried again. `push_attempts` counts the failed tries.
- `DeviceNotRegistered` (the phone uninstalled the app or the token expired) **deletes that device**. If every device of a person is gone, the row becomes `NONE`. If one device took the message and another is gone, it is `SENT` and only the dead device is removed.
- A push still waiting 24 hours after the notification was written is dropped (`FAILED`); an old "New message" helps nobody.
- Two runs at the same time never send a message twice: each run takes a Postgres advisory lock for a moment, claims the due rows and leases them for 5 minutes. If a run crashes in the middle, the leased rows are tried again after the lease.

## Switching on

| Variable | Meaning |
|---|---|
| `PUSH_DRIVER` | `off` (default; nothing is marked or sent), `log` (writes the last 6 characters of the token and the title to the log, nothing else), `expo` (sends through Expo's push service). Tests always use `off` unless a test injects a fake sender. |
| `EXPO_ACCESS_TOKEN` | Sent as `Authorization: Bearer ...` to Expo. Optional but recommended. A secret: never commit it. |
| `PUSH_WORKER` | `on` starts a timer inside the API process that sends due pushes every 60 seconds. Leave it empty if you use cron. |

Delayed and retried pushes need something to run every minute. Either:

- set `PUSH_WORKER=on` (simplest; fine with one API instance and also safe with several, because of the lock), or
- run `npm run push:send-due` every minute from cron (after `npm run build`), for example `* * * * * cd /app/api && npm run push:send-due`, or in Docker `docker compose run --rm api node dist/cli/push-send-due.js`. It prints how many were sent, retried, failed and dropped.

The first push of a notification is sent at once, from the request that created it; the worker or cron only handles the held-back and retried ones.

## Devices and signing out

- `POST /api/devices` accepts an Expo push token (`ExponentPushToken[...]` or `ExpoPushToken[...]`) for `IOS` and `ANDROID`. For `WEB` any token is accepted (a different format).
- **`POST /api/auth/logout` does not delete the device.** The app calls `DELETE /api/devices/:id` itself before it signs out, so a signed-out phone stops getting pushes. If the app forgets, the person on that phone would still get generic pushes ("New message") but nothing private; the push service reports a dead token later and the device is removed then.
- A token belongs to one person at a time: registering it again after another person signs in on the same phone moves it.

## What you need to do to go live

1. Create an Expo account (expo.dev) and the project that the app is built under.
2. Android: create a Firebase project, add the Android app, and upload the FCM service account key (V1 API) to EAS credentials (`eas credentials`).
3. iOS: an Apple Developer account and an APNs key; let EAS create or upload it (`eas credentials`).
4. In Expo, create an access token (Account settings, Access tokens) and, if you like, turn on "enhanced push security" for the project.
5. Set `PUSH_DRIVER=expo` and `EXPO_ACCESS_TOKEN=...` on the server, and either `PUSH_WORKER=on` or the cron line above. Restart the API.
6. Test with one real phone: sign in, check `GET /api/devices` lists it, then trigger a notification (for example a leave request) and watch for the push.

Until then keep `PUSH_DRIVER=off` (or `log` to see what would be sent). Nothing leaves the server in either case.
