import { expect, test } from "@playwright/test";
import { SIMPLE_DISH, showDish } from "./menu.mjs";

// The Epson on the shop network, sent by the till (a TM-m30II without
// Server Direct Print), end to end on the database build: the owner sets the
// printer's IP and marks this screen as the till, and a stand-in for the
// printer's ePOS-Print service at that IP takes what the till sends. The
// page's own CSP has to let it through. Run against the preview.
const ADMIN_PIN = process.env.CLOUD_ADMIN_PIN || "135792";
const PRINTER_IP = "192.168.1.172";
const run = Date.now().toString(36);
const ANSWER =
  '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><response success="true" code="" status="251658262" battery="0" xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"/></s:Body></s:Envelope>';
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "Content-Type, If-Modified-Since, SOAPAction", "access-control-allow-methods": "POST, OPTIONS" };

/** The printer at PRINTER_IP: keeps every receipt it is sent, or is switched off. */
async function fakePrinter(page) {
  const printer = { received: [], isOn: true };
  await page.route(`**://${PRINTER_IP}/cgi-bin/epos/service.cgi**`, async (route) => {
    if (!printer.isOn) return route.abort("connectionrefused");
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postData() ?? "";
    if (!body.includes("<epos-print xmlns=\"http://www.epson-pos.com/schemas/2011/03/epos-print\"></epos-print>")) printer.received.push(body);
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "text/xml; charset=utf-8" }, body: ANSWER });
  });
  return printer;
}

async function placeCollection(page) {
  await page.goto("/");
  await showDish(page, SIMPLE_DISH);
  await page.getByRole("button", { name: /^Add to Box: \d+ × / }).click();
  await page.goto("/checkout");
  await page.getByRole("radio", { name: "Collection" }).click();
  await page.getByRole("button", { name: "Sign in to order" }).click();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.getByLabel("Name").fill(`Till ${run}`);
  await page.getByLabel("Email").fill(`till-${run}@example.com`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Mobile number").fill("07700 900123");
  await page.getByRole("button", { name: /^Place order · £/ }).click();
  await expect(page).toHaveURL(/\/track\?id=ord_/);
  return (await page.getByText(/^Order #\d+ · Collection$/).textContent()).match(/#\d+/)[0];
}

test("the till sends accepted orders to the printer on the shop network", async ({ browser }) => {
  const owner = await (await browser.newContext({ ...test.info().project.use })).newPage();
  const printer = await fakePrinter(owner);
  await owner.goto("/admin/shop#printer");
  await owner.getByLabel("Shift code").fill(ADMIN_PIN);
  await owner.getByRole("button", { name: "Unlock" }).click();

  try {
    await owner.getByRole("radio", { name: /Epson on the shop network, sent by the till/ }).check();
    await owner.getByLabel("Printer IP address").fill("8.8.8.8");
    await owner.getByRole("button", { name: "Save", exact: true }).click();
    await expect(owner.getByText("Enter the printer's IP address as it prints on its status sheet")).toBeVisible();

    // Saving reloads the page, so its CSP now lets the till reach the printer.
    await owner.getByLabel("Printer IP address").fill(PRINTER_IP);
    await owner.getByRole("button", { name: "Save", exact: true }).click();
    await owner.waitForEvent("load");
    await expect(owner.getByLabel("Printer IP address")).toHaveValue(PRINTER_IP);
    await owner.getByRole("checkbox", { name: /This screen is the till/ }).check();
    await expect(owner.getByText("Connected: the till reached the printer just now.")).toBeVisible({ timeout: 25_000 });

    await owner.getByRole("button", { name: "Print a test slip" }).click();
    await expect.poll(() => printer.received.some((b) => b.includes("PRINTER TEST")), { timeout: 20_000 }).toBe(true);
    const slip = printer.received.find((b) => b.includes("PRINTER TEST"));
    expect(slip).toMatch(/^<\?xml version="1.0" encoding="utf-8"\?><s:Envelope xmlns:s="http:\/\/schemas\.xmlsoap\.org\/soap\/envelope\/"><s:Body><epos-print /);

    // A customer orders; the kitchen accepts on the till; the ticket prints there.
    const customer = await (await browser.newContext({ ...test.info().project.use })).newPage();
    const number = await placeCollection(customer);
    await owner.goto("/admin/orders");
    const ticket = owner.getByRole("article", { name: new RegExp(`Order ${number}`) });
    await ticket.getByRole("button", { name: "Accept" }).click();
    await expect.poll(() => printer.received.some((b) => b.includes(number)), { timeout: 20_000 }).toBe(true);
    expect(printer.received.find((b) => b.includes(number))).toContain("qrcode_model_2");
    await expect(owner.getByText("Printer ready")).toBeVisible();

    // The printer goes off: the till's settings page says so, with the way to fix it.
    printer.isOn = false;
    await owner.goto("/admin/shop#printer");
    await expect(owner.getByText(`This till cannot reach the printer at ${PRINTER_IP}.`)).toBeVisible({ timeout: 25_000 });
    await expect(owner.getByRole("link", { name: "Open the printer's page" })).toHaveAttribute("href", `https://${PRINTER_IP}`);
  } finally {
    // Leave the shop printing from the screen, as the other tests expect.
    await owner.goto("/admin/shop#printer");
    await owner.getByRole("checkbox", { name: /This screen is the till/ }).uncheck();
    await owner.getByRole("radio", { name: /This screen's print dialog/ }).check();
    await expect(owner.getByLabel("Printer IP address")).toBeHidden();
  }
});
