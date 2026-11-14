# 12. Embedded static assets via go:embed

Date: 2026-11-14

## Status

Accepted

## Context

The web client ([ADR-0004](0004-vanilla-js-canvas-client.md)) consists of
two HTML pages, two stylesheets and a handful of ES modules. Serving them
from the file system would need a second deployment artefact, a path flag
and read access to that directory after the sandbox is applied — which
Landlock forbids outside the data directory (ASR-3, ASR-13).

## Decision

Embed the client with `//go:embed index.html editor.html css js` in package
`web` and serve it with `http.FileServer(http.FS(web.FS()))` on `GET /`,
with `Cache-Control: no-cache` and an explicit
`text/javascript; charset=utf-8` type for modules.

## Consequences

- One binary contains server and client; versions can never mismatch.
- No file-system reads for static content after start-up, so the Landlock
  rule set stays minimal.
- Same-origin serving keeps the CSP `'self'`-only and the session cookie
  `SameSite=Strict` usable.
- Changing the client requires rebuilding the binary (fast; no other build
  step). `no-cache` makes browsers revalidate after upgrades.
- Assets cannot be served from a CDN without changing the CSP.
