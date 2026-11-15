# School ERP mobile app

Expo (SDK 58) and Expo Router, TypeScript strict. Family accounts (a student's login, used by the family) get the family tabs; accounts that can take attendance or enter marks get the teacher tabs; every other staff role is told to use the web app. The API is the same as the web app's, under `/api/v1`, with a bearer token and `X-Client: mobile` (see "Mobile readiness" in `school-erp-plan.md`).

## Run it

1. API (from `api/`, against your own database, never a shared one): `PORT=3104 node dist/main` (after `npm run build`), or `PORT=3104 npm run start:dev`.
2. App (from `mobile/`): `npm ci`, then `npx expo start --ios` (Expo Go is enough for now) or `npx expo start --android`.
3. The API address, in order: `EXPO_PUBLIC_API_URL`, then `extra.apiUrl` (same variable, via `app.config.ts`), then, in a development build only, `http://localhost:3104` (iOS simulator) or `http://10.0.2.2:3104` (Android emulator). On a real phone, set `EXPO_PUBLIC_API_URL=http://<your computer's LAN address>:3104`. A release build with no address refuses to call anything.
4. Demo logins (after `npm run seed:demo` in `api/`): students sign in with their admission number in lower case, for example `ds0002`; teachers with `teacher@demo.school`; all use `Demo@1234`.

Checks: `npm run typecheck`, `npm run lint` (oxlint), `npm test` (Jest, `jest-expo`, React Native Testing Library), `npx expo-doctor`.

## Layout

```
mobile/
  app/                     Expo Router: every file is a screen (keep it thin)
    _layout.tsx            providers, fonts, and which screens exist for whom (Stack.Protected)
    index.tsx              front door: redirects to sign-in / lock / change password / the right tabs
    (auth)/sign-in.tsx     sign-in
    add-account.tsx        sign in another account (modal)
    change-password.tsx    forced change of the temporary password
    locked.tsx             biometric lock
    unsupported.tsx        "use the web app for your role"
    family/                family routes, URL /family/...
      (tabs)/              Home, Homework, Messages, Timetable, More
      fees.tsx results.tsx attendance.tsx notices.tsx calendar.tsx
      report-absence.tsx notifications.tsx profile.tsx
    teacher/               teacher routes, URL /teacher/...
      (tabs)/              Today, Attendance, Messages, Homework, More
      marks.tsx my-leave.tsx my-attendance.tsx students.tsx notices.tsx
      notifications.tsx profile.tsx
  src/
    theme/                 tokens (colours copied from web/src/styles.css, light and dark), fonts, ThemeProvider
    ui/                    the UI kit (import from '@/ui')
    lib/                   money.ts (rupees, Indian grouping, no float maths), dates.ts (India time)
    api/                   client (bearer, X-Client, typed errors, 401 handling), query client, useApiQuery
    auth/                  accounts in secure storage, AuthProvider, biometric lock, role kind
    features/<feature>/    each feature's hooks and components
```

The role folders are `family/` and `teacher/` (real path segments), not the groups `(family)` and `(teacher)`: two groups would both claim `/`, `/homework`, `/messages` and `/more`, and a link could not tell them apart. Tabs and detail screens live inside, so the paths are `/family/homework`, `/teacher/marks` and so on.

## Rules that matter

- **Tokens only in secure storage** (`expo-secure-store`, this device only): one key per account (`token.<userId>`), plus the account list (id, name, role kind, photo id). AsyncStorage holds preferences only (theme, lock on or off, last school code).
- **Nothing about a child is written to disk.** TanStack Query keeps its cache in memory; do not add a persister. The cache is cleared when the account changes or signs out, and keys include the account id (`useApiQuery` does this for you).
- **A 401 signs out the account that made the request** (not whichever is showing now), and the app moves to another saved account or to sign-in. A 401 on sign-in, or on a request given its own `token`, never signs anyone out.
- The client never chooses a child or an id for access: the API decides what the token may see.
- Colour is never the only cue (badges are a dot and a word), touch targets are at least 44 pt, and text scales with the phone's font setting (capped at 1.5).

## Add a screen

1. Make a file in the right folder, for example `app/family/hand-in.tsx` (a pushed screen) or replace `app/family/(tabs)/homework.tsx` (a tab). Keep the route file small: `export default function Screen() { return <HomeworkScreen />; }`.
2. Put the real code in `src/features/<feature>/` (components, hooks). Fetch with `useApiQuery<T>('/homework', { query })`; send with `api.post(...)` from `@/api`. Build the UI from `@/ui` (`Screen`, `Card`, `ListRow`, `Badge`, `Sheet`, `EmptyState`, `ErrorState`, `Skeleton`...), and show money with `<Money amount="1500.00" />` and dates with `formatDay`, `formatClock`, `todayIST` from `@/lib/dates`.
3. A title for a pushed screen goes in the `TITLES` map in that folder's `_layout.tsx`; a menu entry goes in the `ITEMS` list of `(tabs)/more.tsx`. Those two are the only shared files a feature normally touches.
4. Placeholders use `ComingSoon` (`@/features/shell/ComingSoon`); delete its use when the real screen lands.
5. Add a test next to the code (`*.test.ts(x)`). Jest mocks secure storage, async storage and local authentication in `jest.setup.ts`.

Typed routes are off on purpose (many people add routes at once); links are plain strings such as `router.push('/family/fees')`.

## Builds

`app.config.ts` (name, scheme `schoolerp`, bundle ids `com.schoolerp.app`, light and dark teal splash) and `eas.json` (profiles `development`, `preview` (internal APK, iOS simulator build, points at the PPE test copy) and `production`). There are no secrets in either. The icons are placeholders (a graduation cap on teal) until the school's logo arrives. Push notifications, the Apple and Google store accounts and the production API address come later (M3, M6).
