# Detailed design

This document describes how the game works internally. Player-facing rules
and tables are in [game-design.md](game-design.md); the system structure is
in [architecture.md](architecture.md). Numeric constants are quoted from the
source at the time of writing — `internal/game/defs.go` and `GET /api/defs`
are authoritative.

## 1. Simulation model

| Property | Value | Source |
|---|---|---|
| Tick rate | 10 Hz (`TickRate = 10`, `DT = 0.1 s`) | `game.go` |
| Authority | server only; clients send intents (`Command`) | `room.go`, `commands.go` |
| Time base | integer `Game.Tick`; all rates are per second × `DT` | |
| Random numbers | one `math/rand.Rand` per game, seeded with `time.Now().UnixNano()` | `room.startLocked` |
| Coordinates | continuous `float64` tile units; tile `(x,y)` covers `[x,x+1)×[y,y+1)` | |
| Population cap | 200 (`PopLimit`) | |
| Players | 2–8 (`MaxPlayers = 8`); owner `-1` (`Nature`) for animals/resources | |

`Room.tick` performs, under the room mutex:

```mermaid
flowchart LR
    A["Apply(cmd) for each<br/>queued command"] --> S["Step()"]
    S --> E["Events()"]
    E --> P["Snapshot(player) per human"]
```

`Game.Step()` order:

1. `Tick++`, rebuild the spatial hash (`buildGrid`: 4×4-tile cells of units and buildings).
2. AI players think once per second: `(Tick + index*3) % 10 == 0` (staggered).
3. Every live entity in creation order (`g.order`): `stepUnit` or `stepBuilding`.
4. `separate()` — push overlapping ground units apart (0.45 tiles, 0.7 if either has pop > 1; busy units are not pushed).
5. `resolveHits()` — apply damage whose impact tick has arrived.
6. Every 2nd tick: `updateVisibility()`.
7. Every 10th tick: recompute population of every player and `checkVictory()`.

**Determinism.** The simulation is seeded and contains no wall-clock or I/O
dependence, but it is *not* designed for bit-identical replay: a few searches
iterate Go maps (`nearestResource`, `nearestDropoff`, spatial-hash cells) and
can break ties differently between runs. This is acceptable because the
server is the single authority (no lockstep, see
[ADR-0003](adr/0003-server-authoritative-snapshots.md)).

## 2. Entity model

One struct, `game.Entity`, represents everything on the map; `Kind`
selects which fields are meaningful.

| Kind | Const | Def pointer | Notable fields |
|---|---|---|---|
| Unit | `KUnit = 0` | `U *UnitDef` | `Order`, `Target`, `TX/TY`, `Path`, `Carry/CarryRes`, `Cooldown`, `Facing`, `Busy` |
| Building | `KBuilding = 1` | `B *BuildingDef` | `TileX/TileY`, `Built`, `Progress`, `Queue []QItem` (≤ 10), rally point, `Food` (farms) |
| Resource | `KResource = 2` | `R *ResourceDef` | `Amount` |

Common: `ID` (monotonic), `Type`, `Owner`, `X/Y`, `HP/MaxHP`, `Age` (the
owner's age at creation — units and buildings keep the stats they were
created with).

**Unit orders** (`Order`): `OIdle, OMove, OAttackMove, OAttack, OGather,
OBuild, OFlee, OWander`. Animals use `OWander`/`OFlee`/`OAttack`.

**Occupancy.** `Game.occ[]` maps each tile to the blocking entity ID (0 =
free). Buildings (except farms) and blocking resources (trees, mines,
berries, crystals) occupy tiles; `walkable(x,y)` = passable terrain and
`occ == 0`. Units do not occupy tiles; they are kept apart by `separate()`.

**Lifecycle.** `newEntity` → `g.Ents[id]` + append to `g.order`; `remove`
marks `dead`, clears occupancy and deletes from the map; `g.order` is
compacted lazily at the next `Step`. Killing an animal spawns a non-blocking
`carcass` resource with the animal's food value; hunters switch to gathering
it.

## 3. Ages and eras

Seventeen ages (`Ages[0..16]`) are grouped into ten visual **eras** that
drive building names, sprites and music:

| Era | Ages |
|---|---|
| stone | 0 Dawn, 1 Neolithic |
| bronze | 2 Copper, 3 Bronze |
| iron | 4 Iron |
| classical | 5 Classical |
| medieval | 6 Early Middle Ages, 7 High Middle Ages |
| gunpowder | 8 Renaissance, 9 Imperial |
| industrial | 10 Industrial, 11 Machine |
| modern | 12 Atomic, 13 Information |
| future | 14 Orbital |
| space | 15 Interplanetary, 16 Interstellar |

Advancing is a town-centre queue item (`research` with `w: "age"`) costing
`Ages[age+1].AdvanceCost` and taking `AdvanceTime` seconds; only one age
advance may be queued per player and never beyond the level's `MaxAge`.

## 4. Units

### 4.1 Data-driven unit lines

Units are generated in `buildDefs()` from **five line templates** (age-0
stats) and **per-age rosters** (name, sprite, projectile, flying, splash):

| Line | HP | Atk | Armor | Range | Reload | Speed | Sight | Train s | Base cost | Pop | Trained at | First age |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| worker | 25 | 3 | 0 | 0.7 | 1.5 | 1.05 | 4 | 10 | 50 F | 1 | town_center | 0 |
| infantry | 48 | 6 | 0.10 | 0.8 | 1.4 | 1.0 | 5 | 14 | 55 F 25 G | 1 | barracks | 0 |
| ranged | 32 | 5 | 0 | 5.0 | 1.8 | 1.0 | 7 | 15 | 30 F 40 W 15 G | 1 | range | 0 |
| mounted | 95 | 8 | 0.15 | 0.9 | 1.6 | 1.7 | 6 | 20 | 70 F 60 G | 2 | stable | 2 |
| siege | 85 | 26 | 0.25 | 7.0 (min 2) | 4.0 | 0.65 | 8 | 30 | 160 W 110 G | 3 | workshop | 3 |

`makeUnit(template, spec, age)`:

| Rule | Formula |
|---|---|
| HP, attack | × `ageScale = 1 + 0.30·age` |
| Cost | × `costScale = 1 + 0.22·age` (rounded) |
| No gold before Copper Age | age < 2: gold cost is added to food |
| Money economy | age ≥ 8, non-workers: food ← round(food·0.5), gold += round(food·0.35) |
| Energy | age ≥ 10, non-workers: `round(10 + 4·(age−10)·(1+pop))` energy |
| Speed | mounted/siege ×1.15 from age 11, ×1.35 from age 14; workers ×1.15 from age 10 |
| Firearm infantry | infantry with a projectile: range 3.5 |
| Mounted shooters | range 4; with splash (tanks): range 5, reload 2.6 |
| Flying | speed 2.1, range ≥ 3.5 (fighters, drones, frigates, dreadnoughts) |
| Ram | melee: range 0.9, no projectile, no minimum range |
| Gunpowder ranged | age ≥ 8: range 5.5 |

A building always trains the **best unit of its line for the owner's
current age** (`BestUnit`), whatever id the client requested; units already
on the field are not upgraded.

### 4.2 Counter matrix

`Counter(attackerClass, targetClass)` multiplies damage. Buildings shoot as
`ranged`. Rows: attacker; columns: target.

| att \ tgt | worker | infantry | ranged | mounted | siege | animal | building |
|---|---|---|---|---|---|---|---|
| **worker** | 1 | 1 | 1 | 1 | 1 | 1 | **0.3** |
| **infantry** | 1 | 1 | 1 | **1.6** | **1.4** | 1 | 1 |
| **ranged** | 1 | **1.4** | 1 | 1 | 1 | 1 | **0.4** |
| **mounted** | 1 | 1 | **1.6** | 1 | **1.8** | 1 | 1 |
| **siege** | 0.7 | 0.7 | 0.7 | 0.7 | 0.7 | 0.7 | **3.5** |
| animal | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

The resulting cycle: infantry → mounted → ranged → infantry, with siege as
the building breaker that every other line (especially mounted) punishes.

```mermaid
flowchart LR
    INF[Infantry] -- "×1.6" --> MNT[Mounted]
    MNT -- "×1.6" --> RNG[Ranged]
    RNG -- "×1.4" --> INF
    MNT -- "×1.8" --> SIG[Siege]
    INF -- "×1.4" --> SIG
    SIG -- "×3.5" --> BLD[Buildings]
```

### 4.3 Combat

| Step | Rule |
|---|---|
| Target acquisition | idle military units scan every 5 ticks within `Sight`; attack-move scans every 4 ticks; `findEnemy` prefers units (buildings +6, workers +1.5 distance penalty) |
| Approach | direct chase without pathfinding when the line is clear and target < 10 tiles; otherwise A* with periodic repath; give up after 25 failed chase steps or when a non-visible target is > 3×sight away |
| Minimum range | units with `MinRange` (siege, 2 tiles) step back from units that come too close |
| Firing | on cooldown expiry: attack × owner `attackMul` (workers: × `1 + 0.25·age`); building attack × `(1 + 0.3·age) × attackMul` |
| Projectile flight | impact delay `1 + ⌊dist / speed · 10⌋` ticks; speed 30 (bullet, laser, rail, ion), 14 (plasma, missile, rocket), 8 (boulder, shell, cannonball), 9 otherwise; melee hits land next tick |
| Damage | `dmg = atk · Counter · (1 − armor)`, minimum 0.5; unit armor = def armor + owner `armorAdd` (not for workers); buildings 0.5 (0.2 while unbuilt); armor capped at 0.8 |
| Splash | half damage to every hostile entity within `Splash` tiles of the impact point |
| Retaliation | idle military units counter-attack; passive animals flee 6 tiles, aggressive ones (boar, mammoth) attack |
| Alerts | the victim's owner gets an `alert` event at most every 10 s |

## 5. Economy

### 5.1 Resources

Five resources: Food, Wood, Stone, Gold, Energy (`Res [5]float64`).

| Object | Resource | Amount | Rate mult. | Blocks tile |
|---|---|---|---|---|
| tree | Wood | 120 | 1.0 | yes |
| berry | Food | 150 | 0.9 | yes |
| gold | Gold | 800 | 0.8 | yes |
| stone | Stone | 700 | 0.8 | yes |
| crystal | Energy | 600 | 0.7 | yes |
| carcass | Food | animal's food (deer 120, boar 260, mammoth 650) | 1.3 | no |

### 5.2 Gathering loop

```mermaid
stateDiagram-v2
    [*] --> Approach: gather order
    Approach --> Work: within 1.25 tiles
    Work --> Work: carry += rate·DT
    Work --> Return: carry ≥ capacity or target gone
    Return --> Deliver: within 1.25 tiles of drop-off
    Deliver --> Approach: add carry to stockpile
    Work --> Approach: target depleted → nearest same kind ≤ 10 tiles
    Approach --> Idle: unreachable (stuck > 12)
```

| Quantity | Formula |
|---|---|
| Gather rate (per s) | `0.7 · rateMult · gatherMul · (1 + 0.06·age) · aiBonus` |
| Farm rate | as above with rateMult 0.8 |
| Carry capacity | `10 + unitAge` |
| Worker move speed | × `1 + 0.03 · techsResearched` |
| Drop-offs | town centre: F/W/S/G · granary: F · lumber camp: W · mining camp: S/G/Energy |

**Farms** are 3×3, non-blocking buildings holding `320 · (1 + 0.1·age)`
food; one worker gathers from a farm until it is exhausted, then the farm
disappears (`depleted` event). Workers ordered to a foundation build it;
after finishing a farm they start farming it, after finishing a drop-off
they gather the nearest matching resource within 7 tiles.

**Energy** (from the Industrial Age) comes from crystals and from
**generators**: each built generator yields
`0.6 · (1 + 0.25·(age − 10)) · gatherMul` energy per second. From age 10
most military units and from age 11 technologies cost energy.

**Housing.** Town centre +10, house +5 population, capped at 200. A unit
queue item does not start while `pop + unit.pop > popCap`.

**Costs of buildings** scale with the builder's age:
`cost · (1 + 0.12·age)` (houses `1 + 0.05·age`); before the Copper Age gold
is charged as food. Building HP scales with `1 + 0.2·age`. Cancelling a
foundation refunds 75 %; cancelling a queue item refunds its full price.

## 6. Technologies

68 technologies: one of each kind per age (`<kind>_<age>`), researched at
the academy, available from their age onward.

| Kind | Effect per tech | Base cost (× `1 + 0.35·age`) |
|---|---|---|
| gather | `gatherMul += 0.15` (also boosts generators) | 100 F 75 W |
| attack | `attackMul += 0.10` (units and buildings) | 120 F 60 G |
| armor | `armorAdd += 0.05` (non-worker units) | 120 F 60 W 40 G |
| hp | `hpMul += 0.10`, applied retroactively to all own units and buildings | 80 F 80 W 60 S |

Research time is `25 + 2·age` s; gold is charged as food before age 2;
from age 11 each tech also costs `50 + 20·(age − 11)` energy. Each tech
also makes workers 3 % faster.

## 7. Computer opponent

`internal/game/ai.go`. The AI is a player like any other: it reads the
same `Game` state but issues orders through the same functions as
`Apply` (`queueUnit`, `queueResearch`, `Apply(CmdBuild/CmdAMove)`), so it
pays costs, respects population, age and placement rules. Its only
advantage is the difficulty multiplier.

| Difficulty | `bonus` (gather, build, train speed) | First attack size |
|---|---|---|
| easy | 0.75 | 14 |
| normal | 1.0 | 10 |
| hard | 1.3 | 8 |

Every second (`think`) it runs four planners:

| Planner | Behaviour |
|---|---|
| economy | keeps up to `14 + 3·age` workers (max 45); target split F/W/S/G = 45/35/10/10 (50/38/12/0 before Copper, 35/25/10/18/12 incl. energy from Industrial); idle workers go to the most under-staffed resource; every 5th `think` (every 5 s) one worker moves from the most over-stocked to the scarcest resource; food prefers free farms, then hunting/foraging within 26 tiles, then new farms |
| construction | houses when within 6 of the cap; drop-off camps when a resource is > 9 tiles from one; a fixed build plan (barracks, range, academy, stable, workshop, tower, generator, then second barracks/range/stable) gated by age and worker count; more farms when wild food runs out |
| research | advance the age when it has ≥ `10 + age` workers and can pay; otherwise academy techs in the order gather → attack → armor → hp, keeping half the next age cost in reserve |
| military | trains the best unit at every military building (≤ 2 queued), saving for the next age once a minimum army exists; defends against visible enemies within 14 tiles of its town centre; after minute 4, when the army reaches the attack size (+ age/2), it stages at 55 % of the way to the nearest enemy building (town centres preferred) for 30 s, then attack-moves; when the wave falls below a third it regroups at home and waits 60 s; each wave raises the next attack size by 2 |

If its town centre is lost the AI tries to rebuild one with any surviving
worker. In campaign quick games all AI opponents share team 2 against the
human on team 1.

## 8. Fog of war and visibility

- **Vision sources**: every owned unit (`Sight`) and building
  (`Sight + size/2`, 2 while unbuilt) marks tiles within a circle as
  *visible* for its **team**; visible tiles also become *explored*.
  Recomputed every 2nd tick.
- **Filtering** (`Game.canSee`, used by `Snapshot` and `Apply`):
  - own and allied entities: always;
  - enemy and wild **units**: only on currently *visible* tiles;
  - **resources**: once their tile is *explored*;
  - enemy **buildings**: once they have been *seen* (on a visible tile) at
    least once; remembered afterwards.
- **Commands** may only target entities the player can see; buildings may
  only be placed on explored tiles.
- **Events** (shots, deaths, construction sounds …) are forwarded only if
  they belong to an ally or happen on a visible tile; `alert` events only to
  their owner; `gameover`/`defeated` to everyone.
- **Hidden fields**: for non-allied entities the snapshot omits carried
  resources, absolute max HP, production queues, rally points and farm food.

Limitation: remembered enemy buildings are reported with their *current*
state (HP fraction, construction progress, destruction) rather than a frozen
last-seen copy. See [security.md](security.md#35-known-limitations).

## 9. Pathfinding and movement

`internal/game/path.go`.

| Aspect | Implementation |
|---|---|
| Graph | tile grid, 8-connected; diagonal moves forbidden if either orthogonal neighbour is blocked (no corner cutting) |
| Cost | 1 orthogonal, √2 diagonal, × 1.3 on fords (`TShallow`) |
| Search | A* with a binary heap and `heap.Fix` decrease-key; weighted heuristic `1.2 × octile distance` to a goal **rectangle** |
| Effort bound | at most 4 000 expansions per request (`maxExpand`); if the goal is not reached the path leads to the closest tile found |
| Goals | rectangles: the ring around a building, the 3×3 around a blocking resource, a single tile for moves; goal tiles may be entered even if occupied by the target |
| Memory | per-game scratch arrays (`pathG`, `pathFrom`, generation-stamped marks) reused across searches — no per-search allocation of `W·H` arrays |
| Smoothing | greedy line-of-sight pruning over a window of 24 waypoints; `lineClear` samples 3 points per tile with a ±0.3 box for unit radius |
| Repath | every 0.8–1.5 s when the path is exhausted, when a new building blocks the way, or when a chased unit moved > 2 tiles from the path end |
| Formations | group moves spread units on a √n × √n grid with 0.8-tile spacing around the target |
| Flying units | move in straight lines, ignore terrain and occupancy, never separate from ground units |

## 10. Snapshot protocol and compression

At game start each human receives one `start` message containing the
static `MapView` (dimensions, tiles as a string of digits `'0'..'6'`,
theme, objective). Thereafter every tick (10 Hz) each human receives a
**full, per-player snapshot** — not a delta:

| Field | Content |
|---|---|
| `tick`, `time` | simulation tick, seconds |
| `you`, `res`, `pop`, `cap`, `age`, `techs` | private player state (resources truncated to integers) |
| `ents` | `EntView` per visible entity: compact one/two-letter keys, coordinates rounded to 0.01, HP as a 0..1 fraction, zero values omitted (`omitempty`) |
| `ev` | filtered events of this tick |
| `fog` | run-length-encoded visibility, **only every 5th tick** (`Tick % 5 == 1`) |
| `players` | public per-player info (name, team, colour, AI, age, defeated, score) |
| `over`, `winner` | end state |

Bandwidth techniques:

1. **Compact JSON** — short keys (`i,k,t,o,x,y,h,…`), rounding, `omitempty`.
2. **Fog RLE** — `EncodeFog` writes runs as `<state><count>,` with states
   `0` unexplored, `1` explored, `2` visible (row-major); because vision is
   made of large contiguous areas this is far smaller than one byte per
   tile, and it is sent at only 2 Hz.
3. **permessage-deflate with context takeover**
   (`websocket.CompressionContextTakeover`): consecutive snapshots are
   highly similar, so the shared LZ77 window removes most of the
   repetition (e.g. static resources).
4. **Lossy delivery** — snapshots are enqueued with `lossy=true`; when a
   client's 256-message queue is full the snapshot is dropped and the next
   one supersedes it. Full (non-delta) snapshots make drops harmless.

Measured uncompressed size: about 6 KB per snapshot on a 56×56 campaign map
at game start (mostly trees and other resources); the wire size after
deflate is much smaller.

The client keeps an entity map keyed by id, records the previous rendered
position and **linearly interpolates** to the new position over 100 ms
(one tick), giving smooth motion at any display refresh rate. Entities
absent from a snapshot are removed.

## 11. Client rendering pipeline

`web/js/render.js`, `web/js/sprites.js`. Canvas 2D only, no WebGL, no image
files; everything is drawn procedurally.

```mermaid
flowchart TB
    snap["snapshot → entity map<br/>(interpolated positions)"] --> frame
    subgraph frame["Renderer.draw(F, dt) — every animation frame"]
        bg["background<br/>(+ star field on moon/space)"] --> terr["terrain chunks 8×8 tiles<br/>(lazy, ≤ 3 built per frame)"]
        terr --> water["animated water overlay<br/>(clip to water path, scrolling pattern)"]
        water --> decals["ground decals: grid, map edge,<br/>selection rings, rally flag, move marker"]
        decals --> sort["depth sort: rocks + entities by x+y"]
        sort --> ents["buildings (cached sprites / live animated),<br/>resources (cached), units (live)"]
        ents --> fx["particles, projectiles, muzzle flashes, floating texts"]
        fx --> ghost["placement ghost"]
        ghost --> fog["fog canvas (1 px per tile) drawn with iso transform"]
        fog --> hud["health bars, labels, vignette & colour grading"]
    end
    frame --> mini["minimap (every 0.25 s)"]
```

| Stage | Technique |
|---|---|
| Projection | isometric 2:1, tile 64×32 px, height unit 32 px (`util.js` `iso()`/`unIso()`) |
| Terrain "shader" | each 8×8-tile chunk is rendered once into an off-screen canvas by a per-pixel software shader (`buildChunk`): inverse-project the pixel to world space, sample fBm and value noise, **bilinearly blend the colours of the four nearest tiles** with noise-perturbed, smooth-stepped weights (soft, organic transitions instead of hard tile edges), shade shores by distance to water, apply a low-frequency light gradient; colours come from the theme palette (`THEMES` in `sprites.js`) |
| Water | each chunk keeps a `Path2D` of its water/ford tiles; per frame the chunk is clipped to it and a pre-rendered wave-crest pattern is scrolled diagonally with time at 35 % opacity (skipped in the space theme) |
| Mountains | pre-built rock sprites in 6 variants, depth-sorted with entities |
| Depth sorting | painter's algorithm on `x + y`; buildings sort by their far corner (`(x−s/2)+(y−s/2)+2s−1.2`), farms always first, carcasses slightly behind, flying units last |
| Buildings | cached per `type|era|team|stage` at 2× resolution; stages 0–2 are construction foundations; a few era buildings (granary, town centre, generator in medieval/gunpowder/future/space) are animated live; chimney smoke, camp fire and damage fire are particles |
| Units | drawn live every frame from vector parts (humans with era headgear and weapons, quadrupeds, rotated 3-D boxes for vehicles), animated by walk/attack phase, facing, carried resource and team colour |
| Particles | smoke, chimney, dust, fire, campfire, spark, wood chip, gold glint; simple ballistic integration; capped at 1 500 |
| Projectiles | arcs per type (arrow, stone, boulder, cannonball, shell, grenade, bolt) or straight beams; flight time from the server's `shot` event |
| Fog | a `W×H` canvas with one pixel per tile (alpha 255 unexplored, 120 explored, 0 visible) drawn with the iso affine transform and image smoothing → soft fog edges for free |
| Minimap | diamond projection of terrain, entities and fog, view rectangle; redrawn at 4 Hz |

Device pixel ratio is capped at 2. Terrain chunks are rebuilt only when the
map changes (editor) — in a match terrain is static.

## 12. Audio synthesis

`web/js/audio.js`; no audio files.

```mermaid
flowchart LR
    sfx["SFX voices<br/>tone() / noise() / horn()"] --> pan["per-event gain + StereoPanner"] --> sfxBus["sfx bus"]
    music["generative music<br/>pad, drums, melody"] --> musicBus["music bus (×0.55)"]
    horn["horn voices"] --> rev["Convolver reverb<br/>(2.8 s synthetic impulse)"]
    sfxBus --> master
    musicBus --> master
    rev --> master["master gain"] --> comp["DynamicsCompressor<br/>−14 dB, 4:1"] --> out["destination"]
```

| Element | Design |
|---|---|
| Primitives | `tone` (oscillator + exponential envelope + optional pitch sweep), `noise` (2 s white-noise buffer through a biquad with optional frequency sweep), `horn` (three sawtooth partials through an opening low-pass filter, sent to reverb) |
| Effects | about 30 named sounds (chop, mine, hammer, clash, arrow, musket, cannon, laser, plasma, collapse, age fanfare, alert, victory, …) composed from the primitives |
| Spatialisation | pan from the event's screen x; volume 1 on screen, falling with distance off-screen |
| Throttling | per sound name (30–90 ms) so a large battle does not saturate the graph |
| Music | one style per era: mode (pentatonic, phrygian, aeolian, dorian, major, mixolydian), root note, tempo 72–104 BPM, lead/pad/drum instruments; a 4-chord progression (re-chosen every 8 bars); pad chord each bar, percussion pattern, melody as a constrained random walk on the scale |
| Scheduling | look-ahead scheduler (`setInterval` 100 ms, schedules 0.5 s ahead on the audio clock) |
| Settings | master / effects / music / mute in `localStorage["lotl.audio"]`; the context is created on the first user gesture |

## 13. Levels

### 13.1 Format

A level is a JSON-serialised `game.Level`:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | `campaign-NN`, `u-<16 hex>` (custom) or empty (new) |
| `name`, `description`, `author` | string | cleaned text (see limits) |
| `theme` | string | `temperate, desert, winter, tropical, moon, mars, space` |
| `width`, `height` | int | 24..128 |
| `startAge`, `maxAge` | int | 0..16, `maxAge ≥ startAge` |
| `objective` | `{type, minutes?}` | `conquest`, `survive` (1..120 min), `advance` |
| `startRes` | `[5]float` | 0..100 000 each; all zero → defaults |
| `tiles` | string | `width·height` digits `'0'..'6'` (row-major) |
| `objects` | `[{k,x,y}]` | ≤ 6 000; kinds `tree, berry, gold, stone, crystal, deer, boar, mammoth` |
| `starts` | `[{x,y}]` | 2..8 start positions |
| `maxPlayers` | int | derived from `len(starts)` |
| `opponents` | int | default AI count for quick play |
| `difficulty` | string | `easy`, `normal`, `hard` |
| `gen` | `GenParams` | generator parameters instead of tiles (built-in levels only) |

Terrain codes: `0` grass, `1` dirt, `2` sand, `3` water (impassable; void in
space), `4` mountain (impassable), `5` ford (passable, slower), `6` road.

### 13.2 Validation (`Level.Validate`)

Run on every save, on every load from disk and for every built-in level at
start-up (panics if a campaign level is invalid). It normalises text
(`CleanText`: strips C0/C1 control characters, U+2028/9, bidi overrides
U+202A–E and U+2066–9, trims to the rune limit) and rejects
out-of-range values. The full limit table is in
[level-editor.md](level-editor.md#limits). Custom levels sent by clients
always have `gen` cleared, so they must carry explicit tiles.

### 13.3 Procedural generation

`generate(w, h, players, gen, theme, startAge)` — deterministic per seed:

1. Start positions on a ring of radius `0.68 · min(w,h)/2` at a random
   offset angle.
2. Two value-noise fields (fBm, 4 and 3 octaves) → water (`e > 1 − 0.45·water`,
   ≥ 9 tiles from a start), beaches, dirt patches, mountains
   (`> 1 − 0.35·mountains`, ≥ 10 tiles away); optional river across the
   centre with a noisy edge and sandy banks.
3. Connectivity: a wiggly 3-wide corridor is carved from each start to the
   next and to the map centre, turning water into fords and mountains into
   dirt — every start can reach every other.
4. Clear a radius 6.5 around each start; reserve 7×7 for the town centre.
5. Forests from a third noise field; scattered single trees.
6. **Fair personal resources** for each start (identical counts): 6 berries,
   4 gold, 4 stone, 3 tree clusters, 3 crystals (from age 10 or on
   moon/mars/space), deer and one mammoth (≤ Neolithic) or boar.
7. Extra contested clusters scaled by map area and `riches`, ≥ 14 tiles from
   any start.

Built-in campaign levels store only `gen` and are materialised for the
actual number of players when a game starts; `GET /api/levels/{id}`
returns the materialised map so the editor can open (a copy of) it.

## 14. Level editor

`web/editor.html` + `web/js/editor.js` reuse the game renderer. It edits a
level in memory (`Uint8Array` tiles, `Map` of objects keyed by tile index,
start list), validates client-side with the same rules as the server, and
talks to `GET /api/defs`, `GET /api/levels[/id]`, `POST /api/generate`,
`POST /api/levels`. Undo keeps 40 snapshots. Usage is documented in
[level-editor.md](level-editor.md).

## 15. Victory and scoring

| Objective | Win condition (checked every second) |
|---|---|
| conquest | only one team has non-defeated players |
| survive | after `minutes`, the team of the first surviving human wins |
| advance | first player to reach `maxAge` wins for their team |

A player is **defeated** when they own no unit and no building other than
farms and houses; their remaining entities are removed. Resigning removes
everything immediately.

Score (`Game.Score`):
`gathered/10 + killValue/5 + 60·techs + 400·(age − startAge) + 15·built + 5·trained`,
plus, for winners, `2000 + max(0, 1500 − 30·minutes)`. Only registered human
players' results are stored (top 25 per level).
