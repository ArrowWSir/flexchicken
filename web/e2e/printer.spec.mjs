import { expect, test } from "@playwright/test";
import { SIMPLE_DISH, showDish } from "./menu.mjs";

// The network receipt printer, end to end on the database build: the owner
// chooses it and copies its link, a stand-in for the Epson printer asks
// /api/printer for work the way Server Direct Print does, and the kitchen
// sees what it reports. Run against the preview (npm run preview).
const ADMIN_PIN = process.env.CLOUD_ADMIN_PIN || "135792";
const run = Date.now().toString(36);
const PRINTED = '<PrintResponseInfo><response success="true" code="" status="1" battery="0"/></PrintResponseInfo>';
const NO_PAPER = '<PrintResponseInfo><response success="false" code="EPTR_REC_EMPTY" status="1" battery="0"/></PrintResponseInfo>';

/** The Epson printer, as far as the website can tell. */
function fakePrinter(request, key) {
  const send = async (form) => {
    const res = await request.post(`/api/printer?key=${encodeURIComponent(key)}`, { form: { ID: "", ...form } });
    expect(res.status()).toBe(200);
    return res.text();
  };
  return {
    ask: () => send({ ConnectionType: "GetRequest" }),
    report: (responseFile) => send({ ConnectionType: "SetResponse", ResponseFile: responseFile }),
    // Prints whatever earlier runs left behind, so each step starts clean.
    async drain() {
      await this.report(PRINTED); // a receipt an earlier run left out holds the queue
      for (let i = 0; i < 50; i += 1) {
        if ((await this.ask()) === "") return;
        await this.report(PRINTED);
      }
    },
  };
}

async function unlockAdmin(page, path) {
  await page.goto(path);
  await page.getByLabel("Shift code").fill(ADMIN_PIN);
  await page.getByRole("button", { name: "Unlock" }).click();
}

async function placeCollection(page) {
  await page.goto("/");
  await showDish(page, SIMPLE_DISH);
  await page.getByRole("button", { name: /^Add to Box: \d+ × / }).click();
  await page.goto("/checkout");
  await page.getByRole("radio", { name: "Collection" }).click();
  await page.getByRole("button", { name: "Sign in to order" }).click();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.getByLabel("Name").fill(`Printer ${run}`);
  await page.getByLabel("Email").fill(`printer-${run}@example.com`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Mobile number").fill("07700 900123");
  await page.getByRole("button", { name: /^Place order · £/ }).click();
  await expect(page).toHaveURL(/\/track\?id=ord_/);
  return (await page.getByText(/^Order #\d+ · Collection$/).textContent()).match(/#\d+/)[0];
}

test("accepting prints on the network printer, and a failed receipt can be printed again", async ({ browser, request }) => {
  const owner = await (await browser.newContext({ ...test.info().project.use })).newPage();
  await unlockAdmin(owner, "/admin/shop#printer");
  await owner.getByRole("radio", { name: /Epson printer on the network/ }).check();
  const link = owner.getByText(/\/api\/printer\?key=/);
  await expect(link).toBeVisible();
  const key = new URL(await link.textContent()).searchParams.get("key");
  const printer = fakePrinter(request, key);

  try {
    // A wrong key gets nothing.
    expect((await request.post("/api/printer?key=wrong", { form: { ConnectionType: "GetRequest" } })).status()).toBe(403);

    await printer.drain();
    await expect(owner.getByText("Connected: the printer checked in just now.")).toBeVisible({ timeout: 25_000 });
    await owner.getByRole("button", { name: "Print a test slip" }).click();
    await expect(owner.getByText(/Test slip sent/)).toBeVisible();
    await expect.poll(() => printer.ask()).toContain("PRINTER TEST");
    await printer.report(PRINTED);

    const phone = await (await browser.newContext({ ...test.info().project.use })).newPage();
    const number = await test.step("customer orders", () => placeCollection(phone));

    const kitchen = await (await browser.newContext({ ...test.info().project.use })).newPage();
    await test.step("kitchen opens the board", () => unlockAdmin(kitchen, "/admin/orders"));
    await expect(kitchen.getByText("Printer ready")).toBeVisible();
    const ticket = kitchen.getByRole("article", { name: new RegExp(`Order ${number}`) });
    await ticket.getByRole("button", { name: "Accept" }).click();
    await expect(phone.getByRole("heading", { level: 1, name: "Accepted" })).toBeVisible({ timeout: 15_000 });

    // The server queued the ticket; the printer collects it and runs out of paper.
    const receipt = await printer.ask();
    expect(receipt).toContain(number);
    // The preview hands the Worker plain "localhost" (wrangler dev.host); live, it is https://flexchicken.uk.
    expect(receipt).toMatch(/<symbol type="qrcode_model_2"[^>]*>https?:\/\/[^<]+\/stamp\?t=[A-Z2-9]{20}<\/symbol>/);
    await printer.report(NO_PAPER);
    const alert = kitchen.getByRole("alert", { name: "Receipt printer" });
    await expect(alert.getByText(`Order ${number}`)).toBeVisible();
    await expect(alert.getByText("The printer is out of paper.")).toBeVisible();

    // New roll in; staff print it again.
    await alert.getByRole("button", { name: "Print again" }).click();
    await expect.poll(() => printer.ask()).toContain(number);
    await printer.report(PRINTED);
    await expect(alert).toBeHidden();
    await expect(kitchen.getByText("Printer ready")).toBeVisible();
  } finally {
    // Other runs expect the till's own print dialog.
    await owner.getByRole("radio", { name: /This screen's print dialog/ }).check();
    await expect(owner.getByText("Printer link")).toBeHidden();
  }
});
