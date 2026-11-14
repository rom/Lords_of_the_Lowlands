# 5. WebSocket via github.com/coder/websocket with permessage-deflate

Date: 2026-11-14

## Status

Accepted

## Context

Real-time play needs a bidirectional, low-latency channel (ASR-7). Snapshot
streaming ([ADR-0003](0003-server-authoritative-snapshots.md)) sends a few
kilobytes of very repetitive JSON per player ten times per second
(ASR-14). Slow clients must not stall rooms (ASR-9). Options: Server-Sent
Events + POST, WebTransport, `gorilla/websocket`, `nhooyr.io/websocket`
(now `github.com/coder/websocket`), or the experimental `x/net/websocket`.

## Decision

Use **`github.com/coder/websocket` v1.8.13**:

- `websocket.Accept` with `CompressionContextTakeover` (permessage-deflate
  keeping the LZ77 window across messages) and its built-in Origin check
  (`OriginPatterns` from `-allow-origin`);
- `SetReadLimit(16 KiB)` per connection;
- context-based reads/writes with a 10 s write timeout and a 20 s ping;
- one writer goroutine per client fed by a **bounded channel (256)**; each
  message is enqueued as *lossy* (snapshots, lobby, pong, command errors —
  dropped when full) or *reliable* (chat, room, start, end, errors — the
  client is disconnected when full).

JSON text frames are used rather than a binary encoding.

## Consequences

- Context takeover makes consecutive, similar snapshots compress very well,
  so plain JSON stays affordable and debuggable in browser dev tools.
- Compression costs server CPU and per-connection memory for the deflate
  window; acceptable at the target scale.
- The library is small, context-aware and maintained; it is one of only
  three module dependencies.
- The bounded, lossy queue isolates rooms from slow clients without
  head-of-line blocking.
- A binary protocol could cut bandwidth further; this is left open as an
  optimisation behind the same message types.
