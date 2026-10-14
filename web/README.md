# Flex Chicken web app

Phone-first site for Flex Chicken, Rainham: the loyalty card, the menu on a turning table, ordering, the kitchen screen and the delivery screen. Plan and status: [../PLAN.md](../PLAN.md).

## Run it

```bash
npm install
npm run dev          # http://localhost:3200
npm test             # unit tests (vitest)
npm run e2e          # phone-sized browser tests (Playwright; starts the dev server)
npm run menu         # rebuild app/lib/menu.generated.json from ../site-data
npm run build
node scripts/audit.mjs   # with the dev server running: every page, phone and desktop,
                         # checked for errors, sideways scroll and WCAG 2.2 AA (axe)
npm run shop         # production build, served to the shop Wi-Fi on port 3000 (browser store)
npm run preview      # database build on a local Worker + Durable Object, http://localhost:8787
npx playwright test -c playwright.cloud.config.mjs   # cross-device tests, with the preview running
npm run deploy       # database build, live on Cloudflare
```

## Deploys

The live site is **https://flexchicken.uk** (Cloudflare Worker `flexchicken`). Pushing to `main` on GitHub deploys it: Cloudflare Workers Builds is connected to the repo with root directory `web`, build command `node scripts/cloud.mjs build` (the database build) and deploy command `npx wrangler deploy`. `npm run deploy` from this folder does the same by hand. The shift codes and signing key are Worker secrets, so a deploy never changes them.

## Where the data lives

The live site (`npm run deploy`) keeps the shop's data in a database on Cloudflare: one Durable Object with SQLite storage (`server/`). Every phone, tablet and computer sees the same orders, cards, staff clock and menu, live. `npm run dev`, the tests and `npm run shop` keep using the **browser store** (localStorage, synced between tabs of one browser), which needs no setup.

- **Live updates:** each screen keeps a WebSocket to the server. The socket only says which topic changed; the screen then fetches it again and gets what its role may see.
- **Who sees what:** customers get only the orders their device placed (or a tracking link they open) and their own card. Drivers get delivery orders. The staff screen gets orders and cards without customers' emails. The owner's screens get everything. Staff clock PINs never leave the server.
- **Prices and fees** are worked out again on the server from the live menu, and the postcode is checked again with postcodes.io, so a changed browser cannot change what an order costs.
- **Order list PIN**: `/admin/order-list` asks for its own PIN on every visit, on top of the admin sign-in. It starts as `0000` (or the `LIST_PIN` Worker secret); change it on the order list page (current PIN, new PIN, confirm) or in Shift codes, where the owner's code also works if the PIN is forgotten. The server only sends or saves order lists with an 8-hour `fc_list` cookie issued under the current PIN.
- **Shift codes** for `/admin`, `/staff` and `/driver`: the owner changes them in **Admin → Staff → Shift codes** (current owner's code, then the new one twice; 4 to 8 digits). They are kept only as PBKDF2 hashes in the database. Until a code is changed there, the Worker secret stands (`npx wrangler secret put ADMIN_PIN`, `STAFF_PIN`, `DRIVER_PIN`; plus `SESSION_SECRET`). The staff code has no default: `/staff` stays closed until the owner sets it. The staff and driver codes must differ from the owner's code. The server checks them and gives the device an HttpOnly cookie for 30 days; changing a code signs out every device that used the old one. Five wrong codes lock that address out for a minute, and 30 wrong codes in an hour from anywhere pause sign-in for 15 minutes (devices already signed in carry on).
- **The staff clock** (`/clock`) works only on a tablet the owner has unlocked once with the owner's code; staff then clock in with their own PINs. Customers' devices cannot try PINs.
- **Limits per address:** 10 orders per 10 minutes, 30 new loyalty cards per hour.
- **Menu photos** the owner uploads are stored in the database and served from `/api/photo/...`.
- **Local preview:** `npm run preview` reads its codes from `.dev.vars` (never committed).

### Serving the shop tablet

`npm run shop` serves the app to every device on the same Wi-Fi. Find the computer's address with `ipconfig` (the Wi-Fi "IPv4 Address", e.g. `192.168.0.240`) and open `http://<that address>:3000/clock` on the tablet. The computer must stay on and running the command. If the tablet cannot connect, allow Node.js through Windows Firewall on private networks.

Clock records are kept in the tablet's browser, not on the computer, so open `/admin/staff` on the same tablet. Set your own shift codes in `.env.local` before running it, because anyone on the Wi-Fi can reach the admin pages.

## Screens

| Route | Who | What |
|---|---|---|
| `/` | Customers | Flex card (with its 4-digit member code), live offers under the card, category badges, turning table, Add to Box / Buy now, drinks, About, contact, "Download menu" |
| `/full-menu` | Customers | The whole menu on one printable sheet; "Save as PDF or print". Replaced by the owner's PDF once `BRAND.menuPdf` is set |
| `/checkout` | Customers | Sign in, delivery or collection, postcode check against the delivery zones (or "use my location", turned into a postcode), place order |
| `/track?id=…` | Customers | Order progress and the driver's live position |
| `/account` | Customers | Their orders |
| `/admin` | Owner | Home: two rooms, **Service** (orders, cards) and **Studio** (menu, offers, shop, staff), with live numbers and a card search |
| `/admin/orders` | Service | Order tickets in lanes: New, Kitchen, Ready, On the way, Done; today's order count and takings; "Sent out" for a driver without the app |
| `/admin/cards` | Service | Find a loyalty card by its 4-digit code, name or email; add a stamp, take one back, give the 9th-visit surprise; each card's history; download every signed-in customer's name, email and card code as an Excel file |
| `/admin/menu` | Studio | Search every dish, list what is sold out, edit, add and remove dishes, options, photos |
| `/admin/offers` | Studio | Offers on the website: percent off (order or chosen dishes), buy one get one free, or an announcement; start and end times, minimum order, pause. Money offers are applied to the Box (best one per order) |
| `/admin/shop` | Studio | Three panels. Right now: what customers see this minute, taking orders on/off, delivery on/off, delivery minimum, prep time. Opening hours: per day, closed days, closing after midnight (drive the "Open now" pill, footer and checkout). Delivery zones (name, fee, postcode list, and a distance that covers unlisted postcodes in the same districts). Receipt printer: the till's print dialog or the Epson network printer, its private link, setup steps and a test slip (see "Receipt printer") |
| `/admin/staff` | Studio | Add, edit and remove staff and their clock PINs; clock someone out; correct a shift's times (forgotten clock-out), marked "corrected" in the CSV; weekly hours with a CSV for payroll |
| `/admin/order-list` | Studio | Behind its own PIN (0000 until changed): lists of what to buy, item and quantity only; preview the A4 PDF, then download, share or open it; change the PIN (current, new, confirm) |
| `/staff` | Staff | The orders board from `/admin/orders`, behind the staff code: accept, cook, ready, collected or sent out, cancel, reprint receipts, new-order bell. No menu, prices, offers, team or shop settings |
| `/staff/cards` | Staff | The card desk from `/admin/cards`: find by code or name, stamp, take back, give the surprise. No emails and no customer download |
| `/driver` | Drivers | Take a ready order, share location, turn-by-turn directions in the page, call, mark delivered |
| `/clock` | All staff | Clock in and out with a personal 4-digit PIN; who is on shift now. Leave it open on the shop tablet |

On the live site the shift codes are Worker secrets (see "Where the data lives"). In dev and `npm run shop` they come from `.env.local` (defaults: admin `2580`, staff `3690`, driver `1111`). These defaults are public: never use them as the live codes. Clock PINs are personal and set by the owner in `/admin/staff`; five wrong PINs in a row lock the clock pad for 30 seconds.

## Security

- **Headers** are set in one place, `SECURITY_HEADERS` in `worker.js`, on every response (pages, API, photos). `npm run preview` serves through the same file, so local tests see the live headers; `npm run dev` does not send them.
- **Content-Security-Policy** (`CSP` in `worker.js`) lists every outside address the site may use: OpenStreetMap tiles (`img-src`), postcodes.io and the OSRM route server (`connect-src`). Add a new outside service there (the right directive for what it loads) or browsers block it. Scripts and styles allow inline code because Next.js writes each page's data into inline scripts; so there are no hashes to recompute. Keep `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and `frame-ancestors 'none'`.
- **Permissions-Policy** keeps location on for this site only (checkout and the driver screen need it). Card payments (Teya) may need `payment` turned back on.
- **Test after any header change:** start `npm run preview`, then `npx playwright test -c playwright.cloud.config.mjs --workers=1`. `e2e/security.spec.mjs` checks the headers and walks every page; every cross-device test also fails if anything is blocked (`e2e/security.mjs`). Ordering tests need the shop open by its saved hours.
- **Shift codes:** the owner's should be 8 digits, not a pattern or a date. Never commit `.dev.vars` or `.env.local`.

## Still a preview

- **Google and Apple sign-in:** the sheet is a clearly labelled preview that asks for a name and email, kept on the device. Until real login, a customer's order history is the orders placed from that device.
- **Staff accounts:** one shared shift code per screen (admin, driver) stands in for personal logins.
- **Card payment through Teya:** the checkout says to pay on delivery or at collection until it is connected.
- **Push notifications with the site closed:** need Web Push from the server.

## Receipt printer

Accepting an order prints the kitchen's ticket. Admin → Shop → Receipt printer picks how:

- **This screen's print dialog** (the default): the browser that tapped Accept prints the page (`app/lib/printer.js`). Run the till's Chrome with `--kiosk-printing` to skip the dialog.
- **Epson printer on the network** (live site only): an Epson TM-m30II or TM-m30III on the shop's network, set to **Server Direct Print**. Every 5 seconds the printer POSTs to `/api/printer?key=…`. The server answers with one queued receipt in ePOS-Print XML (`app/lib/receiptEpos.js`), and the printer reports back whether it printed (`server/printQueue.js`). Accept queues the ticket on the server, whatever screen tapped it. Nothing is paired with the till, and printing carries on while the till is locked.
  - The key in the link is random and only the owner sees it. A wrong key gets 403, and repeated wrong keys lock that address out for 5 minutes. **New link** replaces it, and the old link stops working.
  - Staff screens show "Printer ready", or a red notice when the printer has been silent for a minute or a receipt failed (out of paper, cover open...). Each failed receipt has a **Print again** button. Receipts wait while the printer is offline and are dropped after an hour. A receipt the printer took but never reported on is flagged after 90 seconds.
  - Setup steps are on the panel. If the test slip never prints, the printer may not trust the site's certificate: run **Root Certificate Update** in the printer's own settings page. Use `https://` in the link, because the site redirects `http`.
  - `e2e/printer.spec.mjs` plays the printer against `npm run preview`.

## Delivery tracking, for drivers

The driver's phone sends its position while the `/driver` page is open, location permission is allowed, and the driver has an order out. The page asks the phone to keep the screen on. If the browser is closed or the phone locks, updates stop until the page is opened again.

## Outside services

- **postcodes.io:** UK postcode to coordinates. Free, no key needed.
- **OpenStreetMap:** map tiles, used through Leaflet.
