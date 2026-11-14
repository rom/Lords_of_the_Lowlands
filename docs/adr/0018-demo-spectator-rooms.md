# 18. Demo (attract) mode as spectator rooms

Date: 2026-11-14

## Status

Accepted

## Context

An idle lobby screen sells the game poorly. A self-playing showcase should
use the real simulation and renderer, cost nothing when nobody watches,
and never interfere with real games, the lobby or scores.

## Decision

- An idle client (no input for `game.demo.idleMinutes` on a menu screen)
  sends `{"t":"demo"}`. The hub creates a **demo room** (`Room.Demo`,
  id `d<n>`) with 2–4 AI players on a random campaign chapter or skirmish
  map (random age, theme, map type, difficulty normal..insane) and puts the
  client in `Room.spectators`.
- Spectators get `Snapshot(-1)` — a full, unfogged view — and a `start`
  with `you: -1` and `demo: true`; the client hides the HUD and drives an
  automatic camera.
- The match is replaced every `rotateMinutes` or when it ends; the room
  stops when no spectator is left. Any input leaves the demo (`leave`).
- Demo rooms are excluded from the lobby list, cannot be joined, are never
  recorded and are capped by `game.demo.maxRooms` (and `server.maxRooms`).

## Consequences

- Reuses rooms, the tick loop and snapshots; no recorded replays needed.
- Each watching client costs one AI match (bounded by `maxRooms`); spectators
  are counted separately in metrics (`lotl_rooms{state="demo"}`).
- Spectators see everything, which is fine because they are not players.
