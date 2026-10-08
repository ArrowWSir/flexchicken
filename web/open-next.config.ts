// Turns the Next build into a Cloudflare Worker.
//
// No cache adapter is configured: nothing in this app is statically
// regenerated. The pages are client-rendered around localStorage, and the one
// route that does work on the server (/api/qr) must never be cached, because
// it hands a staff member back the exact file they asked for.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
