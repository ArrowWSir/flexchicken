# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Phone-first website for Flex Chicken (Rainham): loyalty card, a menu shown as dishes on a turning table, ordering/checkout, kitchen screen, driver screen, staff clock, and an owner admin. The app lives in `web/`; the repo root holds source material only (`site-data/` scraped from the old WordPress site, `brand-kit/` logos, `assets-src/` Python image scripts, reference photos). `../PLAN.md` holds the owner's decisions and build status; read it before changing business rules (delivery zones, minimums, loyalty). `README.md` lists every route and who uses it.

Plain JavaScript (no TypeScript), Next.js 16 App Router, React 19, Tailwind v4, deployed to Cloudflare Workers via OpenNext. Path alias `@/*` → `web/*`.

## Commands (run in `web/`)

```bash
npm run dev                 # http://localhost:3200
npm test                    # vitest, app/**/*.test.js
npx vitest run app/lib/cart.test.js          # one file
npx vitest run -t "name of the test"         # one test by name
npm run e2e                 # Playwright, Pixel 7 profile; starts/reuses the dev server on 3200
npx playwright test e2e/order.spec.mjs -g "badge switches"   # one e2e test
npm run build
npm run menu                # regenerate app/lib/menu.generated.json from ../site-data
node scripts/audit.mjs      # with dev running: every page at 5 viewports, errors + sideways scroll + axe WCAG 2.2 AA → .shots/audit/
npm run shop                # prod build served on 0.0.0.0:3000 for the shop tablet
npm run preview             # database build on local Worker + Durable Object, :8787 (codes in .dev.vars)
npx playwright test -c playwright.cloud.config.mjs   # cross-device e2e against the running preview
npm run deploy              # database build, live on Cloudflare
```

No lint script. Screenshots and audit output go to `.shots/` (git-ignored).

## Architecture

**Data layer: one repo, two adapters.** Every screen reads and writes shop data through `getRepo()` (`app/lib/store/index.js`). `repo.js` holds the domain operations (orders, settings, menu edits, session, staff/shifts, loyalty cards, promotions, stamp tokens) on top of a store with `read / write / subscribe`. The adapter is chosen at build time by `NEXT_PUBLIC_STORE`:
- `cloud` (set by `npm run deploy` / `npm run preview` via `scripts/cloud.mjs`): `cloud.js` caches topics from the server (`GET /api/shop/state`), sends actions to `POST /api/shop/call`, and refetches when the WebSocket (`/api/shop/live`) names a changed topic. The customer's session stays on the device.
- otherwise (dev, Playwright, `npm run shop`): `local.js`, localStorage (`fc_store_` prefix) plus a BroadcastChannel, wrapped by `withAsyncActions`.

In both, reads are synchronous from cache and **actions return promises** (`ASYNC_ACTIONS` in index.js): always `await` them and show the error. Use `repo.isReady(topic)` / `isOrdersLoaded` rather than treating a loading list as empty. Components must not touch localStorage for shop data directly. `getRepo()` is client-only.

**Server (`server/`, Cloudflare).** `worker.js` sends `/api/*` to one Durable Object (`server/shopObject.js`, SQLite storage, location hint weur) and everything else to the OpenNext build. `api.js`: routes, the `{ ok, data, error }` envelope, CSRF (`X-Flexchicken: 1` header + Origin), body cap, staff login with HMAC-signed HttpOnly cookies (`auth.js`), PIN lockouts. `shopCore.js` runs the same `createRepo` with per-action roles (public / driver / admin) and per-role read views; an action is an async `prepare` (network, e.g. the postcode re-check) then a sync `run` inside one SQLite transaction, which keeps stamps, redeems and order numbers atomic. `checks.js` cleans every input; `app/lib/reprice.js` re-prices carts from `app/lib/liveMenu.js`. `sqlStore.js` keeps one row per list item (orders, cards, shifts...) and photos as BLOBs. Secrets: `ADMIN_PIN`, `DRIVER_PIN`, `SESSION_SECRET` (`wrangler secret put`; `.dev.vars` for the preview). A new repo action needs an entry in `ACTIONS` in shopCore (role and input checks), in `cloud.js`, and in `ASYNC_ACTIONS`.

**Reading data in components:** `app/hooks/useShop.js` → `useRepoValue(topic, read, initial)` subscribes to a `TOPICS` key and re-reads on change. Server render and first client render use `initial` so markup matches; pages are essentially client-rendered around the store. Hooks like `useMenu`, settings, orders, staff build on it.

**Business logic is pure and tested in `app/lib/`.** Cart, orders, promotions, delivery zones, postcodes, hours, loyalty, timeclock, tracking, navigation, receipts each have a `*.test.js` next to them. Functions return new values (no mutation); validation lives here, not in components. Money is integer pence.

**Menu pipeline (three layers, merged in `useMenu`):**
1. `scripts/build-menu.mjs` + `app/lib/menuBuild.js` (rules) + `app/lib/menuBoard.js` (printed board) turn `../site-data/data/products.json` and `menu-sections.json` into `app/lib/menu.generated.json`. Never hand-edit the generated file.
2. `app/lib/menu-overrides.js`: hand copy/display tweaks keyed by slug.
3. Owner edits from `/admin/menu`, stored in the repo (`menuEdits.js`: updated / removed / added / soldOut), applied at runtime so regenerating the menu keeps them.

Dish images are `public/menu/{slug}.webp`, transparent, dish base at 92% height (spec in `../assets-src/make_food.py` and PLAN.md §5). Dropping in a file with that name needs no code change; rerun `npm run menu` so `image` is set.

**Settings** (`app/lib/settings.js`): defaults merged with saved values by `readSettings`, dropping anything malformed. Delivery zones, opening hours, minimum order, prep time are owner-editable in `/admin/shop`. Business facts (address, phone, geo, Just Eat, Halal, `menuPdf`, `shopPhoto`) are in `app/lib/brand.js`.

**Admin** is two "rooms" defined in `app/admin/sections.js`: Service (orders, cards) and Studio (menu, offers, shop, staff). `/admin` and `/driver` sit behind `components/staff/StaffGate.js` via `lib/store/staffAuth.js`: in cloud builds the server checks the shift code and sets a cookie; in local builds the code is compared in the browser from `NEXT_PUBLIC_ADMIN_PIN` / `NEXT_PUBLIC_DRIVER_PIN` (defaults 2580 / 1111). `/clock` uses per-staff PINs managed in `/admin/staff`, checked on the server in cloud builds.

**Still preview:** Google/Apple sign-in (a name+email sheet kept on the device), personal staff accounts (shared shift codes), Teya card payment (checkout says pay on delivery/collection), Web Push. Don't present these as real.

**Outside services:** postcodes.io (no key) and OpenStreetMap tiles via Leaflet/react-leaflet.

## Conventions

- Design tokens are in the `@theme` block of `app/globals.css` (cream ground, roast browns, Flex red, coral, gold, `go` green), each with contrast notes. Use tokens, no raw hex in components. 60/30/10 cream / roast / red. Fonts: Montserrat (headings, matches the wordmark) and Poppins (body).
- Phone first. Check 320 / 375 / 768 / 1024 / 1440; no horizontal scroll; axe should report zero violations (`scripts/audit.mjs`).
- User-facing copy is plain British English written for the shop's customers and owner. Comments explain *why* in the same voice.
- e2e tests clear localStorage in `beforeEach`; shared steps go in `e2e/menu.mjs` (not a spec). Dev query params such as `/?stamps=3` set up card state.
