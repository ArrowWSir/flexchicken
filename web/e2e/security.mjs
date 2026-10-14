// Shared by the database-build specs: collects what a page's security
// headers block (Content-Security-Policy violations, in report-only mode
// too), plus script errors, so a test can say "nothing was blocked".

/** Starts collecting on every page and frame of `context`; returns the list it fills. */
export async function watchForBlocks(context) {
  const problems = [];
  await context.exposeBinding("__fcReportBlock", (_source, v) => problems.push(v));
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__fcReportBlock?.({ kind: "csp", directive: e.effectiveDirective, blocked: e.blockedURI, page: location.href, sample: e.sample });
    });
  });
  const watch = (page) => {
    page.on("pageerror", (err) => problems.push({ kind: "pageerror", message: err.message, page: page.url() }));
    page.on("console", (msg) => {
      if (msg.type() === "error" && /Content.Security.Policy|Refused to/i.test(msg.text())) {
        problems.push({ kind: "console", message: msg.text(), page: page.url() });
      }
    });
  };
  context.pages().forEach(watch);
  context.on("page", watch);
  return problems;
}
