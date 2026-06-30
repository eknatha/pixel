# Pixel

A cinematic, motion-led website for a long-form AI video generator, built around one idea: **noise resolving into image**. Offline-first, zero dependencies, raw WebGL — deploys straight to GitHub Pages.

🔗 **Live:** [pixel.eknathalabs.com](https://pixel.eknathalabs.com)

---

## What it is

Pixel is a five-page marketing site plus a working studio shell for a diffusion-based video tool. The entire visual language expresses the subject: a GPU diffusion field that drifts as cold noise and **resolves into warm image as you scroll**, display type whose fill is a live ice→magma gradient, and a pipeline laid out as a denoise timeline (t = 0 → t = 1).

No frameworks, no build step, no bundled video. All motion is a hand-written GLSL shader plus canvas — it runs on the GPU, so it stays light.

## Pages

| File | Purpose |
|------|---------|
| `index.html`   | Landing — diffusion hero, type-into-field showpiece, film feed, denoise pipeline, spec band |
| `gallery.html` | Community feed — style filters + lightbox preview |
| `models.html`  | Bring-your-own-model spec table + how API keys work |
| `pricing.html` | Credits pricing — monthly/yearly toggle, FAQ |
| `app.html`     | The Studio — script → seed-locked scenes → parallel render queue → playback → export |

## Supporting files

| File | Purpose |
|------|---------|
| `field.js`    | The WebGL diffusion-field engine (the signature visual) |
| `pixel.js`    | Shared behaviour: scroll-driven denoise rail, scroll reveal, type-field mask, prompt demo |
| `styles.css`  | Design system — tokens, navigation, buttons, typography |
| `.nojekyll`   | Tells GitHub Pages to serve files as-is (no Jekyll processing) |
| `CNAME`       | Custom domain: `pixel.eknathalabs.com` |

## Design

- **Signature** — a full-viewport GPU diffusion field (hand-written GLSL, no three.js). Cold violet noise resolves to warm plasma; **scroll position is the diffusion timestep**.
- **Showstopper** — display type (`PROMPT → PICTURE`) whose fill is a live ice→magma gradient: letters made of diffusion.
- **Pipeline as denoise timeline** — the process section runs t = 0 → t = 1, nodes cold→hot, encoding the concept rather than decorating it.
- **Palette = state** — cold ice / violet means unresolved, warm plasma / magma means resolved. The two temperatures come from diffusion itself and carry across every page.
- **Quality floor** — responsive to 390px, visible keyboard focus, `prefers-reduced-motion` honoured (falls back to static gradients), offscreen canvases pause to save battery.

## Tech

Vanilla HTML / CSS / JavaScript. Raw WebGL with a single GLSL fragment shader for the diffusion field; 2D canvas for the gallery tiles and the type mask. No dependencies, no package manager, no build.

## Run locally

It's static, so any web server works (open over `http://`, not `file://`, so the shared `styles.css` / `*.js` load without CORS limits):

```bash
# Python
python3 -m http.server 8000

# or Node
npx serve .
```

Then open `http://localhost:8000`.

## Deploy (GitHub Pages)

1. Push every file to the repo root — keep the structure **flat**, `index.html` at the top level. All links between pages are relative, so nothing can live in a subfolder.
2. Make sure the hidden files uploaded: `.nojekyll` (empty) and `CNAME` (one line: `pixel.eknathalabs.com`).
3. **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**.
4. At your DNS host, add a `CNAME` record: `pixel` → `eknatha.github.io`.
5. Once the cert provisions, enable **Enforce HTTPS**.

Sanity check: `https://eknatha.github.io/pixel/` should load before DNS resolves — if it does, the file structure is correct and anything left is just DNS propagation.

## About generation

This is a front-end concept. A public static repo can't safely hold a shared API key, so real video generation has two honest paths:

1. **Bring your own key** — the user pastes a provider key (Runway, Luma, Kling via fal.ai, etc.); it lives in their browser's local storage and calls the provider directly.
2. **Add a proxy later** — a small Cloudflare Worker holds a shared key server-side.

Until then, `app.html` ships a **mock engine** so the full flow is demonstrable offline. The real-API seam is marked in `generateScene()` inside `app.html`, and the key model is explained on `models.html`.

## License

Concept project by [EknathaLabs](https://eknathalabs.com). © 2026.
