# 3. Server-authoritative simulation with snapshot streaming

Date: 2026-11-14

## Status

Accepted

## Context

Classic RTS games (Age of Empires, StarCraft) use **deterministic
lockstep**: every client runs the full simulation and only commands are
exchanged. This needs little bandwidth but

- every client holds the complete game state, so fog of war can be
  defeated by reading memory (map hacks);
- the simulation must be bit-identical on all clients (no floating-point
  or iteration-order differences), across browsers;
- one slow client stalls everybody;
- reconnecting requires replaying or transferring the full state.

We need cheat resistance (ASR-1, ASR-2), browser clients of varying speed
(ASR-12) and reconnects.

## Decision

The server runs the **only** simulation. Clients send *commands* (intents)
over WebSocket; at every tick (10 Hz) the server applies queued commands,
steps the game and sends each human player a **complete, personalised
snapshot** of what that player may see (`Game.Snapshot`). The client keeps
the last two positions per entity and interpolates between them; it does
not predict.

## Consequences

- Cheating by modified clients is limited to automation; hidden
  information never leaves the server ([ADR-0010](0010-server-side-fog-filtering.md)).
- The simulation need not be bit-reproducible. It is seeded and free of I/O,
  but a few searches iterate Go maps; this is acceptable because nothing
  compares two runs.
- Reconnecting is trivial: the player is re-seated (`Hub.rejoin`) and the
  next snapshot is complete.
- Lost or dropped snapshots are harmless (the next one supersedes them),
  which allows lossy queueing for slow clients ([ADR-0005](0005-coder-websocket-deflate.md)).
- Bandwidth is higher than lockstep (several KB per snapshot before
  compression) and server CPU grows with the number of matches.
- Input latency is one tick (≤ 100 ms) plus round-trip time; acceptable for
  RTS-style control, with immediate local feedback (sounds, markers) in the
  client.
