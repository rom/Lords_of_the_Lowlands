# API reference

All endpoints are served by `lotl-server` on the same origin as the web
client. Routes are registered in `Server.routes()`
(`internal/server/server.go`); the WebSocket protocol lives in
`protocol.go`, `hub.go` and `room.go`.

## Conventions

| Topic | Rule |
|---|---|
| Format | JSON (`application/json; charset=utf-8`), `Cache-Control: no-store` on API responses |
| Errors | `{"error": "<message>"}` with a 4xx/5xx status |
| Authentication | session cookie `lotl_session` (32 random bytes, base64url, 43 chars), `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=604800` (7 days), `Secure` when TLS or `-secure-cookies` |
| Request bodies | `Content-Type: application/json` required for every non-GET `/api/*` request except `DELETE` (else **415**); at most **1 MiB** (`http.MaxBytesReader`; **512 KiB** for `POST /api/levels`); exactly one JSON value; **unknown fields are rejected** (`DisallowUnknownFields`) → **400** `invalid JSON body` |
| CSRF | non-GET `/api/*` requests must carry an `Origin` (or `Referer`) whose host equals the request `Host` or one of `-allow-origin`; requests without either header are accepted only if `Sec-Fetch-Site` is absent or `same-origin` → else **403** `cross-origin request refused` |
| Rate limits | all `/api/*`: 20 requests/s per client IP, burst 60 → **429** `rate limit exceeded`; `register`/`login` additionally 1 per 5 s, burst 8 → **429** `too many attempts, try later` |
| Client IP | `RemoteAddr`; the last `X-Forwarded-For` entry only with `-trust-proxy` |
| Security headers | every response: CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, COOP/CORP `same-origin`, `Permissions-Policy`; HSTS with secure cookies |

## REST endpoints

| Method | Path | Auth | Success | Errors |
|---|---|---|---|---|
| GET | `/healthz` | — | 200 `ok` (text) | |
| POST | `/api/register` | — | 201 | 400, 409, 415, 429 |
| POST | `/api/login` | — | 200 | 400, 401, 415, 429 |
| POST | `/api/guest` | — | 200 | 400, 409, 415 |
| POST | `/api/logout` | cookie (optional) | 200 | |
| GET | `/api/me` | cookie | 200 | 401 |
| GET | `/api/defs` | — | 200 | |
| GET | `/api/levels` | — | 200 | |
| GET | `/api/levels/{id}` | — | 200 | 404 |
| POST | `/api/levels` | registered | 201 | 400, 401, 403, 429 |
| DELETE | `/api/levels/{id}` | registered, owner | 200 | 401, 403, 404, 500 |
| POST | `/api/generate` | — | 200 | 400 |
| GET | `/api/scores?level=<id>` | — | 200 | 400 |
| GET | `/api/leaderboard` | — | 200 | |
| GET | `/api/online` | — | 200 | |
| GET | `/api/players/{name}` | — | 200 | 404 |
| GET | `/ws` | cookie | 101 | 401 |
| GET | `/`, `/editor.html`, `/js/*`, `/css/*` | — | 200 (embedded files, `Cache-Control: no-cache`) | 404 |

Every `/api/*` response may also be **429** (global limiter); every non-GET
may be **403** (CSRF) or **415** (content type).

### Accounts and sessions

#### `POST /api/register`

```http
POST /api/register HTTP/1.1
Content-Type: application/json
Origin: https://lotl.example

{"name": "Alice", "password": "correct horse"}
```

```http
HTTP/1.1 201 Created
Set-Cookie: lotl_session=CPmlDUxTrr…; Path=/; Max-Age=604800; HttpOnly; SameSite=Strict

{"guest":false,"name":"Alice"}
```

| Status | Body | Cause |
|---|---|---|
| 400 | `name must be 3-20 letters, digits, _ or -` | name not `^[A-Za-z0-9_-]{3,20}$` |
| 400 | `password must be 8-128 characters` | |
| 409 | `name already taken` | registered, or currently used by a logged-in guest (case-insensitive) |
| 429 | `too many attempts, try later` | auth limiter |

#### `POST /api/login`

Body `{"name","password"}`. **200** `{"guest":false,"name":"Alice"}` + cookie;
**401** `invalid name or password` (same message and comparable timing for
unknown users — a dummy argon2id hash is computed). Names are
case-insensitive; the stored spelling is returned.

#### `POST /api/guest`

Body `{"name":"Bob_1"}`. **200** `{"guest":true,"name":"Bob_1"}` + cookie.
**400** bad name, **409** `name is registered or in use`. Guests can play
everything but cannot save levels and are not recorded in scores.

#### `POST /api/logout`

Deletes the server-side session and expires the cookie. Always **200**
`{"ok":true}`.

#### `GET /api/me`

```json
{"name":"Alice","guest":false,
 "stats":{"name":"Alice","games":3,"wins":2,"losses":1,"bestScore":5120,"campaign":2}}
```

`stats` is present only for registered users. **401** `not logged in`.

### Game data

#### `GET /api/defs`

Static definitions used by the client to render and build its UI:

```json
{
  "ages": [{"id":0,"name":"Dawn Age","era":"stone","years":"c. 300,000 BC","desc":"…","advanceCost":[0,0,0,0,0],"advanceTime":0}, …],
  "units": {"clubman": {"id":"clubman","name":"Clubman","class":"infantry","age":0,"era":"stone",
            "cost":[80,0,0,0,0],"hp":48,"attack":6,"armor":0.1,"range":0.8,"minRange":0,"reload":1.4,
            "speed":1,"sight":5,"trainTime":14,"pop":1,"trainedAt":"barracks","projectile":"",
            "flying":false,"splash":0,"sprite":"club","desc":"Swings a heavy wooden club."}, …},
  "buildings": {"town_center": {"id":"town_center","name":"Camp Fire","age":0,"size":3,"hp":1400,
            "cost":[0,275,100,0,0],"buildTime":120,"pop":10,"dropoff":[0,1,2,3],"trains":["worker"], …}, …},
  "buildingNames": {"house": {"stone":"Hut","bronze":"Mud House", …}, …},
  "techs": {"gather_0": {"id":"gather_0","name":"Flint Knapping","age":0,"kind":"gather","amount":0.15,
            "cost":[100,75,0,0,0],"time":25,"desc":"+15% gather rate"}, …},
  "resources": {"tree": {"id":"tree","name":"Tree","res":1,"amount":120,"rate":1,"block":true}, …},
  "unitLine": {"infantry": ["clubman","spearman", …], "mounted": ["","","onager_rider", …], …},
  "resNames": ["Food","Wood","Stone","Gold","Energy"]
}
```

Resource arrays are always `[food, wood, stone, gold, energy]`.

#### `GET /api/levels`

```json
{
  "campaign": [
    {"id":"campaign-01","name":"The First Fire","description":"…","author":"Campaign","theme":"temperate",
     "width":56,"height":56,"startAge":0,"maxAge":1,"maxPlayers":4,
     "objective":{"type":"conquest"},"campaign":1,"opponents":1,"difficulty":"easy"}, …
  ],
  "custom": [
    {"id":"u-3f9c2a…","name":"Polder Wars","author":"Alice","description":"…","width":64,"height":64,
     "startAge":0,"maxAge":3,"maxPlayers":2,"theme":"temperate","created":"2026-11-14T13:00:00Z"}
  ]
}
```

#### `GET /api/levels/{id}`

Returns a complete `Level` (see [level-editor.md](level-editor.md#file-format)).
Built-in levels are materialised (tiles, objects and starts generated for
`maxPlayers`) and `gen` removed so the editor can open them. **404**
`level not found`.

#### `POST /api/levels`

Registered users only. Body: a `Level`. The server forces `author` to the
caller, clears `gen`, runs `Level.Validate()`, and

- if `id` names an existing level **owned by the caller** → replaces it;
- if `id` names someone else's level → **403** `forbidden`;
- otherwise assigns a new id `u-<16 hex>` (limits: 50 levels per user,
  5 000 total → **429** `limit reached`).

**201** `{"id":"u-3f9c2a…"}`. **400** with the validation message (e.g.
`level needs 2..8 start positions`). **401** `log in with an account to save levels`.

#### `DELETE /api/levels/{id}`

Owner only. **200** `{"ok":true}`, **401**, **403** `forbidden`, **404** `not found`.

#### `POST /api/generate`

Returns a random map as a full `Level` (`id` empty, `name` `"New Level"`).

```json
{"theme":"desert","size":72,"startAge":0,"maxAge":3,"seed":12345,"water":0.3,"players":4}
```

All fields optional: `size` 0 → 72 (else 24..128), `players` outside 2..8 → 2,
`water` outside 0..1 → 0.3, `maxAge < startAge` → `startAge`. **400** on
validation errors (e.g. size out of range, unknown theme).

### Hall of fame

| Endpoint | Response |
|---|---|
| `GET /api/scores?level=campaign-03` | `[{"level":"campaign-03","name":"Alice","score":5120,"won":true,"age":3,"mins":18.2,"date":"…"}]` — top 25 of that level; without `level` the top 50 across all levels; **400** `bad level` if `level` > 64 bytes |
| `GET /api/leaderboard` | top 25 `PublicUser` by wins, then best score, then name |
| `GET /api/online` | `["Alice","Bob_1"]` — names with an open WebSocket |
| `GET /api/players/{name}` | `{"name":"Alice","games":3,"wins":2,"losses":1,"bestScore":5120,"campaign":2}`; **404** `no such player` |

Password salts and hashes are never serialised (`User.Public()`).

## WebSocket `/ws`

- Requires a valid session cookie, otherwise **401** before the upgrade.
- Origin is checked by `websocket.Accept`: the `Origin` host must equal the
  request host or match an `-allow-origin` pattern.
- **permessage-deflate** with context takeover is negotiated.
- Text frames only, one JSON object per frame. Client frames are limited to
  **16 KiB** (`MaxMessageBytes`; larger frames close the connection).
- The server pings every 20 s; a write that takes longer than 10 s closes
  the connection.
- A second connection with the same name replaces the first (the old one
  receives `error: logged in from another window`).
- Invalid messages are answered with `{"t":"error","msg":…}` and otherwise
  ignored; the connection stays open.

### Client → server

Every message has a type `t`. Only fields relevant to the type are read;
all are validated by `ParseClientMsg`.

| `t` | Fields | Effect | Limits |
|---|---|---|---|
| `ping` | — | `pong` reply | |
| `chat` | `ch` (`global`\|`room`\|`team`\|`whisper`), `text`, `to` (whisper) | chat | text cleaned and cut to 300 runes, must be non-empty; `to` ≤ 32 bytes; 1 msg/s, burst 5 |
| `create` | `name`, `level` or `skirmish`, `diff` | create a lobby room (you are host) | name cleaned to 48 runes (default `Battle`); `level` ≤ 64 bytes; skirmish rooms have 4 seats |
| `quick` | `level` or `skirmish`, `opp`, `diff` | create and immediately start a game vs AI | `opp` 0..7 (0 = level default); skirmish players = `opp + 1` |
| `join` | `room` | take the first open seat | `room` ≤ 32 bytes; lobby state only |
| `leave` | — | leave the room; resigns if the game is running | |
| `slot` | `slot`, `kind` (`open`\|`closed`\|`ai`), `team`, `diff` | host edits a seat | `slot` 0..7, `team` 0..8 |
| `team` | `team` | change your own team | 0..8 |
| `start` | — | host starts the match | ≥ 2 players on ≥ 2 teams |
| `cmd` | `cmd` (see below) | game command | 25 cmds/s, burst 60 (excess silently dropped); ≤ 120 ids; `w` ≤ 40 chars without `<>"'\` |

`diff` is `""`, `easy`, `normal` or `hard`. `skirmish` is
`{"theme","size","startAge","maxAge","seed","water"}` (size 0..128, ages 0..16).

Examples:

```json
{"t":"chat","ch":"global","text":"gg"}
{"t":"chat","ch":"whisper","to":"Alice","text":"rematch?"}
{"t":"quick","level":"campaign-04","diff":"hard"}
{"t":"quick","opp":3,"diff":"normal","skirmish":{"theme":"winter","size":96,"startAge":4,"maxAge":9,"seed":42,"water":0.25}}
{"t":"create","name":"Friday night","level":"u-3f9c2a0d11aa47e0"}
{"t":"slot","slot":2,"kind":"ai","team":2,"diff":"hard"}
{"t":"start"}
```

#### Game commands (`cmd`)

`game.Command`: `c` type, `ids` unit ids, `x`/`y` world coordinates (tile
units, floats; NaN/Inf rejected, clamped to the map), `t` target entity id,
`w` argument, `i` index/count. The player is **never** read from the
message; it is the seat of the connection.

| `c` | Fields | Meaning | Validation in `Game.Apply` |
|---|---|---|---|
| `move` | `ids, x, y` | move in formation | own units |
| `amove` | `ids, x, y` | attack-move | own units |
| `smart` | `ids, t, x, y` | context action on target (gather, hunt, build/repair, farm, attack); falls back to move to `x,y` | own units; target must be visible to the player |
| `attack` | `ids, t` | attack target | visible target |
| `gather` | `ids, t` | gather/hunt | visible target, workers |
| `repair` | `ids, t` | build/repair own building | |
| `build` | `ids, x, y, w` | place building `w` with its top-left tile at `x,y` | workers among `ids`; age requirement; explored, free, non-ford footprint; cost |
| `train` | `t, w, i` | queue unit of class or id `w` at building `t`; `i` 2..5 = repeat | own built building; trains that class; age; cost; queue ≤ 10 |
| `research` | `t, w` | tech id or `"age"` | academy for techs / town centre for `age`; age; not yet researched or queued; cost |
| `cancel` | `t, i` | cancel queue item `i` (full refund) or an unfinished building (75 % refund) | own building |
| `rally` | `t, x, y` | set rally point | own building |
| `stop` | `ids` | idle | |
| `delete` | `ids` | destroy own units/buildings | |
| `resign` | — | concede | |

```json
{"t":"cmd","cmd":{"c":"build","ids":[17,18],"x":31,"y":22,"w":"house"}}
{"t":"cmd","cmd":{"c":"train","t":5,"w":"infantry","i":5}}
{"t":"cmd","cmd":{"c":"research","t":5,"w":"age"}}
{"t":"cmd","cmd":{"c":"smart","ids":[17],"t":262,"x":8.5,"y":28.5}}
```

Rejected commands produce `{"t":"cmderr","msg":…}` with one of
`not your entity`, `not enough resources`, `invalid command`,
`cannot build there`, `queue full`, `not available in your age`.

### Server → client

| `t` | Delivery | Payload |
|---|---|---|
| `hello` | reliable | `{"name","guest"}` — first message after connect |
| `chat` | reliable | `{"ch","from","to"?,"text","ts"}` (Unix seconds); last 50 global messages are replayed after `hello` |
| `lobby` | lossy | `{"rooms":[roomSummary],"online":[names]}` — on every lobby change |
| `room` | reliable | room view: `{"id","name","host","state","level":{levelInfo},"slots":[{"kind","name","team","diff"}]}` |
| `start` | reliable | `{"map":MapView,"you","players","cam":[x,y],"level":{levelInfo},"room"}` |
| `snap` | lossy, 10 Hz | `{"s": Snapshot}` |
| `cmderr` | lossy | `{"msg"}` |
| `end` | reliable | `{"results":[Result],"winner":team}` |
| `error` | reliable | `{"msg"}` |
| `pong` | lossy | `{}` |

*Lossy* messages are dropped if the client's 256-message send queue is
full; if a *reliable* message does not fit, the client is disconnected.

Examples (abridged):

```json
{"t":"hello","name":"Alice","guest":false}
{"t":"lobby","rooms":[{"id":"r3","name":"Friday night","host":"Alice","level":"Polder Wars",
  "levelId":"u-3f9c2a0d11aa47e0","state":"lobby","players":2,"max":4,"open":2}],"online":["Alice","Bob_1"]}
{"t":"start","room":"r1","you":0,"cam":[11.5,37.5],
 "map":{"w":56,"h":56,"tiles":"0000000000000000000000001111111111100000…","theme":"temperate",
        "name":"The First Fire","desc":"…","objective":{"type":"conquest"},"maxAge":1,"startAge":0},
 "players":[{"i":0,"n":"Alice","t":1,"c":0,"ai":false,"g":0,"d":false,"s":0},
            {"i":1,"n":"Boudica (AI)","t":2,"c":1,"ai":true,"g":0,"d":false,"s":0}],
 "level":{"id":"campaign-01","name":"The First Fire", "…":"…"}}
{"t":"end","winner":2,"results":[{"player":1,"name":"Boudica (AI)","team":2,"ai":true,"won":true,
  "score":3499,"age":0,"kills":0,"lost":0,"gathered":0,"techs":0}, …]}
```

#### Snapshot

```json
{"t":"snap","s":{
  "tick":1,"time":0.1,"you":0,"res":[200,200,150,0,0],"pop":3,"cap":10,"age":0,"techs":null,
  "ents":[
    {"i":262,"k":2,"t":"tree","o":-1,"x":8.5,"y":28.5,"h":1,"a":120},
    {"i":301,"k":1,"t":"town_center","o":0,"x":11.5,"y":37.5,"h":1,"m":1400,"q":[{"u":"worker_0","p":0.35}]},
    {"i":305,"k":0,"t":"worker_0","o":0,"x":13.12,"y":37.9,"h":1,"m":25,"s":4,"b":true,"f":1.57,"c":6,"r":1}
  ],
  "ev":[{"k":"work","x":8.5,"y":28.5,"o":0,"p":"tree"}],
  "fog":"01576,27,047,211,044,213,…",
  "players":[…],"winner":-1}}
```

| Key | Meaning |
|---|---|
| `i,k,t,o` | id; kind 0 unit, 1 building, 2 resource; type id; owner (−1 nature) |
| `x,y` | position (tile units, 2 decimals) |
| `h` | HP fraction 0..1 |
| `m` | max HP (own/allied only) |
| `s,b,f` | order (0 idle, 1 move, 2 attack-move, 3 attack, 4 gather, 5 build, 6 flee, 7 wander), busy, facing (radians) |
| `p` | construction progress 0..1 (unfinished buildings) |
| `c,r` | carried amount and resource index (own/allied only) |
| `a` | resource amount, or remaining farm food (own/allied) |
| `g` | age of the entity |
| `q` | production queue (own/allied): `u` unit, `t` tech, `a` age advance, `p` progress |
| `rl` | rally point `[x,y]` (own buildings) |
| `fog` | every 5th tick: RLE of `<state><count>,` (0 unexplored, 1 explored, 2 visible), row-major |

Event kinds (`ev[].k`): `shot` (`p` projectile, `tx,ty` target, `d` flight
time), `melee`, `boom` (splash, `d` radius), `death`, `collapse`, `work`,
`hammer`, `place`, `built`, `trained`, `tech`, `age` (`d` new age),
`alert` (own only), `depleted`, `defeated`, `gameover` (`d` winning team).

## Limits summary

| Limit | Value | Where |
|---|---|---|
| HTTP header bytes | 16 KiB | `main.go` `MaxHeaderBytes` |
| Header / read / idle timeout | 10 s / 30 s / 120 s | `main.go` |
| REST body | 1 MiB | `server.go` `maxBody` |
| WebSocket message | 16 KiB | `MaxMessageBytes` |
| Chat message | 300 runes | `MaxChatLen` |
| Global chat history | 50 | `hub.go` |
| Units per command | 120 | `game.MaxCommandIDs` |
| Production queue | 10 | `game.MaxQueue` |
| Client send queue | 256 messages | `hub.go` |
| Room command channel / per-tick commands | 512 / 1024 | `room.go` |
| Concurrent rooms | `-max-rooms` (200) | `hub.newRoom` |
| Players per game | 2..8 | `game.MaxPlayers` |
| Session lifetime | 7 days (in memory) | `sessionTTL` |
| Level size / objects / starts | 24..128 / 6 000 / 2..8 | `level.go` |
| Custom levels | 50 per user, 5 000 total | `store.go` |
| Scores kept | 25 per level | `store.go` |
| Rate-limiter keys | 100 000 (new keys refused beyond) | `ratelimit.go` |
