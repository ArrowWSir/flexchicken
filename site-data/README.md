# Flex Chicken: data extracted from the live site

Source: https://flexchicken.co.uk/ (WordPress 7.1 + WooCommerce 11.1 + Blocksy Pro theme). Extracted 2026-10-04.

## Use these files for the rebuild (`data/`)

| File | Contents |
|---|---|
| `business.json` | Name, legal name, address, geo, phone, email, opening hours, delivery rules, payment methods, Halal claim, Instagram, Just Eat rating, SEO meta, brand asset paths |
| `homepage.json` | Every homepage section in order: hero, category strip, halal badge, offers, most popular, why Flex, reviews, delivery info, rewards, closing CTA. Also the header nav and footer |
| `products.json` | All 106 products: id, name, slug, price, description, categories, images (local paths), stock, and the **options** (required/optional radio groups, choices, extra prices) |
| `menu-sections.json` | Sections of the `/full-menu/` ordering page, with product IDs in display order, plus the category pill nav |
| `menu.md` | Human-readable version of the full menu (sections → items → price, options, whether a photo exists) |
| `categories.json` | The 18 WooCommerce product categories |
| `pages.md` | Copy for About and Contact (including the contact form fields), how the menu and product pages behave, and a list of empty or placeholder pages |
| `design-tokens.json` | Current colours, fonts, radii and UI wording ("Flex Box", "Add to Box") |
| `images.json` | Manifest of the media library: id, title, alt, size, local path |

Other folders:
- `images/`: 209 original full-size images (about 95 MB) from `wp-content/uploads`, with the same year/month paths. Logos are in `images/2026/07/` (`FLEX-CHICKEN-Version-1-Colored_1.png`, `FLEX-CHICKEN-Icon-Colored_1.png`). **Warning:** `Logo-white.png` is *not* Flex Chicken; it is another business's logo ("Ambia's Beauty") left in the media library. Do not use it. The files in `images/2021/` and `images/2022/` are leftovers from the theme demo (a pizza doodle and other demo logos), not Flex Chicken branding.
- `reference/`: CSS from the live site (`live-custom.css` is the custom homepage and menu styling; `live-global-styles.css` is the WordPress global styles).
- `raw/`: untouched downloads: REST API JSON (`raw/api/`), HTML of all 175 public URLs (`raw/html/`), and the theme and plugin CSS (`raw/css/`).
- `_scripts/`: re-run `python _scripts/01_download.py && python _scripts/02_build.py && python _scripts/03_menu_md.py` to refresh everything.

## Key facts

- **Address:** 107 Upminster Road South, Rainham, RM13 9AA
- **Phone:** 020 3837 6035
- **Email:** info@flexchicken.co.uk
- **Hours:** daily, 12:00–23:00
- **Delivery:** up to 3 miles. Delivery is free over £20 within 2 miles. Collection is also available.
- **Payment:** card, Apple Pay, Google Pay
- **100% Halal**
- **Rating:** 5/5 on Just Eat (9 reviews)
- **Instagram:** @flexchickenrainham
- **Brand colour:** orange `#ff6310`, with red `#b71918` and a warm brown/cream palette. **Font:** Poppins.

## Data issues found on the live site: fix in the rebuild

1. **Missing photos:** 64 of 106 products have no image (the live site shows a placeholder). `menu.md` marks them with **no** in the Photo column.
2. **Empty pages:** `/halal-certification/` and `/terms-and-conditions/` have no content. The owner needs to supply the certificate and the T&Cs.
3. **Missing legal pages:** there is no privacy policy, cookie policy or allergen information.
4. **Placeholder pages:** `/contact/` (theme demo with a US address), `/blogs/` (lorem ipsum) and `/recipes/` (empty). Drop them.
5. **Dead menu links:** the pills "Most Popular", "Flex Signature", "Smash & Doner" and "Dips" link to sections that don't exist on `/full-menu/`.
6. **Free delivery threshold:** the homepage says £20, but the meta description says £15. Confirm which is right.
7. **Offer with no product:** "Flex Feast for Two" (£17.99) appears on the homepage but there is no product for it.
8. **Duplicate products:**
   - "Chicken Wrap" appears twice: ids 1170 and 1627, both £4.49.
   - "Spicy Chicken Wrap" appears twice: 1171 at £4.99 and 1622 at £5.99.
   - "Large Popcorn Chicken" appears twice: 1206 at £6.99 with no category, and 1220 at £8.39.
9. **Junk product:** "Product" (`product-6`) at £0.00.
10. **Pricing anomaly:** "BBQ Wings x 12" costs £4.99, which is less than "BBQ Wings x 8" at £5.39.
11. **Slug and typo mismatches:**
    - "Peri Peri Wings x 20" has the slug `…-x-12`.
    - "4 Spicy Wings Meal" has the slug `3-spicy-wings-meal`.
    - "Onion Ringas" should be "Onion Rings".
    - "BBQ iTems" should be "BBQ Items".
12. **Missing descriptions:** no product has a short description, and 55 have no description at all.

## Features on the live site that the rebuild needs to cover

- Online ordering: a cart called the "Flex Box", product options with price add-ons, delivery or collection, and card / Apple Pay / Google Pay checkout.
- Customer accounts (login, register, password reset) and purchase history.
- Live order tracking ("from acceptance to delivery").
- Back office from a custom `restaurant-orders` plugin: a staff dashboard, driver view, browser notifications, kitchen printer integration (Printerco), and store availability (open/closed).
- A supplier portal (`supplier-order-control` plugin, `/supplier-login/`).
- Extras: a product quick-view popup, wishlist and compare (Blocksy), and reviews.
