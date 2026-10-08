// The shop's one Durable Object: its SQLite database, the API in front of it,
// and the live sockets every open screen keeps. Cloudflare runs one copy
// worldwide and gives it requests one at a time, which is what keeps stamps,
// redeems and order numbers atomic.
import { DurableObject } from "cloudflare:workers";
import { createApi } from "./api.js";
import { callerKey } from "./auth.js";
import { createShopCore } from "./shopCore.js";
import { createSqlStore } from "./sqlStore.js";

// Open screens: plenty for one shop, few enough that nobody can flood it.
const MAX_SOCKETS = 500;
const MAX_SOCKETS_PER_CALLER = 10;

/** A random id that cannot be guessed, e.g. for order links. */
export function randomId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export class ShopObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = createSqlStore(ctx.storage);
    this.core = createShopCore({
      store: this.store,
      newId: randomId,
      savePhoto: (dataUrl) => this.store.savePhoto(dataUrl, randomId("ph")),
      prunePhotos: (keepIds) => this.store.prunePhotos(keepIds),
    });
    this.api = createApi({ core: this.core, store: this.store, env, broadcast: (topics) => this.broadcast(topics) });
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/shop/live") return this.live(request, url);
    return this.api.handle(request);
  }

  // The socket only ever says which topics changed, never their contents:
  // each screen then asks for them again and gets what its role may see.
  live(request, url) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a WebSocket.", { status: 426 });
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return new Response("Not from the shop's pages.", { status: 403 });
    // Past a cap, the oldest socket gives way (its screen reconnects if still open).
    const caller = callerKey(request.headers.get("cf-connecting-ip"));
    const closeOldest = (sockets, max) => sockets.slice(0, Math.max(0, sockets.length - max + 1)).forEach((s) => s.close(1013, "busy"));
    closeOldest(this.ctx.getWebSockets(caller), MAX_SOCKETS_PER_CALLER);
    closeOldest(this.ctx.getWebSockets(), MAX_SOCKETS);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [caller]);
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(topics) {
    const message = JSON.stringify({ changed: topics });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // A socket closing as we send; its screen reconnects by itself.
      }
    }
  }

  webSocketMessage() {
    // Screens send nothing but pings, answered above.
  }

  webSocketClose(socket, code) {
    try {
      socket.close(code === 1005 ? 1000 : code, "bye");
    } catch {
      // Already closed.
    }
  }
}
