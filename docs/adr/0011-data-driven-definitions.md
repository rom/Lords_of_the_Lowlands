# 11. Data-driven unit and technology definitions scaled by age

Date: 2026-11-14

## Status

Accepted

## Context

Seventeen ages × five unit lines gives 80 units (mounted from age 2, siege
from age 3), plus 3 animals, 13 building types with
era names and 68 technologies. Hand-writing every stat block would be
error-prone and hard to balance (ASR-10). The client also needs these
definitions to build menus and tooltips.

## Decision

Generate definitions in `internal/game/defs.go` at start-up from compact
data:

- five **line templates** (age-0 stats, base cost, building, pop) and
  per-age **rosters** (id, name, sprite, projectile, flying, splash);
- `makeUnit` derives each unit: HP/attack × `1 + 0.30·age`, cost ×
  `1 + 0.22·age`, plus era rules (no gold before the Copper Age, money
  economy from age 8, energy from age 10, firearm ranges, flying units,
  era speed bonuses);
- **building templates** with a name per era; costs and HP scale with the
  builder's age at placement;
- **technologies**: four kinds per age with names from tables and costs
  `base × (1 + 0.35·age)`;
- a single `Counter()` function for class multipliers;
- the whole bundle is served as `GET /api/defs`; the client renders from it.

## Consequences

- Adding an age-specific unit is one roster line; balancing a whole line is
  one template change; the client needs no change for new units with
  existing sprite keys.
- Linear scaling gives predictable power curves and makes "advance the age"
  always worthwhile.
- Special cases (rams, firearms, tanks, flyers) live as rules in
  `makeUnit`, which must be kept readable.
- Definitions are global, immutable after `init`, and shared by all games.
- Balance numbers change often; documentation quotes them with
  `/api/defs` as the source of truth.
