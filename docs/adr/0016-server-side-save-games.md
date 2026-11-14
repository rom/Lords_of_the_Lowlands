# 16. Server-side save games

Date: 2026-11-14

## Status

Accepted

## Context

Long matches (17 ages) need save/resume. If saves were downloaded to and
uploaded from the browser, a player could edit resources, techs or units
in the file — a trivial cheat that also bypasses high-score integrity.

## Decision

- `game.Game.Save()` produces a versioned `SaveState` (level with explicit
  tiles, tick, players with resources/techs/explored fog/modifiers/AI
  memory, all live entities and queues). `LoadGame` validates every field
  (versions, ranges, NaN/Inf, ids, owners, unit/building/tech types,
  bounds, queue lengths) so a corrupt file cannot crash the server
  (`FuzzLoadGame`).
- Saves are created and restored **only over the WebSocket** (`save`,
  `restore`) and stored in `data/saves/<owner>/s-<16 hex>.json`
  (max 8 MiB, `game.maxSavesPerUser` per account, registered users only).
  REST offers list and delete only — there is no upload or download.
- A restored game opens a lobby room: the owner takes their seat, other
  human seats are **reserved** (keep the original name; anyone may join),
  and seats still empty at start are played by the computer.

## Consequences

- Inventories cannot be edited by players; the file never leaves the server.
- Saves are tied to one account and one server; no sharing.
- `SaveVersion` must be bumped on incompatible changes; old saves then fail
  with `incompatible save`.
- Landlock needs `MAKE_DIR`/`REMOVE_DIR` in the data dir for per-user
  folders.
