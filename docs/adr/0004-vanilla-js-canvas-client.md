# 4. Browser client in vanilla ES modules and Canvas 2D with procedural art

Date: 2026-11-14

## Status

Accepted

## Context

The client must run in any current browser without installation (ASR-12),
be compatible with a strict Content Security Policy (ASR-5) and be simple
to ship inside the server binary (ASR-13). Alternatives: a framework with a
bundler (React/Vite), a game engine (Phaser, PixiJS), WebGL, or bitmap
sprite sheets drawn by an artist.

## Decision

- Write the client as **plain ES modules** (`web/js/*.js`) loaded with
  `<script type="module">` — **no build step**, no npm dependencies.
- Render with **Canvas 2D**: an isometric renderer (`render.js`) with
  cached off-screen canvases for terrain chunks, buildings and resources and
  per-frame vector drawing of units.
- Generate **all art procedurally** in code (`sprites.js`: palettes per
  theme, buildings per era, units from parts, icons) — no image files.
- Build the DOM only through `el()` (`util.js`) which sets text with
  `textContent`; never use `innerHTML`.
- No inline scripts, styles or event-handler attributes.

## Consequences

- The CSP can be `default-src 'self'; script-src 'self'; style-src 'self'`
  without `unsafe-inline`/`unsafe-eval`, and `img-src`/`media-src` need only
  `data:`/`blob:` for generated content.
- The whole client is about 210 KB of source, served from `go:embed`
  ([ADR-0012](0012-embedded-static-assets.md)); there is no supply chain of
  JavaScript packages.
- 17 ages × 5 unit lines × 10 eras × 7 themes of art are feasible without an
  artist; the look is consistent and every era is restyled by code.
- Canvas 2D is slower than WebGL; the renderer compensates with chunk
  caching, sprite caches, view culling, a particle cap and lazy chunk
  building (≤ 3 per frame).
- Without a type checker or bundler, code organisation relies on module
  boundaries and discipline; browser smoke tests (Playwright) guard against
  regressions.
