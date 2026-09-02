# برنامه‌ریز من — Personal Planner PWA

یک برنامه‌ریز و زمان‌بند شخصی برای دانش‌آموز، با تمرکز روی یک سوال: **«الان چه کاری باید انجام بدهم؟»**

Fully offline-first, installable, Persian (RTL) by default. All data stays on the device (IndexedDB) — no backend, no account, no telemetry.

---

## Features

| Area | What you get |
| --- | --- |
| **Today** | Live clock, Persian date, current task («الان») + next task («بعدی»), day progress, timeline, upcoming/completed lists, quick add, habits strip |
| **Schedule** | Day and week agenda with grouped blocks, per-day stats, and a scrollable hour timeline |
| **Calendar** | Day / week / month views. Month shows task density + completion ratio per day; clicking a date opens its full schedule |
| **Tasks** | Full editor (name, date range, times, repeat, category, icon, color, priority, reminder, notes, occurrence limit), search + filters (category, priority, recurring, date range, status), archive |
| **Recurring** | Recurrence patterns grouped by type with a preview of the next occurrences. Completion history is stored separately from definitions |
| **Daily shift** | «جابه‌جایی برنامه» / «من بیدار شدم»: shift today's movable blocks by any number of minutes (fixed-time tasks never move), smart reflow around fixed anchors, before/after preview, conflict warnings, undo, reset — today only, recurring templates untouched |
| **Import / Export** | JSON import with **validate → preview → apply** (merge or replace), per-item selection, duplicate-ID detection, conflict detection, full export, in-app format documentation |
| **Habits** | Daily/weekday/weekend/custom habit tracking with a 14-day grid and streaks |
| **Statistics** | Completion rate, completed vs missed, planned/completed minutes, category distribution, weekday breakdown, streaks, focus time |
| **Focus** | Pomodoro 25/5, 50/10 or custom duration; sessions can be attached to a task and are logged locally |
| **Appearance** | Light/dark/system, 13 accent colors, font size, density, roundness, timeline style, visible sections, custom categories (name/color/icon) |
| **Reminders** | Browser notifications at start time or X minutes before, optional end notification, sound + vibration, permission handling with honest limitation notes |
| **PWA** | Web manifest, maskable icon, service worker with app-shell caching, offline fallback page, install prompt |

### Recurrence engine

`src/lib/schedule/recurrence.ts` is pure TypeScript with no React or DB dependency:

- `none`, `daily`, `weekly` (selected weekdays), `weekdays` (شنبه–پنجشنبه), `weekends` (جمعه), `even`, `odd`, `interval` (every N days), `monthly`
- `every` multiplier for daily/weekly/monthly (e.g. every 2 weeks)
- date-range limiting (`date` … `endDate`) and occurrence limits
- Persian week starts on **شنبه (Saturday)**

### JSON format (version 1)

Documented inside the app (Import/Export → راهنمای قالب) and in [`public/example-schedule.json`](public/example-schedule.json):

```json
{
  "version": 1,
  "timezone": "Asia/Tehran",
  "tasks": [
    {
      "id": "math-001",
      "name": "ریاضی - ویدیوی عقب‌افتاده",
      "date": "2026-09-03",
      "start": "08:30",
      "end": "09:30",
      "repeat": { "type": "daily" },
      "category": "study",
      "icon": "calculator",
      "color": "blue",
      "priority": "high",
      "reminder": { "enabled": true, "minutesBefore": 0 },
      "notes": ""
    }
  ]
}
```

Validation is strict (unknown keys and invalid enum values are rejected) and every semantic problem (bad date, end before start, duplicate ID, unknown color) is reported with a Persian message. A migration registry (`MIGRATIONS` in `src/services/importExport/schema.ts`) upgrades payloads to `CURRENT_SCHEMA_VERSION`.

---

### Dynamic daily schedule shift (late wake-up)

Every task has `fixedTime` (`false` by default). Fixed tasks (classes, exams, appointments) are immovable; everything else can shift.

A shift never touches a recurring template. It writes a single `DayOverride` record for one date:

```json
{ "date": "2026-09-02", "globalShiftMinutes": 67, "taskShifts": {}, "actualWakeUpMinutes": 547, "log": [] }
```

The occurrence builder (`buildDayOccurrences` / `buildRangeOccurrences`) applies overrides through `OccurrenceContext.dayOverrides`, so the Today timeline, calendar, statistics **and reminder times** all follow the shifted times automatically — tomorrow stays on its original schedule. Undo restores the exact previous state from a snapshot stored with each log entry; «بازگردانی امروز» deletes the day's override and leaves completion history intact.

Engine functions live in `src/lib/schedule/dayShift.ts` (pure, fully tested): `previewScheduleShift`, `applyScheduleShift`, `undoScheduleShift`, `resetDailySchedule`, `calculateWakeUpDelay`, `findPlannedWakeUp`, `detectScheduleConflicts`, `effectiveTaskShift`.

### JSON format (version 2)

Version 2 adds `fixedTime`, `dailyOverrides[]`, `dayOverrides[]`, `categories[]`, `settings` and `kind: "schedule" | "backup"`, plus tolerant field aliases (`title`→`name`, `from`/`startTime`→`start`, `to`/`endTime`→`end`, `fixed`→`fixedTime`, `until`→`endDate`, `colour`→`color`). Version 1 files still import through the migration registry; newer versions warn instead of importing blindly. The importer offers date/time transforms, category mapping, duplicate and ID-conflict handling, local backups with rollback, and import history — all offline.

## Architecture

```
src/
  app/
    (app)/                 # app shell + one route per screen
      page.tsx             # امروز
      schedule | calendar | tasks | recurring | habits
      import-export | stats | settings | appearance | focus
    api/health/route.ts    # lightweight health endpoint
    layout.tsx             # html[lang=fa-IR][dir=rtl], PWA metadata
  components/              # AppShell, Timeline, OccurrenceRow, UI primitives
  features/                # one folder per screen (UI only)
  hooks/                   # useSettings, usePlanner (data + clock + reminders)
  lib/
    date/                  # jalali conversion, ISO helpers, timezone, formatting
    schedule/              # recurrence engine, occurrences, lanes, stats (+ tests)
    constants.ts icons.tsx sampleData.ts utils.ts
  services/
    db.ts                  # Dexie database (lazy singleton)
    repositories.ts        # Task/Completion/Settings/Habit/Focus/Meta repositories
    importExport/          # zod schema, migrations, preview + apply service
    notificationService.ts # Notification API + SW notifications + scheduler
    useLiveData.ts         # reactive Dexie liveQuery hook
  types/
```

**Layering rule:** UI → hooks → services → storage. Scheduling logic never touches React or IndexedDB, so it is unit-testable and reusable.

### Replacing IndexedDB with a server later

All reads/writes go through `src/services/repositories.ts`. To add cloud sync, implement the same method surface against an HTTP API and swap the exported singletons — no component or scheduling changes needed.

### Offline behaviour

- `public/sw.js` precaches the app shell and runtime-caches `/_next/static`, with a network-first navigation strategy and `/offline.html` fallback.
- Tasks, completions, habits, focus sessions and settings live in IndexedDB (`planner-db`), so creating, editing, completing, importing and exporting all work with no network.
- Recurrence, Jalali calendar and timezone math are computed locally with no data files.

**Honest limitation:** browser notifications only fire while the browser/PWA (or its service worker) is running. If the app is fully closed, the notification for that exact moment is not delivered. This is stated in the Settings screen rather than hidden.

---

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

Tests (recurrence, odd/even days, weekly recurrence, date ranges, overlap lanes, JSON validation, import/export, completion history, timezone handling, repositories):

```bash
npx vitest run
```

> Note: the service/repository tests use `fake-indexeddb` so Dexie runs in Node.

Type checking: `npm run typecheck`.

## Deploying to Vercel

1. Push the repository to GitHub/GitLab.
2. In Vercel, **Add New → Project** and import the repo. The framework is detected as Next.js; no environment variables are required (the app is local-first and does not need a database).
3. Deploy. `next build` produces a static-friendly output; the only dynamic route is `/api/health`.
4. For the PWA install prompt and offline cache, serve over HTTPS (default on Vercel) — the service worker is registered from `/sw.js` at the root scope.

Optional: set `DATABASE_URL` only if you keep the `/api/health` database probe; the app works without it.

## Privacy

Task data never leaves the device. There is no analytics, no crash reporting and no third-party request other than the optional Google Fonts stylesheet for the Vazirmatn typeface (the app still renders correctly without it, using its system font stack).

## Keyboard & accessibility

- Skip link to main content, semantic landmarks, `role="switch"/"tablist"/"progressbar"`, `aria-pressed` toggles.
- Visible focus rings driven by `--accent`.
- Full keyboard support in the task editor modal (focus trap, `Esc` to close).
- `prefers-reduced-motion` disables all animation.
