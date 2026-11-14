# 10. Fog-of-war filtering on the server

Date: 2026-11-14

## Status

Accepted

## Context

Fog of war is central to RTS strategy. If the client receives the whole
state and hides parts of it while rendering, any player can reveal the map
with a proxy or browser dev tools (ASR-2). Server-authoritative streaming
([ADR-0003](0003-server-authoritative-snapshots.md)) makes per-player views
possible.

## Decision

Compute visibility on the server and send each player only what their team
may know:

- team vision (units: `Sight`; buildings: `Sight + size/2`) is recomputed
  every 2nd tick into per-player `Visible` and `Explored` grids;
- `Game.Snapshot(player)` includes own and allied entities, enemy and wild
  **units only on visible tiles**, and **buildings and resources once their
  tile is explored**;
- private data (production queues, carried resources, absolute HP, rally
  points, farm food) only for allies;
- events only for allies or visible tiles; attack alerts only for their owner;
- the client receives the fog itself as an RLE string every 5th tick and
  only uses it for drawing;
- commands may target only entities the player can see (`canSee` in
  `Apply`), and buildings may be placed only on explored tiles.

## Consequences

- Map hacks are impossible: the data is not on the client.
- Server CPU per snapshot grows with players × entities; vision updates are
  amortised (every 2nd tick, fog encoding every 5th).
- Enemy buildings are only revealed once seen (per-player memory of seen
  building IDs), so new buildings in explored-but-dark areas stay hidden.
  Remembered buildings are still reported with their *live* state (HP,
  destruction); a full fix would store per-player building snapshots.
- Spectator views are supported by `Snapshot(-1, …)`.
