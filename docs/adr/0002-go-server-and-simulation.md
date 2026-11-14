# 2. Go for the server and the game simulation

Date: 2026-11-14

## Status

Accepted

## Context

The server must run many independent real-time matches (ASR-6, ASR-8),
handle thousands of WebSocket messages per second, be easy to deploy
(ASR-13), be sandboxable at the system-call level (ASR-3) and be testable
headless (ASR-11). The simulation could live in the browser (JavaScript,
shared with the client) or on the server.

Options considered: Node.js (shared JS code with the client), Rust,
Go, C++.

## Decision

Write the server **and** the authoritative simulation in **Go** (module
`github.com/rom/lords_of_the_lowlands`, Go 1.24 at the time; now Go 1.25, see `go.mod`):

- `internal/game` is a pure library: no I/O, no goroutines, no clock; one
  `Game` value per match, driven by `Step()`.
- Each running room has one goroutine with a `time.Ticker` at 10 Hz;
  WebSocket connections get reader and writer goroutines.
- The binary is built with `CGO_ENABLED=0` as a single static executable.

## Consequences

- Goroutines map naturally onto rooms and connections; the Go scheduler
  spreads rooms over all cores without manual thread management.
- Static binaries with no runtime dependencies make systemd, distroless
  and `scratch`-style deployment trivial.
- `syscall.AllThreadsSyscall` (pure-Go builds only) lets the process apply
  `prctl`, `capset` and Landlock to every OS thread — required by
  [ADR-0008](0008-defence-in-depth-sandbox.md).
- The standard library covers HTTP, JSON, crypto/rand, slog and testing
  (including native fuzzing); only three modules are needed.
- Game logic is not shared with the JavaScript client; the client therefore
  only renders and never predicts (see [ADR-0003](0003-server-authoritative-snapshots.md)).
- Garbage collection pauses are small compared with the 100 ms tick, but the
  simulation should avoid per-tick allocations in hot paths (e.g. A* reuses
  scratch arrays).
