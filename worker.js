/**
 * Pixel — fal.ai proxy (Cloudflare Worker)
 * ----------------------------------------
 * Why this exists: browsers can't call queue.fal.run directly (CORS).
 * This Worker forwards requests to fal, adds CORS headers, and supplies
 * the fal key — so the static site can generate real video.
 *
 * Deploy (2 minutes, free):
 *   1. https://dash.cloudflare.com → Workers & Pages → Create Worker
 *   2. Paste this file, Deploy.
 *   3. Settings → Variables → add a Secret named FAL_KEY (your fal.ai key).
 *      (Optional: set ALLOW_ORIGIN to your site, e.g. https://pixel.eknathalabs.com)
 *   4. Copy the Worker URL (e.g. https://pixel-fal.<you>.workers.dev)
 *      and paste it into Pixel Studio → Settings → Proxy URL.
 *
 * Modes:
 *   - Shared key:  set FAL_KEY secret here → visitors need no key.
 *   - BYO key:     leave FAL_KEY unset → the browser sends its own key,
 *                  forwarded via the X-Fal-Key header.
 */

const FAL_BASE = "https://queue.fal.run";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";
    const allow = env.ALLOW_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": allow === "*" ? "*" : allow,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Fal-Key, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // The browser calls:  <worker>/<fal-path>           (POST to submit)
    //                     <worker>/<fal-path>/requests/<id>/status   (GET)
    //                     <worker>/<fal-path>/requests/<id>          (GET result)
    const url = new URL(request.url);
    const falPath = url.pathname.replace(/^\//, "");
    if (!falPath || !falPath.startsWith("fal-ai/")) {
      return json({ error: "Path must start with fal-ai/" }, 400, cors);
    }

    // Key: prefer the Worker secret (shared); else the browser's own key.
    const key = env.FAL_KEY || request.headers.get("X-Fal-Key");
    if (!key) {
      return json({ error: "No fal key. Set FAL_KEY secret on the Worker, or send X-Fal-Key." }, 401, cors);
    }

    const target = `${FAL_BASE}/${falPath}${url.search}`;
    const init = {
      method: request.method,
      headers: {
        "Authorization": "Key " + key,
        "Content-Type": "application/json",
      },
    };
    if (request.method === "POST") {
      init.body = await request.text();
    }

    let resp;
    try {
      resp = await fetch(target, init);
    } catch (e) {
      return json({ error: "Upstream fetch failed: " + e.message }, 502, cors);
    }

    // Pass through status + body, add CORS.
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: { ...cors, "Content-Type": resp.headers.get("Content-Type") || "application/json" },
    });
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
