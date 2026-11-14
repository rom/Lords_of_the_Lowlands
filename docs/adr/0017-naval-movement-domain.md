# 17. Naval movement domain via a context flag

Date: 2026-11-14

## Status

Accepted

## Context

Map types with seas, rivers and lakes add boats (fishing boats, warships)
that move on water while every other unit moves on land. Pathfinding,
occupancy, separation, resource search and drop-off search all ask "is this
tile usable?" in many places.

## Decision

- Add `UnitDef.Naval` and a per-game flag `Game.navalCtx`. Code that
  processes a boat (unit update, training/spawn, orders in `Apply`,
  separation pairs, AI fishing) sets `navalCtx = unit.Naval` and resets it
  afterwards.
- `terrainOK` (path.go) consults the flag: boats accept water and fords,
  ground units `Passable` tiles. A* and line-of-sight code are unchanged.
- With the flag set, resource search only finds `fish` (and land workers
  never find fish); boats only drop off at a `dock`.
- `Game.Naval` (earthly theme, not desert, ≥ 2 % water) gates docks.

## Consequences

- One small change instead of a second pathfinder or domain parameters
  through every call chain.
- The flag is mutable game state: every user must reset it (deferred or
  explicitly); safe because `game.Game` is single-threaded
  ([architecture §5](../architecture.md#5-concurrency-model)).
- Fords are shared by both domains, giving natural crossing points.
