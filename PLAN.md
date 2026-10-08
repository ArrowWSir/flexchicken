# Flex Chicken: rebuild plan

This is a phone-first website for Flex Chicken, Rainham. A visitor sees the site in this order: their **loyalty card**, then a **grid of shiny circular category badges**, then the dishes of the chosen category **standing on plates on a turning wooden table**.

The rebuild is modelled on the Sicilian Pride app (`C:\Users\ASus\Desktop\Sicilian pride\sicilianpride`), which already solves three of the hard parts: the loyalty card, the staff counter, and a rotating 3D tray. We port those pieces; we don't reinvent them.

Status: **front end in progress.** Backend (Supabase loyalty sync), checkout and Teya payments come later. Real food photos come later; sample images stand in until then.

**Owner decisions (2026-10-05):** table motion = lazy-Susan ring (A) · stage opens in the same page · loyalty = 8 stamps, surprise reward on the 9th visit · a checkout site will follow, with payments through the owner's **Teya** account (details to come).

---

## Build status (2026-10-05)

The front end runs in `web/`; see [web/README.md](web/README.md) for commands and routes.

**More owner decisions:**
- **£15 minimum order for delivery** (not free delivery: the delivery fee always applies). Collection has no minimum.
- **Delivery zones by postcode** (owner's list, 2026-10-05): "within 1 mile" is 21 listed RM13/RM13 8/RM13 7 postcodes at **£1**; "within 2 miles" is **£2, strictly by distance** (owner, 2026-10-06): its list holds only one postcode in each of RM12, RM10 and RM9 (RM12 5AR 1.29 mi, RM10 9ED 1.44 mi, RM9 6DE 1.35 mi) so those districts count, because whole sectors reached past 2 miles. A postcode on neither list, inside a district the lists name (RM13, RM12, RM10, RM9), gets the zone its straight-line distance from the shop reaches (≤1 mile £1, ≤2 miles £2), so every Rainham street is covered and anything past 2 miles is collection only; distance never reaches other districts (Belvedere, across the river, is 1.7 miles as the crow flies). Anything else is collection only. Zones, fees, distances and postcode lists are editable in Admin → Studio → Shop & delivery.
- **Admin as two rooms (2026-10-06):** Service (orders, loyalty cards) and Studio (menu, offers, shop & delivery, staff), with a home dashboard at `/admin`.
- **Loyalty register (2026-10-06):** every card gets a random 4-digit member code (1000–9999, no leading zero) on the register (`lib/loyalty.js`); staff find it at `/admin/cards` and stamp, undo or redeem. Kept from VaffanCoffee: separate lifetime stamps, rewards, last stamp and last reward; undo floors at 0 and leaves the last visit alone; redeem only from a full card; a capped history per card; each change applied to the latest record (one SQL statement in the backend). Not repeated from it: an admin password in the browser bundle, a localStorage admin flag, and a database open to the anon key.
- **Offers (2026-10-06):** `/admin/offers` pushes offers shown under the loyalty card. Percent off and buy-one-get-one-free are applied to the Box, checkout and the order (best single offer per order; the delivery minimum counts the food after the offer), so the site never advertises a price it does not charge.
- **Menu download (2026-10-06):** "Menu" by the menu heading and "Download the full menu" in the footer open `/full-menu` (printable, save as PDF) until the owner's PDF is set as `BRAND.menuPdf`.
- **Trust and polish (2026-10-05):** a trust strip above the menu (100% Halal seal, 5.0 on Just Eat from 9 reviews, made fresh), the shop's own Halal seal in About (never says "certified" until `BRAND.halal.certificateUrl` is set), a shop-photo slot (`BRAND.shopPhoto`), an "Add to Box" flight into the Box button, and a jute mat under every plate (`table mat.jpg`).
- **No minimum spend** per stamp.
- Customers **sign in (Google or similar) to check out**.
- The admin has two sections: **Orders** (a kitchen screen with tickets) and **Menu & shop** (edit, add and remove items, plus settings).
- A separate **Delivery** panel lets drivers take a ready order at pickup and share their live location, so the customer can watch the driver come.
- Postcodes outside every delivery zone are flagged at checkout as collection only.
- A **staff clock** in its own panel (`/clock`): each person clocks in and out with a personal 4-digit PIN. The owner manages the team and reads weekly hours (with a CSV for payroll) under **Admin → Staff & hours**.

**Phone-first layout, changed from the wireframe with the owner's go-ahead:** on a phone the badges sit above the table as one 5 × 2 grid. The table takes the full width and still runs off the right edge. Contact is in the footer, and there is a short About section.

| Area | State |
|---|---|
| Customer site | Done. Menu, Flex card, Add to Box and Buy now, options sheet, checkout, tracking page, account page |
| Checkout | Done. Sign-in sheet (preview), delivery or collection, UK postcode lookup and "use my location", a map of the delivery area. The banner is green when we deliver, amber when the order is under the £15 delivery minimum (with "add more" or "collect instead"), and red when the address is outside the area (with a switch to collection). Then the fee and a payment note |
| Kitchen `/admin/orders` | Done. Lanes, tickets that age (amber at 10 minutes, red at 20), a chime and title flash for new orders, bump buttons, cancel; on phones the board follows a ticket to its next lane |
| Owner `/admin/menu` | Done. Taking orders on/off, delivery on/off, area, delivery minimum, fee, prep time; edit, add and remove items, sold out, options, photo upload |
| Driver `/driver` | Done. Ready, mine and cooking tabs, take an order, GPS sharing, screen kept awake, navigate, call, delivered |
| Staff clock `/clock` | Done. PIN pad, a confirm step ("Hi Ali · Clock in"), who is on shift now, lock after five wrong PINs |
| Owner `/admin/staff` | Done. Add, edit and remove staff, clock someone out, weekly timesheet with long-shift warnings, CSV download |
| Data layer | Local adapter (localStorage and BroadcastChannel) behind `lib/store/repo.js`. Screens sync live between tabs of one browser only |
| Tests | 153 unit tests. 14 Playwright phone tests, including customer, kitchen, driver and live tracking across three tabs, and the staff clock. `scripts/audit.mjs` checks all 12 pages on phone and desktop: no errors, no side-scroll, no WCAG 2.2 AA (axe) violations |

**Next phase: the backend (P7).** Swap in a Supabase adapter for orders, menu edits, settings, driver locations, the loyalty card, staff and shifts. Add real Google and Apple OAuth, staff accounts, Teya card payments, photo storage, and cross-device realtime.

**Waiting on the owner:**
- Teya account details.
- The Halal certificate.
- The allergen text, terms and privacy policy.
- Real food photos.

**Scene:** the plate is cut straight out of `plate 1.jpg`. The table top is the owner's own `wood finish.jpg`, used as one solid slab (centre square crop, colours untouched); the front edge is a darker, seamless strip of the same wood. The table and the plates turn the same way. Flame embers drift behind the customer pages.

**Branding:** the owner's official logo pack (`Flex-Chicken.zip`, unzipped to `brand-kit/`) is the source. The site uses its SVGs byte for byte: the colour wordmark on light grounds, and the designer's dark-ground version (flame in colour, white wordmark) on the red card, the footer and the staff screens, with no box behind it. Colours are the ones in the SVGs: FLEX red `#d92b2d`, CHICKEN coral `#f5845c`, flame `#fcc282` to `#e63e4b`. The `Logo-white.png` file on the old site belongs to another business, so it is not used.

---

## 1. What we reuse from Sicilian Pride

| Sicilian Pride piece | Flex Chicken use | Change needed |
|---|---|---|
| Next.js 16 + React 19 + Tailwind v4, deployed to Cloudflare Workers (`@opennextjs/cloudflare`) | Same stack | None |
| `lib/card.js`, `lib/staffStore.js`, `lib/cloud.js`, `lib/counter.js`, `lib/browserEnv.js` | Loyalty card logic, the offline ledger, and all database calls | Rename the `sp_` prefix to `fc_`; set the stamp count and reward from config |
| `supabase/schema.sql` (RLS closed, `SECURITY DEFINER` functions, deleted-card headstones, restore codes) | Loyalty backend | New Supabase project, `fc_` names. The owner runs the SQL once |
| `LoyaltyCard`, `CardActions`, `CardSpoiled`, `RewardReady` | The card UI | Flex branding: dark card, orange stamps, Flex icon |
| `/admin` (StaffLogin, PinGate, StampPanel, ScannerSheet, CounterQr) | Staff till: stamp cards, scan the QR, print the counter sign | Rebrand only. Keep it to stamping and QR |
| `menu/FlavourTray.js` (a round tray drawn in the browser, cups on a ring, spring physics, swipe and flick, depth blur) | Becomes the **TableStage** engine | Cups become plates with food; the tray becomes the oak table from `plate 1.jpg` |
| `useFlavourSlider`, `MenuStage`, `ThumbRail` | Title animation, item panel and thumbnail rail | Add price and options; Flex typography |
| `ui/Sheet.js`, `useFitText`, `pointer.js` | Unchanged | None |

Rules we carry over as they are:
- The database does the counting.
- Customers never log in.
- Polling, not Realtime.
- No `localStorage` access inside components.
- Every counter feature works in local mode too.
- No text below WCAG AA contrast.
- No layout breaks from 320px wide.

---

## 2. Page anatomy (owner's wireframe, 2026-10-05)

```
┌───────────────────────────────────┐
│ HEADER   logo · open pill · cart  │
│                                   │
│      ┌───────────────────┐        │   YELLOW: loyalty card,
│      │   LOYALTY CARD    │        │   centred, generous space around it
│      └───────────────────┘        │
│                                   │
│ ┌──────────┐           ╭──────────┼──╮
│ │ ◉   ◉    │         ╭─╯          │  │ GREEN: the round oak table with
│ │ ◉   ◉    │        │   TABLE +   │  │ plates. It sits on the right and
│ │ ◉   ◉    │        │   PLATES    │  │ runs off the page edge; the part
│ │ ◉   ◉    │         ╰─╮          │  │ outside the frame is cropped.
│ │ ◉   ◉    │           ╰──────────┼──╯
│ └──────────┘                      │   RED: shiny category badges,
│                                   │   a 2-column grid beside the table
│ ┌───────────────────────────────┐ │
│ │ item names rail · price ·     │ │   PURPLE: the chosen category's
│ │ qty − 1 + · Add to cart · Buy │ │   item names (sub-category rail) and
│ └───────────────────────────────┘ │   the selected item's actions
│                                   │
│ DRINKS   a row of drinks, each    │   Drinks are their own section,
│          with qty + add to cart   │   not a badge
│                                   │
│ INFO · FOOTER                     │
└───────────────────────────────────┘
/admin   staff till (sign in, stamp, scan, print counter QR)
/checkout  placeholder until the checkout site + Teya payment are built
```

- The page is one centred column on every screen size (the wireframe's frame). Outside it, the background continues as plain ground.
- **Every item** (dishes and drinks) can be added to the cart in any quantity, or bought straight away ("Buy now" adds it and goes to checkout). Items with required options (for example a meal's drink) open an options sheet first.
- **60-30-10** applies to colour *and* space: 60% cream ground and open whitespace, 30% dark roast objects (card, table, badges' rims, action bar), 10% Flex orange for actions, prices and stamps.

## 3. Sections in detail

### S1. Header
- Logo (`site-data/images/2026/07/FLEX-CHICKEN-Version-1-Colored_1.png`). The wordmark is "FLEX CHICKEN" and the tagline is "Rainham's local chicken shop".
- An **Open now / Closed** pill, worked out from the opening hours in `business.json` (12:00–23:00 daily, Europe/London time).
- A slot for the cart icon, empty until ordering is built.
- A sticky header with a thin brand stripe under it (orange to red), in the same way Sicilian Pride uses its tricolore stripe.

### S2. Loyalty card
- We port the card as it is. The front shows the stamp places, the member's name (or "Member") and a 4-character code. The back shows the Flex logo only. The card flips on every load.
- **Decided:** 8 stamp places. Once all 8 are filled, the **9th visit gets a surprise reward**. The card shows a 9th "mystery" place (gift icon, "Surprise") that unlocks when the card is full. Staff choose the reward at the till.
- The card is a **dark object on a cream page**: dark roast brown `#2d1c15` with a subtle texture. Filled stamps are orange discs carrying the Flex chicken icon. The final place shows the reward icon.
- The reward-ready state, the restore flow, the "card deleted" state, and the QR the till scans all come from Sicilian Pride unchanged.
- Data lives in Supabase, a new **Flex Chicken project**, with all names prefixed `fc_`.

### S3. Category badge grid
- There is one circular **shiny badge** per category. Each badge has:
  - a glossy enamel centre holding a sample dish image, or an icon until photos arrive;
  - a metallic ring made with a conic gradient (gold `#d6b36a` blending into orange);
  - a slow specular sweep that loops on idle and speeds up on hover or focus;
  - a slight 3D tilt toward the pointer on desktop;
  - the label underneath, with the item count.
- Tapping a badge selects its category and smoothly scrolls the stage into view. The table then turns to that category's first dish.
- The active badge gets a lit ring and a pressed state. Badges are buttons with `aria-pressed`, and the grid is a labelled group.
- With reduced motion turned on, there is no sweep, no tilt and no table spin.

**10 badge categories** (Drinks became its own section), taken from the live `/full-menu/` sections (`site-data/data/menu-sections.json`):

| # | Badge | Items | Source section |
|---|---|---|---|
| 1 | Chicken & Wings | 15 | `chicken-wings` |
| 2 | Chicken & Wings Meals | 6 | `chicken-wings-meals` |
| 3 | Burgers | 17 | `burgers` |
| 4 | Burger Meals | 14 | `burger-meals` |
| 5 | Box Meals | 6 | `box-meals` |
| 6 | Wraps & Peri Peri | 13 | `wraps-peri-peri` |
| 7 | BBQ & Ribs | 13 | `bbq-ribs` |
| 8 | Loaded Fries & Sides | 10 | `loaded-fries-sides` |
| 9 | Family Deals | 1 (+ "Flex Feast for Two") | `family-deals` |
| 10 | Kids & Boneless | 10 | `kids` |

The live site's "Most Popular", "Flex Signature", "Smash & Doner" and "Dips" have no sections behind them, so they are left out unless the owner wants them (Q4).

### S4. Menu stage: the turning table (the centrepiece)

**The scene, rebuilt from `plate 1.jpg`.** The photo is 920×736: a cream plate on a round oak table, an off-white wall behind it, and a camera about 35° above the table.

We rebuild it in layers. We don't use the flat photo itself, because a flat photo cannot turn. This is the same technique FlavourTray uses.

| Layer | What it is | How it is made |
|---|---|---|
| L0 Wall | Soft off-white wall with a gentle light falloff | CSS gradient sampled from the photo |
| L1 Table top | A large oak disc, flattened into an ellipse by the camera angle | A top-down oak texture inside a circle, styled `scaleY(tilt) rotate(θ)`. The grain visibly turns |
| L2 Table edge | The rim band at the front | The same method as FlavourTray's rim; the grain slides as the table turns |
| L3 Plates | A cream plate, cut out from the photo | One transparent PNG. A round plate looks the same at any rotation, so it only needs to move, scale and cast a contact shadow |
| L4 Dishes | One food cut-out per plate | A transparent WebP whose base sits on the plate's centre |
| L5 Light | A soft window light from the upper left, and contact shadows | Shadows fall to the right, as in the photo |

**Motion model (decided: "lazy Susan").** All the dishes of the chosen category sit on their own plates in a ring near the edge of one big round table. The selected dish is on the plate nearest the camera, at front centre. Its neighbours show at the sides and further back, smaller, dimmer and slightly blurred.

Swiping or pressing the arrows turns the **whole table**: the grain, the plates and the dishes together. The next dish comes round to the front. This is FlavourTray's maths with cups swapped for plates: perspective scale, depth blur, motion blur while turning, spring physics and flick projection.

**Switching category.** The table makes a quick turn while the old set of plates dims away and the new set rides in, so the switch has motion behind it rather than a jump. With reduced motion, the dishes simply cross-fade.

**Item panel (below the stage).**
- The name, as a two-line title (a light line and a bold line), animated the way `useFlavourSlider` does it.
- The **price** (£, 2 decimals).
- The description.
- The **options**, read-only for now: for example "Choose drink: …" or "Add cheese +£0.39". This data is already parsed in `products.json`.
- A badge such as "Meal: fries + drink".
- An "Add to Flex Box" button. It is wired to a front-end cart now; the checkout site and Teya payment come later.

**Thumb rail.** Small round thumbnails of every dish in the category, with ‹ › buttons. Tapping one turns the table to that dish.

**Performance.** Positions are written to `style` on each animation frame, never through a React render per frame. Only `transform`, `filter` and `opacity` change. Dish images are lazy-loaded per category, and the first category's images are preloaded.

### S5. Info
These cards draw from `site-data/data/business.json` and `homepage.json`:
- Opening hours.
- Delivery: up to 3 miles, free over £20 within 2 miles. Q6 asks the owner to confirm the £20 figure.
- Address with a map link.
- Phone.
- The **100% Halal** badge.
- "5/5 on Just Eat · 9 verified reviews", linking to the listing.
- Instagram.
- "Why Flex": four short points.

### S6. Footer and other pages
- Legal pages: `/terms`, `/privacy`, `/allergens`. They start as placeholder pages because the owner must supply the text, and UK food law needs the allergen page.
- `/halal`, for the certificate image (Q7).
- JSON-LD for the Restaurant (address, geo, hours), meta tags and Open Graph, carried over from the live site.

### S7. `/admin`: staff till
Ported from Sicilian Pride and rebranded:
- Sign in.
- Stamp a card, by code or by scanning its QR.
- Redeem the reward.
- Restore code for a lost phone.
- Delete a card.
- Download and print the counter QR sign.

---

## 4. Data

`site-data/` is the source. A build script turns it into the app's menu module:

```
site-data/data/products.json + menu-sections.json
        │  scripts/build-menu.mjs   (dedupe, fix names, drop junk, map categories)
        ▼
web/app/lib/menu.generated.json   ← committed, never edited by hand
web/app/lib/menu-overrides.js     ← hand edits: titles split light/bold, badge text,
                                    hide/show, image ids, sort order
web/app/lib/menu.js               ← merges the two, exports CATEGORIES, getCategory()
```

The cleanup applied by the script is taken from `site-data/README.md`:
- Drop the "Product" item at £0.
- Dedupe "Chicken Wrap", "Spicy Chicken Wrap" and "Large Popcorn Chicken". Which price wins is Q8.
- Rename "Onion Ringas" to "Onion Rings" and "BBQ iTems" to "BBQ Items".
- Flag the BBQ Wings x12 price for the owner to check.

Item shape:

```js
{ id, slug, categoryId, name, titleLight, titleBold, price, description,
  options: [{ label, required, choices: [{ label, priceAdd }] }],
  image: "/menu/{slug}.webp" | null, isMeal, sortOrder }
```

Brand facts (name, address, phone, hours, links) go in `lib/brand.js`, generated from `business.json`.

---

## 5. Assets

| Asset | Status | Spec |
|---|---|---|
| Logo, icon, white logo | Have (`site-data/images/2026/07/`) | Convert to WebP and SVG if a vector exists (ask the owner) |
| Plate | Have (`plate 1.jpg`) | Cut out to a transparent PNG at 1024px wide; keep the plate's own shading |
| Oak table texture, top-down | To make | A **seamless top-down oak texture** at 2048², matched to the photo's tone. Either unwarp the table in the photo (a perspective rectify script in `assets-src/`) or source a CC0 texture and colour-match it |
| Wall | To make | A gradient sampled from the photo: `#ecebe7` top to `#d9d6d1` bottom (to be checked by eye) |
| **Food cut-outs** | **Owner supplies later.** Samples for now | Transparent WebP, 1024×1024, **camera about 35° above** (to match the plate photo), dish centred, lowest point at 92% of the height, soft light from the upper left, no plate in the shot (we draw the plate) |
| Sample food (now) | To make | Cut out existing site photos with `rembg` (`site-data/images`, 42 products have photos). Dishes without a photo get a neutral silhouette placeholder |
| Badge art | To make | Either a sample dish photo per category or an icon set; 512px source, shown at 72–96px |

When the owner's photos arrive, we drop them into `web/public/menu/{slug}.webp` with no code change.

---

## 6. Design system (to be finalised from the owner's structure)

The direction is a **warm cream counter carrying dark, glossy objects**. Sicilian Pride uses the same 60-30-10 discipline, here in Flex colours:
- **60%: cream ground**, `#fff7f2` and `#f4eee6`, which matches the photo's wall and plate.
- **30%: dark roast** `#2d1c15` and oak brown: the loyalty card, the active badge and the footer.
- **10%: Flex orange** `#ff6310`, with red `#b71918` for calls to action, stamps and price highlights.
- Fonts: Poppins (the live brand font) for the UI, plus one bold display face for dish titles, to be chosen from the owner's structure.
- Colours are tokens under `@theme` in `globals.css`, with no raw hex in components. Neutrals belong to one OKLCH family.

---

## 7. Folder layout

```
flexchicken/
  PLAN.md                 ← this file
  plate 1.jpg             ← scene reference
  site-data/              ← extracted live-site data (done)
  assets-src/             ← texture rectify script, plate cut-out, rembg samples
  web/                    ← the Next.js app
    app/
      page.js, layout.js, globals.css, manifest.js
      admin/page.js
      api/qr/route.js
      components/
        Header.js, InfoSection.js, SiteFooter.js
        card/      LoyaltyCard, CardActions, CardSpoiled, RewardReady
        badges/    BadgeGrid, ShinyBadge
        stage/     TableStage (engine), MenuStage, ItemPanel, ThumbRail
        admin/     StaffLogin, PinGate, StampPanel, ScannerSheet, CounterQr
        ui/        Sheet
      hooks/       useDishSlider, useFitText, useOpenNow
      lib/         card, staffStore, cloud, counter, supabase, browserEnv,
                   menu(.generated.json, -overrides), brand, hours, pointer
    public/menu/   dish cut-outs
    public/scene/  plate.png, wood-top.webp, wood-edge.webp
    public/brand/  logo, icon, card faces
    supabase/      schema.sql, SETUP.md
    scripts/       build-menu.mjs
```

---

## 8. Build phases

Each phase ends with a build that passes, `npm test` passing, and a check at 320 / 768 / 1024 / 1440 px.

| Phase | Work | Done when |
|---|---|---|
| **P0 Setup** | Scaffold `web/` from Sicilian Pride's config: Next, Tailwind v4, vitest, wrangler, opennext. Add the design tokens. Write `build-menu.mjs` and generate the menu module | The app runs; the menu module has 11 categories and about 100 clean items; menu tests pass |
| **P1 Shell** | Header with the open/closed pill (`hours.js`, tested), page layout, footer, info section, SEO/JSON-LD | The static page shows real business info; axe reports 0 violations |
| **P2 Loyalty card** | Port the card libraries and tests (rename to `fc_`), the card components, the Flex card design and local mode | The card works offline in local mode; the ported tests pass |
| **P3 Badge grid** | ShinyBadge (ring, gloss, sweep, tilt, states) and BadgeGrid (selection and scroll to the stage) | Keyboard and screen reader work; reduced motion is respected; layout holds at 320px |
| **P4 Scene assets** | Plate cut-out, oak texture, wall gradient, sample food via rembg plus placeholders | All assets in `public/scene` and `public/menu` |
| **P5 TableStage engine** | Port FlavourTray as TableStage: table top and edge, plates, dishes, shadows, light, swipe, flick, spring, tap to select, category switch | 60fps on a mid-range phone; no overlap glitches; reduced motion falls back to a cross-fade |
| **P6 Item panel + rail** | Title animation, price, description, options list, Order button, thumb rail | Every item shows the correct price and options from the data |
| **P7 Backend + till** *(later)* | Supabase `fc_` schema, SETUP.md for the owner, `/admin` port, counter QR | The phone and the till agree on stamp counts; redeem and restore work |
| **P8 QA + deploy** | Playwright e2e (card, badge to stage, swipe), visual snapshots, Lighthouse (LCP < 2.5s), deploy to a Cloudflare `workers.dev` preview | A preview URL is shared with the owner |
| **P9 Real photos** | Swap in the owner's food cut-outs and tune the plate and dish scale | No code changes beyond the overrides |

The cut-over of the live domain from WordPress happens after the owner signs off on the preview. Until then the WordPress ordering keeps running.

---

## 9. Later features (backlog, not in this build)

- Checkout site: "Flex Box" cart, option pickers, delivery or collection, payment through **Teya** (owner to provide the account details).
- Delivery-radius check by postcode.
- Order tracking, and the kitchen printer (Printerco) bridge.
- Stamps awarded automatically from online orders.
- Owner menu editor (prices, sold-out toggle).
- "Most Popular" and "Flex Signature" curated badges.
- PWA push for "your reward is ready".

---

## 10. Open questions for the owner

| # | Question | Default if no answer |
|---|---|---|
| Q1 | ~~Loyalty stamps and reward~~ **Answered:** 8 stamps, surprise reward on the 9th. Still open: is there a minimum spend per stamp? | One stamp per order |
| Q2 | ~~Table motion~~ **Answered:** A, the lazy-Susan ring | – |
| Q3 | ~~Where the stage opens~~ **Answered:** in the same page | – |
| Q4 | Keep or add the "Most Popular", "Flex Signature", "Smash & Doner" and "Dips" badges? | Leave them out |
| Q5 | ~~Order button~~ **Answered:** a new checkout site with Teya payments, built later | Front-end cart only for now |
| Q6 | ~~Free delivery threshold~~ **Answered:** over £15 | – |
| Q7 | Halal certificate file, plus T&Cs, privacy policy and allergen information | Placeholder pages |
| Q8 | Duplicate items with different prices: which price is right? | The higher price, flagged |
| Q9 | Is a vector (SVG) logo available? | Use the PNG |
