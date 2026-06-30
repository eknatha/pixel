# Pixel — diffusion video studio (visual-wonder concept site)

A cinematic, motion-led marketing site + studio for a long-form AI video generator.
The whole site is built around one idea: **noise resolving into image**. Offline-first,
zero dependencies, raw WebGL. Deploys straight to GitHub Pages.

## The signature
- **Hero:** a full-viewport GPU diffusion field (hand-written GLSL, no three.js).
  Cold violet noise that **resolves to warm plasma as you scroll** — scroll position
  is the diffusion timestep.
- **Showstopper:** display type ("PROMPT → PICTURE") whose fill is a live ice→magma
  gradient — letters made of diffusion.
- **Pipeline as denoise timeline:** the process section is a t=0 → t=1 track, nodes
  cold→hot, encoding the concept rather than decorating it.
- **Palette = state:** cold ice/violet = unresolved, warm plasma/magma = resolved.
  The two temperatures come from diffusion itself, carried across every page.

## Pages
| File | What it is |
|------|------------|
| `index.html`   | Showpiece landing — diffusion hero, type-into-field, feed, denoise pipeline, spec band |
| `gallery.html` | Motion feed, style filters, lightbox |
| `models.html`  | Bring-your-own-model spec table + how keys work |
| `pricing.html` | Credits pricing, monthly/yearly toggle, FAQ |
| `app.html`     | The Studio — script → seed-locked scenes → parallel render → playback → export |
| `field.js`     | The WebGL diffusion-field engine (the wonder) |
| `pixel.js`     | Shared behaviour: scroll-denoise rail, reveal, type-field, prompt demo |
| `styles.css`   | Design system / tokens |

## Performance & ethos
- One sub-15KB GLSL shader runs on the GPU — lighter than animating DOM particles.
- Mobile caps DPR and particle work; offscreen canvases pause via IntersectionObserver.
- Full `prefers-reduced-motion` fallback to static gradients; keyboard focus; no horizontal
  scroll down to 390px. No video files bundled — all motion is shader/canvas.

## The honest constraint
A public static repo can't hold a shared API key. Real generation = bring-your-own-key
(stored in the browser) now, or a Cloudflare Worker proxy later. `app.html` ships a mock
engine so the full flow works offline; the real-API seam is marked in `generateScene()`
and shown on `models.html`.

## Deploy to GitHub Pages
1. Push these files (keep `index.html` at root). `.nojekyll` and `CNAME` are included.
2. DNS: add a CNAME record for `pixel.eknathalabs.com` → `<user>.github.io`.
3. Repo → Settings → Pages → deploy from `main` / root.
