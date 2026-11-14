# Architecture

Lords of the Lowlands is a single Go binary (`lotl-server`) that hosts the
game simulation, the lobby/chat back-end, a small JSON-file database and the
embedded browser client. Browsers render the game and send commands; the
server is the only authority over game state.

The views below follow the [C4 model](https://c4model.com/): context →
containers → components, followed by the run-time view of a match, the
concurrency model and persistence.

## 1. System context

```mermaid
flowchart LR
    player(["Player<br/>(web browser)"])
    admin(["Operator"])
    subgraph host["Linux host"]
        lotl["Lords of the Lowlands<br/>lotl-server"]
    end
    proxy["Reverse proxy<br/>(optional, TLS)"]
    systemd["systemd / container runtime"]
    journal[("journald / log driver")]

    player -- "HTTPS / WSS<br/>HTML, JS, REST, WebSocket" --> proxy
    player -. "HTTP(S) direct" .-> lotl
    proxy -- "HTTP + X-Forwarded-For" --> lotl
    admin -- "systemctl, env file" --> systemd
    systemd -- "socket activation, sandbox" --> lotl
    lotl -- "JSON logs on stderr" --> journal
```

There are no outbound dependencies: no database server, no CDN, no external
identity provider, no telemetry. The server never opens an outbound
connection (enforced by Landlock and SELinux, see [security.md](security.md)).

## 2. Containers

```mermaid
flowchart TB
    subgraph browser["Browser (untrusted)"]
        ui["Web client<br/>vanilla ES modules, Canvas 2D,<br/>Web Audio — web/js/*.js"]
        editor["Level editor<br/>web/editor.html + editor.js"]
    end
    subgraph proc["lotl-server process (Go, static, sandboxed)"]
        http["HTTP layer<br/>net/http + middleware<br/>internal/server"]
        ws["WebSocket hub & rooms<br/>internal/server (hub.go, room.go)"]
        sim["Game simulation<br/>internal/game"]
        camp["Campaign<br/>internal/levels"]
        store["Store<br/>internal/store"]
        static["Embedded client<br/>web (go:embed)"]
        hard["Hardening<br/>internal/hardening"]
    end
    data[("Data directory<br/>users.json, scores.json, levels.json")]

    ui -- "GET /, /js/*, /css/*" --> static
    ui -- "REST /api/*" --> http
    ui -- "WebSocket /ws (JSON, permessage-deflate)" --> ws
    editor -- "REST /api/levels, /api/generate" --> http
    http --> store
    http --> camp
    ws --> sim
    ws --> store
    camp --> sim
    store -- "atomic JSON writes" --> data
    hard -. "applied once at start-up" .-> proc
```

| Container | Technology | Responsibility |
|---|---|---|
| Web client | ES modules, Canvas 2D, Web Audio, no build step | rendering, input, HUD, interpolation, procedural art/audio |
| Level editor | same stack, `editor.html` | painting terrain/objects/starts, save/download/upload |
| HTTP layer | `net/http` (Go 1.22+ pattern routing) | accounts, sessions, REST API, static files, security headers, CSRF and rate limiting |
| Hub & rooms | `github.com/coder/websocket` | connections, chat, lobby, room/slot management, match loop |
| Simulation | pure Go, no I/O | deterministic tick-based game rules, AI, pathfinding, fog, snapshots |
| Store | `encoding/json`, `golang.org/x/crypto/argon2` | accounts (argon2id), scores, custom levels |
| Hardening | `golang.org/x/sys/unix` | no_new_privs, capability drop, Landlock, seccomp |

## 3. Components

### 3.1 Packages

```mermaid
flowchart LR
    main["cmd/lotl-server<br/>flags, env, listener,<br/>socket activation, shutdown"]
    server["internal/server"]
    game["internal/game"]
    levels["internal/levels"]
    store["internal/store"]
    hardening["internal/hardening"]
    web["web"]

    main --> server
    main --> store
    main --> hardening
    main --> web
    server --> game
    server --> levels
    server --> store
    levels --> game
    store --> game
```

The dependency graph is acyclic and layered: `game` depends on nothing but
the standard library; `levels` and `store` depend on `game` (for `Level`
validation); `server` composes everything; `hardening` is independent and is
only called from `main`.

| Package | Key files | Main types / functions |
|---|---|---|
| `cmd/lotl-server` | `main.go` | `parseFlags`, `listener` (systemd `LISTEN_FDS`), `run` |
| `internal/server` | `server.go` | `Server`, `Config`, `routes()`, middleware `recoverer → securityHeaders → limit` |
| | `ratelimit.go` | `Limiter` (keyed token bucket), `clientIP` |
| | `protocol.go` | `ClientMsg`, `ParseClientMsg` (validation of every WebSocket message) |
| | `hub.go` | `Hub`, `Client` (reader/writer goroutines, bounded send queue), chat |
| | `room.go` | `Room`, `Slot`, lobby actions, `loop()` / `tick()`, result recording |
| `internal/game` | `game.go` | `Game`, `Entity`, `Player`, `Step()`, combat, economy, visibility, victory |
| | `commands.go` | `Command`, `Apply()` (validation + execution of player orders) |
| | `defs.go` | `Ages`, `Units`, `Buildings`, `Techs`, `Resources`, `Counter()` |
| | `path.go` | A* `findPath`, `smoothPath`, `lineClear` |
| | `ai.go` | `AI.think()` — economy, construction, research, military |
| | `snapshot.go` | `Snapshot()`, `EncodeFog()`/`DecodeFog()`, `MapView` |
| | `level.go` | `Level`, `Validate()`, `Materialize()`, procedural `generate()` |
| `internal/levels` | `levels.go` | 17 campaign `spec`s, `Campaign()`, `Get()`, `Skirmish()` |
| `internal/store` | `store.go` | `Store`, `Register`/`Authenticate`, `RecordGame`, `SaveLevel` |
| `internal/hardening` | `hardening_linux.go`, `seccomp_*.go` | `Apply()`, `DropCapabilities()`, Landlock, `BuildFilter()` |
| `web` | `embed.go`, `index.html`, `editor.html`, `js/`, `css/` | `FS()` |

### 3.2 Server components

```mermaid
flowchart TB
    subgraph mw["HTTP middleware chain (Server.Handler)"]
        rec["recoverer<br/>panic → 500"] --> sec["securityHeaders<br/>CSP, XFO, COOP, HSTS…"] --> lim["limit<br/>/api/*: rate limit, CSRF,<br/>Content-Type, 1 MiB body"] --> mux["ServeMux routes"]
    end
    mux --> auth["auth handlers<br/>register / login / guest / logout / me"]
    mux --> lvl["level handlers<br/>levels / generate / save / delete"]
    mux --> hof["scores / leaderboard / players / online"]
    mux --> wsH["/ws → Hub.serveWS"]
    mux --> fs["static FileServer (embed.FS)"]
    auth --> sess["in-memory sessions<br/>map[token]*session"]
    wsH --> sess
    wsH --> hub["Hub<br/>clients, byName, rooms, chat history"]
    hub --> room["Room × N<br/>slots, game, cmds chan, loop goroutine"]
    room --> g["game.Game"]
    auth --> st["store.Store"]
    lvl --> st
    room -- "RecordGame" --> st
```

### 3.3 Client components

| Module | Role |
|---|---|
| `main.js` | application shell: screens (login, menu, campaign, skirmish, lobby, room, hall of fame, settings), `Net` wiring, message dispatch |
| `net.js` | `Net`: WebSocket with exponential reconnect and an outbound queue (≤ 50 messages while offline) |
| `game.js` | in-match client: snapshot ingestion, interpolation, selection, control groups, command buttons, HUD, minimap, chat box |
| `render.js` | `Renderer`: isometric terrain chunks, water, entities, particles, projectiles, fog, minimap |
| `sprites.js` | procedural art: terrain palettes per theme, buildings per era, units per sprite key, icons |
| `audio.js` | Web Audio synthesiser: sound effects and generative era music |
| `editor.js` | level editor |
| `util.js` | iso projection, colours, noise, DOM helper `el()` (textContent only), `api()` fetch wrapper |

## 4. Run-time view: a match

### 4.1 Starting a game

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant H as HTTP
    participant Hub
    participant R as Room
    participant G as game.Game
    B->>H: POST /api/login {name,password}
    H-->>B: 200 + Set-Cookie lotl_session (HttpOnly, SameSite=Strict)
    B->>H: GET /ws (Cookie)
    H->>Hub: serveWS: session lookup, websocket.Accept
    Hub-->>B: {"t":"hello"}, chat history, {"t":"lobby"}
    B->>Hub: {"t":"quick","level":"campaign-01","diff":"easy"}
    Hub->>Hub: ParseClientMsg (validate)
    Hub->>R: newRoom + AI slots
    R->>G: game.NewGame(level, setups, seed)
    R-->>B: {"t":"start", map, you, players, cam, level}
    R->>R: go loop() — ticker 100 ms
```

### 4.2 One tick: command → simulation → per-player snapshot

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (player 0)
    participant RD as Client.reader goroutine
    participant Hub
    participant R as Room.loop goroutine
    participant G as game.Game
    participant WR as Client.writer goroutine
    B->>RD: {"t":"cmd","cmd":{"c":"move","ids":[12,13],"x":20.5,"y":31}}
    RD->>RD: conn.Read (≤ 16 KiB) → ParseClientMsg
    RD->>Hub: handle(): per-client cmd limiter (25/s, burst 60)
    Hub->>R: r.command(): stamp cmd.Player from the seat, non-blocking send to cmds (cap 512)
    Note over R: select { cmd → pending (≤ 1024) | ticker }
    R->>G: tick: lock room, Apply(cmd) for each pending
    G-->>R: error → {"t":"cmderr"} (lossy) to that player
    R->>G: Step()  (AI think, units, buildings, hits, fog, victory)
    R->>G: Events()
    loop each human seat
        R->>G: Snapshot(player, events, fog = Tick%5==1)
        R->>WR: enqueue {"t":"snap","s":…} (lossy, queue 256)
    end
    WR->>B: conn.Write (10 s timeout, permessage-deflate)
    B->>B: onSnap → interpolate positions over 100 ms → render at display rate
```

Key properties of this flow:

- **The player index is never taken from the client.** `Room.command`
  derives it from the seat the connection occupies (`cmd.Player` has
  `json:"-"`).
- **Validation happens twice.** `ParseClientMsg` checks shape and bounds;
  `Game.Apply` checks game semantics (ownership, visibility, affordability,
  placement, age requirements).
- **Snapshots are personalised.** `Game.Snapshot(player, …)` includes only
  what that player's team can see (see [design.md §8](design.md#8-fog-of-war-and-visibility)).
- **Back-pressure is explicit.** A slow client loses snapshots (lossy) but
  never blocks the room; reliable messages that do not fit disconnect it.

### 4.3 End of game

When `Game.Over` becomes true in `tick`, the room broadcasts
`{"t":"end","results":[…],"winner":team}` (reliable), sets `State = "done"`,
leaves the loop and calls `store.RecordGame` for every registered human
(guests and AI are skipped). The room is deleted when its last human leaves.

## 5. Concurrency model

```mermaid
flowchart LR
    subgraph perConn["per WebSocket connection"]
        rd["reader goroutine<br/>(HTTP handler goroutine)"]
        wr["writer goroutine<br/>send chan []byte (256)"]
        cl["closer goroutine<br/>waits on closed"]
    end
    subgraph perRoom["per running room"]
        lp["loop goroutine<br/>time.Ticker 100 ms"]
        ch["cmds chan Command (512)"]
    end
    hubmu["Hub.mu<br/>clients, byName, rooms, history, c.room"]
    roommu["Room.mu<br/>slots, state, game"]
    srvmu["Server.mu<br/>sessions"]
    stmu["Store.mu (RWMutex)<br/>users, scores, levels"]
    limmu["Limiter.mu<br/>buckets"]

    rd -- "lock briefly" --> hubmu
    rd -- "lobby actions, chat" --> roommu
    rd -- "non-blocking send" --> ch
    ch --> lp
    lp -- "whole tick" --> roommu
    lp -- "non-blocking enqueue" --> wr
```

| Goroutine | Count | Blocks on | Owns |
|---|---|---|---|
| HTTP handler / WS reader | 1 per request / connection | `conn.Read` | message parsing, dispatch |
| WS writer | 1 per connection | `send` channel, `conn.Write` (10 s timeout), 20 s ping ticker | the socket's write side |
| WS closer | 1 per connection | `closed` channel | cancels the connection context |
| Room loop | 1 per playing room | ticker, `cmds`, `stop` | exclusive access to `game.Game` (under `Room.mu`) |

Rules that keep this deadlock-free and bounded:

1. **Lock order is Hub → Room.** Code that needs both (`joinRoom`) takes
   `Hub.mu` first; everything else holds only one lock at a time and copies
   what it needs before releasing it (e.g. `broadcastLobby` snapshots the
   client list, unlocks, then enqueues).
2. **No goroutine blocks while holding a lock on another goroutine's
   progress.** All sends into `Client.send` and `Room.cmds` use
   `select { case ch <- v: default: }`.
3. **`game.Game` is single-threaded.** It is only touched by the room loop
   (and by `leaveRoom`/`rejoin` under the same `Room.mu`). The simulation
   package itself contains no locks or goroutines.
4. **Every queue is bounded**: send queue 256 messages, command channel 512,
   pending commands per tick 1024, chat history 50, rate-limiter buckets
   100 000 keys.
5. **Shutdown**: `SIGINT`/`SIGTERM` → `Hub.Shutdown()` closes every room's
   `stop` channel and every client, then `http.Server.Shutdown` drains for up
   to 10 s.

## 6. Persistence

| File (in `-data`) | Content | Written when |
|---|---|---|
| `users.json` | map lower-case name → `User` (name, salt, argon2id hash, created, games, wins, losses, best score, campaign progress) | register, game recorded |
| `scores.json` | map level id → top 25 `Score` | game recorded |
| `levels.json` | map id → custom `game.Level` | level saved / deleted |

- The whole map is re-serialised on each change and written **atomically**:
  `os.CreateTemp` in the data directory → `Chmod 0600` → write → `fsync` →
  `rename` over the target. A crash leaves either the old or the new file.
- All state lives in memory and is loaded once at `store.Open`; invalid
  custom levels are dropped on load (`Level.Validate`).
- **Not persisted**: sessions (users must log in again after a restart), chat
  history, rooms and running matches.
- The data directory is the only writable path for the process (Landlock,
  systemd `ProtectSystem=strict`, SELinux `lotl_var_lib_t`).

See [ADR-0006](adr/0006-json-file-store.md) for the rationale and its limits.

## 7. Deployment view

```mermaid
flowchart TB
    subgraph host["Linux host"]
        sock["lotl.socket<br/>ListenStream=8080"]
        subgraph sandbox["lotl.service sandbox<br/>DynamicUser, ProtectSystem=strict, SystemCallFilter, …"]
            subgraph selinux["SELinux domain lotl_t"]
                bin["/usr/local/bin/lotl-server<br/>Landlock + seccomp + no caps"]
            end
        end
        state[("/var/lib/lotl<br/>lotl_var_lib_t, 0700")]
        sock -- "fd 3 (LISTEN_FDS=1)" --> bin
        bin --> state
    end
```

Alternatives: the multi-stage `Dockerfile` (distroless, UID 65532,
read-only root, `/data` volume) and `docker-compose.yml`. See
[operations.md](operations.md).
