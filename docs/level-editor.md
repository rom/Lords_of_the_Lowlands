# Level editor

Open **Level Editor** from the main menu, or go to `/editor.html`. The
editor uses the game's own renderer, so maps look exactly as in a match.
Anyone can edit, download and upload levels; **saving to the server and
playtesting require a registered account** (guests can still download).

```text
┌──────────────────────────────────────────────────────────────────┐
│ Game · New · Generate · Open · Undo · Save · Playtest · Down/Upload │
├────────────┬──────────────────────────────────┬──────────────────┤
│ Terrain    │                                  │ Level properties │
│ Objects    │       isometric map view         │ name, theme,     │
│ Tools      │                                  │ ages, objective, │
│ Brush      │                                  │ map type, AI,    │
│            │                                  │ resources        │
└────────────┴──────────────────────────────────┴──────────────────┘
```

## Tools

| Palette | Entries | Notes |
|---|---|---|
| **Terrain** | Grass, Dirt, Sand, Water, Mountain, Ford, Road | Water and Mountain are impassable for land units; painting Water removes land objects, painting Mountain removes every object, painting land removes fish; Ford is passable (also for boats) but slower; colours follow the selected theme |
| **Objects** | tree, berry, gold, stone, crystal, fish, deer, boar, mammoth | **fish only on water**, everything else not on water or mountains; with a brush larger than 1×1 objects are scattered (trees ≈ 70 % fill, others ≈ 35 %) |
| **Tools** | erase, start | *erase* removes objects under the brush; *start* toggles a player start position: click to add, click within 2 tiles of an existing start to remove (2–8 starts) |
| **Brush** | 1×1, 3×3, 5×5, 9×9 | applies to terrain, objects and erase; a preview outline follows the cursor |
| **Grid** | checkbox | tile grid overlay |

## Mouse and keyboard

| Input | Action |
|---|---|
| Left button (drag) | paint with the current tool |
| Right button (drag) | pan |
| Mouse wheel | zoom around the cursor |
| Arrow keys | pan |
| Ctrl+Z / ⌘Z, **Undo** | undo the last stroke (40 steps) |

## Properties panel

| Field | Values |
|---|---|
| Name | required, ≤ 48 characters |
| Description | ≤ 600 characters |
| Theme | temperate, desert, winter, tropical, moon, mars, space |
| Start age / Final age | any of the 17 ages; final ≥ start |
| Objective | Conquest; Survive (minutes 1–120); Advance first (needs final > start) |
| Map type | inland, coastal, riverland, lakes, desert, highland — selects farm yield and map-specific technologies; boats need an earthly theme, a non-desert type and ≥ 2 % water |
| AI difficulty | super easy, easy, normal, hard, super hard, insane (default for quick play on this level) |
| Starting resources | food/wood/stone/gold/energy, 0–100 000 each; all zero = the game's defaults for the start age |

Below the fields the editor shows the map size, object and player counts
and the first validation problem, if any. The same rules are checked again
by the server.

## Toolbar

| Button | Effect |
|---|---|
| **New** | dialog for width, height (24–128) and theme; starts with plain grass and two starts in opposite corners |
| **Generate** | replaces the map with a procedurally generated one (`POST /api/generate`) using the current theme, width, ages and number of starts (min 2) and a random seed; name, description and id are kept. The editor does not send the map type, so the result is an **inland** map and the map type resets to inland — set it again afterwards (and add fish/water by hand) |
| **Open…** | opens a campaign level (as a copy, " (copy)" appended) or a player level; levels by other authors open as copies, your own levels open for editing |
| **Save to server** | validates, then `POST /api/levels`; first save assigns an id, later saves update your level |
| **Playtest** | saves, then starts a quick game on it (`/?play=<id>`) |
| **Download** | saves the level as `<name>.json` locally |
| **Upload** | loads a `.json` level file (≤ 512 KB): checks size, tiles alphabet, object kinds and bounds, clamps ages, defaults theme/objective, keeps ≤ 8 starts; the id is cleared so saving creates a new level |

`/editor.html?level=<id>` opens a level directly.

## File format

A level file is the JSON form of `game.Level`:

```json
{
  "id": "",
  "name": "Polder Wars",
  "description": "Dikes and ditches.",
  "theme": "temperate",
  "width": 64,
  "height": 64,
  "startAge": 0,
  "maxAge": 3,
  "objective": {"type": "conquest"},
  "startRes": [200, 200, 150, 0, 0],
  "difficulty": "normal",
  "mapType": "coastal",
  "tiles": "0000…(4096 digits)…0000",
  "objects": [{"k": "tree", "x": 10, "y": 12}, {"k": "gold", "x": 20, "y": 8}, {"k": "fish", "x": 40, "y": 3}],
  "starts": [{"x": 8, "y": 8}, {"x": 55, "y": 55}]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | – | empty for a new level; `u-…` for a saved one; ignored on upload |
| `name` | string | yes | display name |
| `description` | string | – | shown in level lists and at game start |
| `author` | string | – | set by the server to the saving account |
| `theme` | string | – | default `temperate` |
| `width`, `height` | int | yes | map size in tiles |
| `startAge`, `maxAge` | int | yes | 0 = Dawn Age … 16 = Interstellar Age |
| `objective.type` | string | – | `conquest` (default), `survive`, `advance` |
| `objective.minutes` | number | survive | duration to hold out |
| `startRes` | 5 numbers | – | `[food, wood, stone, gold, energy]` |
| `difficulty` | string | – | `super_easy`, `easy`, `normal` (default), `hard`, `super_hard`, `insane` |
| `mapType` | string | – | `inland` (default), `coastal`, `riverland`, `lakes`, `desert`, `highland` |
| `opponents` | int | – | AI count for quick play; default `maxPlayers − 1` |
| `tiles` | string | yes | `width × height` characters, row-major (index `y·width + x`) |
| `objects` | array | – | `k` kind (`tree`, `berry`, `gold`, `stone`, `crystal`, `fish`, `deer`, `boar`, `mammoth`), `x`, `y` tile coordinates |
| `starts` | array | yes | player start tiles (town centre centre) |
| `maxPlayers` | int | – | derived from `starts` by the server |

Tile characters:

| Char | Terrain | Passable | Buildable |
|---|---|---|---|
| `0` | grass (regolith/plating on moon, mars, space) | yes | yes |
| `1` | dirt | yes | yes |
| `2` | sand | yes | yes |
| `3` | water (void in space) | no | no |
| `4` | mountain | no | no |
| `5` | ford / shallows | yes (×1.3 cost) | no |
| `6` | road / paving | yes | yes |

Every start position gets a town centre on its 3×3 area and its 5×5
surroundings are cleared of objects and made passable when the game starts.

## Limits

Enforced by `Level.Validate()` (`internal/game/level.go`) on save, and on
load of the server's data files:

| Rule | Limit | Error message |
|---|---|---|
| Name | required; cleaned; ≤ 48 runes | `level name required` |
| Description, author | cleaned; ≤ 600 / 48 runes | (truncated) |
| Theme | one of the 7 themes | `unknown theme "…"` |
| Width, height | 24 … 128 | `map size must be between 24 and 128` |
| Ages | 0 ≤ startAge ≤ maxAge ≤ 16 | `invalid age range` |
| Objective | `conquest`, `survive` (1–120 min), `advance` (maxAge > startAge) | `survive objective needs 1..120 minutes`, `advance objective needs maxAge > startAge`, `unknown objective "…"` |
| Start resources | each 0 … 100 000, not NaN | `invalid start resource N` |
| Difficulty | one of the 6 levels (empty → normal) | `invalid difficulty` |
| Map type | one of the 6 map types (empty → inland) | `unknown map type "…"` |
| Tiles | length = width × height; characters `0`–`6` | `tiles length does not match dimensions`, `invalid tile at N` |
| Objects | ≤ 6 000; known kind; inside the map (the server does not check the terrain under an object; the editor keeps fish on water) | `too many objects`, `unknown object kind "…"`, `object out of bounds` |
| Starts | 2 … 8; at least 2 tiles from every edge; on passable terrain | `level needs 2..8 start positions`, `start position too close to edge`, `start position on impassable terrain` |
| Opponents | 0 … maxPlayers−1 (otherwise reset to maxPlayers−1) | – |

Text cleaning removes control characters, Unicode line/paragraph
separators and bidirectional override/isolate characters, and trims
whitespace.

Server-side storage limits: 50 levels per account, 5 000 levels in total,
request body ≤ 1 MiB. Only the author can overwrite or delete a level.

## Tips

- Keep at least one passable route between all starts — the generator
  carves fords and passes automatically, hand-made maps do not.
- Give every start the same nearby resources for fair multiplayer: berries
  (food early), 4+ gold and stone tiles, trees, and crystals if the level
  reaches the Industrial Age (energy).
- Space themes (`moon`, `mars`, `space`) look best with crystals instead of
  animals; the generator omits animals there. They never have boats.
- For naval maps choose `coastal`, `riverland` or `lakes`, give every start
  a stretch of shore (a dock needs two water tiles along its edge) and a
  few fish within reach. Fish are only harvestable by fishing boats.
- `desert` maps cut farm yield to 60 % but unlock Irrigation and Qanats;
  `highland` unlocks Terrace Farming and Deep Mining.
- Use **Survive** for defensive scenarios: the human side wins when the
  timer runs out, and AI opponents are allied against the player in quick
  play.
