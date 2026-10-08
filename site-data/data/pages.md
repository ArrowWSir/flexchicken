# Flex Chicken: page content

This file holds the copy from the live site, kept as it is published. Business facts are in `business.json`.

---

## /about-us/

**H1:** About Flex Chicken
**Subtitle:** Made in Rainham. Made to be remembered.

At Flex Chicken, we believe a great takeaway should deliver more than convenience. It should arrive hot, taste exceptional and leave you looking forward to your next order.

From our kitchen on Upminster Road South, we prepare crispy fried chicken, flavour packed wings, stacked burgers, wraps, BBQ favourites, loaded fries and generous family meals. Every order is freshly prepared with care, because quality should never be an afterthought.

### Proper food. Genuine flavour.
Our approach is refreshingly simple. We focus on satisfying food, bold flavours and portions that offer genuine value.

Whether you are collecting lunch, ordering dinner for the family or treating yourself in the evening, we want every experience with Flex Chicken to feel effortless and enjoyable. From choosing your meal to receiving your order, everything is designed around good food and straightforward service.

### Proud to serve Rainham
Flex Chicken is an independent local business, and we are proud to be part of the Rainham community.

Our customers shape what we do. Their feedback encourages us to keep improving, maintain high standards and create food people are happy to recommend. We are not interested in being just another chicken shop. We want to become Rainham’s first choice for freshly prepared chicken, burgers and satisfying takeaway meals.

### Visit Flex Chicken
You can find us at:
Flex Chicken, 107 Upminster Road South, Rainham, RM13 9AA

We are open daily from **12 noon until 11 pm**, with delivery and collection available.

### Your next favourite is waiting
Explore our menu, choose what takes your fancy and let our team take care of the rest.

*Freshly prepared. Full of flavour. Proudly served in Rainham.*

---

## /contact-us/

**Eyebrow:** WE’RE HERE TO HELP
**H1:** Contact us
**Intro:** Questions about your order or our menu? Send us a message and our team will help.

**Info cards**
| Icon | Title | Value |
|---|---|---|
| ☎ | Call us | 020 3837 6035 |
| ✉ | Email us | info@flexchicken.co.uk |
| ⌖ | Directions | 107 Upminster Rd S, Rainham RM13 9AA |
| ◷ | Opening hours | We’re open Daily from 12:00 PM to 11:00 PM |

**Form: "Send us a message"**
Intro: Complete the form and we’ll get back to you as soon as possible.

| Field | Type | Required |
|---|---|---|
| Website | hidden honeypot (anti-spam) | – |
| Name | text | yes |
| Email | email | yes |
| Phone | tel | no |
| Order number | text | no |
| Subject | select: My order / Menu or allergens / Delivery / Feedback / Something else | yes |
| Message | textarea | yes |

Submit button: "Send message →"

**Map block:** Flex Chicken, 107 Upminster Rd S, Rainham RM13 9AA, with an "Open in Google Maps →" link and an embedded Google Map (URLs in `business.json`).

---

## /full-menu/ ("Order Here")

- Top banner: **We’re open Daily from 12:00 PM to 11:00 PM**
- A sticky, horizontally scrolling bar of category pills. Each pill links to an anchor on the page. The pills are listed in `menu-sections.json` under `nav_pills`.
- Each section has an H3 heading and a grid of product cards: image, name, price, and an "Add to Box" or "Choose options" button.
- Products with options open a popup (the custom plugin "flex-product-popup") where the customer picks options before adding the item to the cart.
- The section order and the products in each section are in `menu-sections.json`.

---

## Product page (/product/{slug}/)

The page shows a breadcrumb, then the name and price. Below that is an options form with radio groups, some of which add to the price (for example "Add Cheese +£0.39"). A live total reads "Product total / Options total / Grand total". Then come a quantity stepper, the **"Add to Flex Box"** button, the description, reviews, and related products.

---

## Pages that exist on the live site but are empty or placeholder

| URL | State | Action for rebuild |
|---|---|---|
| /halal-certification/ | EMPTY | The owner needs to supply the certificate image or PDF |
| /terms-and-conditions/ | EMPTY | Needs real T&Cs |
| /contact/ | Blocksy theme demo (lorem ipsum, fake US address) | Drop it. /contact-us/ is the real page |
| /blogs/ | Lorem ipsum | Drop it or write real content |
| /recipes/ | Empty | Drop it |
| /supplier-login/ | Empty, internal | Internal supplier portal, not public |
| Blog "posts" (/burgers/, /wings-chicken/ …) | Each is just a WooCommerce product grid for one category | Replace with real category pages |

There is no privacy policy, cookie policy or allergen information page on the live site. A UK food business should have these, so add them in the rebuild.

## Functional pages (app features, not content)

/my-account/, /customer-account/, /orders/, /purchase-history/, /order-checkout/, /checkout-page/, /order-received/, /tracking/, /order-tracking/, /restaurant-staff/, /driver/

These come from a custom "restaurant-orders" plugin that handles checkout, customer accounts, live order tracking, a staff and driver dashboard, and browser notifications. "printerco_notify" is the integration with the kitchen's receipt printer.
