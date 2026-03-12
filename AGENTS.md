# t-note-webapp Architecture Guide

This file is a technical map of the project.
It is written for both humans and coding agents to quickly understand where logic lives and how the app behaves.

## 1. Product Model

- Type: hybrid mobile app (React Native + WebView).
- Platform target: iOS + Android.
- Web backend host: `https://tro.posle.school` (see `constants/app-config.ts`).
- Native parts:
  - auth flow (phone -> code -> optional registration),
  - bottom menu shell,
  - push-notification routing entrypoint.
- Web part:
  - personal cabinet pages under `/traineronline/lk/*`.

## 2. Runtime Flow

1. App starts at `app/index.tsx`.
2. Session bootstrap:
   - read saved token from AsyncStorage (`services/session.ts`),
   - validate token via `/server/tro-auth/authInfo`.
3. If no valid session:
   - show native auth screens (`components/auth/*`).
4. If session is valid:
   - render WebView shell (`components/main/app-shell.tsx`),
   - inject auth storage for website auth state.

## 3. Main Entry Points

- `app/_layout.tsx`
  - root Expo Router stack.
  - currently routes only to `index`.

- `app/index.tsx`
  - app state machine:
    - booting,
    - auth step `phone`,
    - auth step `code`,
    - auth step `register`,
    - authenticated shell.
  - owns logout and session reset behavior.

## 4. Core Modules

### 4.1 Config and constants

- `constants/app-config.ts`
  - base URL,
  - API auth endpoints,
  - app colors,
  - default LK path,
  - native bottom menu map (`NATIVE_MENU_ITEMS`).

### 4.2 API and session

- `services/auth.ts`
  - typed calls for:
    - `request-code`,
    - `verify-code`,
    - `login`,
    - `register`,
    - `authInfo`.
  - central request/error handling.

- `services/session.ts`
  - persisted app session in AsyncStorage (`tnote-mobile-session-v1`),
  - helper for WebView auth storage injection (`auth-traineronline-storage`).

### 4.3 UI auth screens

- `components/auth/phone-step.tsx`
- `components/auth/code-step.tsx`
- `components/auth/register-step.tsx`

These are native screens and should stay aligned with product screenshots/UX.

### 4.4 Hybrid shell

- `components/main/app-shell.tsx`
  - WebView host,
  - bottom native menu,
  - URL sync between web navigation and selected menu tab,
  - external link interception (`tel:`, `mailto:`, `tg:`, `t.me`),
  - Android hardware back handling.

### 4.5 Hooks/utilities

- `hooks/use-push-notifications.ts`
  - push permission and token registration,
  - open LK path from notification payload `data.path`.

- `utils/phone.ts`
  - normalize/validate/format RU phone values.

- `utils/web-routes.ts`
  - URL/path normalization helpers,
  - menu key detection by route prefix.

## 5. Navigation Model

Bottom menu -> web route mapping:

- `sportsmens` -> `/traineronline/lk/sportsmens`
- `visits` -> `/traineronline/lk/visits`
- `payments` -> `/traineronline/lk/payments`
- `documents` -> `/traineronline/lk/documents`
- `more` -> `/traineronline/lk/more`

Keep this list in sync with website routing when backend/frontend changes.

## 6. Push Routing Contract

Expected notification payload:

```json
{
  "path": "/traineronline/lk/tariff"
}
```

The app opens and navigates WebView to this path.

## 7. Non-runtime folders

- `nero-requests/`
  - request notes,
  - screenshots,
  - HAR/chunk artifacts for reverse engineering.
  - not part of runtime.

- `components/themed-*`, `components/ui/*`, `constants/theme.ts`, etc.
  - leftovers from Expo template unless imported by current runtime path.

## 8. Build and checks

Commands:

- `npm install`
- `npm run start`
- `npm run lint`
- `npx tsc --noEmit`

## 9. High-impact files to review before edits

If behavior changes unexpectedly, inspect first:

1. `app/index.tsx`
2. `components/main/app-shell.tsx`
3. `services/session.ts`
4. `services/auth.ts`
5. `constants/app-config.ts`

## 10. Current architectural risks

- Website auth state is bridged via WebView localStorage injection, which is sensitive to website auth-storage format changes.
- Frequent `/traineronline/auth` redirects from site side can look like UI flicker in WebView.
- There are encoding artifacts in some Russian strings from prior edits; keep source files UTF-8 and verify visible text on device.

