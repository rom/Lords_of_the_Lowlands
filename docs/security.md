# Security

Lords of the Lowlands is an Internet-facing multiplayer game server. Its
security goals are, in order:

1. **Protect the host** — a compromised server process must not be able to
   read or modify anything but its own data, run programs or pivot to the
   network.
2. **Protect accounts** — passwords, second factors, sessions, saved games
   and player-made content.
3. **Keep games fair** — no client can see or do more than the rules allow;
   suspicious clients are detected and reported.
4. **Accountable administration** — administrators can manage accounts, but
   cannot lock the server out, and every action is audited.
5. **Stay available** — no single client can degrade the service for others.

## 1. Trust boundaries

```mermaid
flowchart LR
    subgraph internet["Untrusted: Internet"]
        b["Browser / any HTTP or WebSocket client"]
    end
    subgraph proxy["Semi-trusted (optional)"]
        rp["Reverse proxy<br/>TLS, X-Forwarded-For"]
    end
    subgraph proc["Trusted code, untrusted input"]
        direction TB
        mw["HTTP middleware<br/>headers, CSRF, rate limit, size limits"]
        val["Validation<br/>decode(), ParseClientMsg, Level.Validate, Game.Apply"]
        core["Hub / rooms / simulation / store"]
        mw --> val --> core
    end
    subgraph os["OS confinement"]
        sb["seccomp · Landlock · no caps · systemd · SELinux"]
    end
    data[("Data dir")]
    b -- "TB1: network" --> rp
    b -. "TB1" .-> mw
    rp -- "TB2: proxy headers" --> mw
    core -- "TB3: file system" --> data
    proc -. "TB4: kernel" .- sb
```

| Boundary | Crossing | Controls |
|---|---|---|
| TB1 network → server | HTTP, WebSocket frames | TLS (optional), timeouts, size limits, rate limits, CSRF/origin checks, strict decoding and validation |
| TB2 proxy → server | `X-Forwarded-For` | ignored unless `trustProxy`; only the last hop is used |
| TB2b monitoring → server | `/metrics`, `/api/stats` | bearer token, admin session or loopback only (§3.7) |
| TB2c operator → server | YAML file, `LOTL_*` env, `LOTL_ADMIN_PASSWORD` | read once before the sandbox; strict decoding (`KnownFields`), `Validate()` |
| TB3 server → disk | JSON files, `saves/`, `audit.log` | single data dir, `0600`/`0700`, atomic writes, validated on load (levels, saves) |
| TB4 process → kernel | system calls | no_new_privs, no capabilities, seccomp, Landlock, systemd sandbox, SELinux |
| Server → browser | JSON, static files | CSP `script-src 'self'`, no inline script, DOM built with `textContent` only |

## 2. Threat model (STRIDE)

| # | STRIDE | Threat | Mitigation | Code |
|---|---|---|---|---|
| T1 | Spoofing | Password guessing / credential stuffing | argon2id (m = 19 MiB, t = 2, p = 1); `authRate`/`authBurst` (1 login/register per 5 s per IP, burst 8); identical error for unknown user and wrong password; `minPasswordLength`; optional TOTP | `store.Authenticate`, `server.authLimit` |
| T2 | Spoofing | Session theft via XSS | `HttpOnly` cookie; strict CSP; no `innerHTML` in the client | `createSession`, `csp`, `web/js/util.js el()` |
| T3 | Spoofing | Session token guessing | 256-bit `crypto/rand` token; exact-length check; server-side session store with expiry (`sessionTTL`) | `newToken`, `rawSession` |
| T4 | Spoofing | Impersonating another player in a game | player index derived from the connection's seat, never from the message (`Command.Player` is `json:"-"`) | `Room.command` |
| T5 | Spoofing | Guest squatting a registered name | guest names must not be registered or in use; registration refused while a guest holds the name | `handleGuest`, `nameInUse` |
| T6 | Tampering | CSRF on state-changing endpoints | `SameSite=Strict`; `Origin`/`Referer` must match `Host` or `-allow-origin`; `Sec-Fetch-Site` check; JSON content type required (no simple-form POSTs) | `Server.limit`, `sameOrigin` |
| T7 | Tampering | Cross-site WebSocket hijacking | `websocket.Accept` origin check; `SameSite=Strict` cookie | `Hub.serveWS` |
| T8 | Tampering | Cheating by sending impossible commands (other players' units, unaffordable builds, unexplored placement, future-age units) | server-authoritative simulation; every command validated in `Game.Apply` (ownership, visibility, affordability, age, placement, queue limits, finite coordinates) | `commands.go` |
| T9 | Tampering | Overwriting other users' levels | `author` forced to the caller; replacement only by the owner; deletion only by the owner | `store.SaveLevel`, `DeleteLevel` |
| T10 | Tampering | Corrupt data files after crash | temp file + `fsync` + `rename`; levels re-validated on load | `store.save`, `store.Open` |
| T11 | Repudiation | Disputed actions | structured JSON logs (slog) to the journal; panics logged with path | `main.go`, `recoverer` |
| T12 | Info disclosure | Map hack (seeing hidden enemies) | per-player snapshots contain only what the team can see; private fields (queues, carry, max HP, rally) only for allies; events filtered by visibility | `Game.Snapshot`, `canSee` |
| T13 | Info disclosure | Leaking password hashes | `User.Public()` for every API response; files `0600` in a `0700` dir | `store.go` |
| T14 | Info disclosure | Clickjacking, referrer leaks, MIME sniffing | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff`, COOP/CORP | `securityHeaders` |
| T15 | Info disclosure | Core dumps with session tokens | `RLIMIT_CORE = 0`, `PR_SET_DUMPABLE = 0`, `LimitCORE=0` | `hardening.Apply`, unit |
| T16 | DoS | Request floods | 20 req/s per IP (burst 60) on `/api/*`; limiter memory bounded (100 000 keys) | `ratelimit.go` |
| T17 | DoS | Slowloris / huge headers / huge bodies | `ReadHeaderTimeout` 10 s, `ReadTimeout` 30 s, `IdleTimeout` 120 s, 16 KiB headers, 1 MiB bodies, 16 KiB WebSocket frames | `main.go`, `server.go`, `hub.go` |
| T18 | DoS | Slow WebSocket reader blocking the game | bounded 256-message queue per client; lossy snapshots dropped; reliable overflow disconnects; 10 s write timeout | `Client.enqueue`, `Hub.writer` |
| T19 | DoS | Command / chat floods | 25 cmds/s (burst 60) and 1 chat/s (burst 5) per connection; room channel 512, ≤ 1024 commands per tick; ≤ 120 unit ids per command | `hub.go`, `room.go`, `protocol.go` |
| T20 | DoS | Expensive simulation input | map ≤ 128², ≤ 6 000 objects, A* ≤ 4 000 expansions, queues ≤ 10, pop ≤ 200, ≤ `-max-rooms` rooms | `level.go`, `path.go` |
| T21 | DoS | Disk exhaustion via levels | ≤ 50 levels per user, ≤ 5 000 total, 512 KiB per level body, registered users only | `store.SaveLevel` |
| T22 | DoS | Panics killing the server | `recoverer` middleware; defensive bounds checks in the simulation | `server.go` |
| T23 | Elevation | RCE in the server leading to host compromise | no `execve`, no `ptrace`, no mounts, no namespaces, no BPF/io_uring (seccomp); write access only to the data dir and no outbound TCP (Landlock); no capabilities; systemd sandbox; SELinux `lotl_t` | `internal/hardening`, `deploy/` |
| T24 | Elevation | Stored XSS via names, chat, level text | names restricted to `[A-Za-z0-9_-]{3,20}`; text cleaned of control and bidi characters; client renders with `textContent`; CSP blocks inline/injected scripts | `ValidName`, `CleanText`, `el()` |
| T25 | Elevation | Malicious JSON (type confusion, unknown fields) | `DisallowUnknownFields`, single value, typed structs; `ParseClientMsg` whitelist of types, ranges and lengths | `decode`, `protocol.go` |
| T26 | Spoofing | Account takeover with a stolen or guessed password | TOTP MFA (RFC 6238) per account; `mfaRequired` per user and `requireAdminMFA` for admins; accounts that must enrol get a restricted session usable only for enrolment | `handleLogin`, `checkTOTP`, `sessionFor` |
| T27 | Spoofing | TOTP replay or brute force | each 30 s step usable once (`MFALastStep`); ±1 step window; constant-time compare; login limiter covers code guesses; failures audited (`mfa-fail`) | `totp.Verify`, `checkTOTP` |
| T28 | Elevation | Blocked, deleted or demoted user keeps a live session | session re-validated against the store on every request; block/delete/password reset/MFA reset end all sessions and close the WebSocket | `rawSession`, `dropSessionsOf`, `hub.kick` |
| T29 | Spoofing | Unwanted sign-ups, name squatting, spam accounts | `registration: approval` (status `pending` until approved) or `closed`; `allowGuests: false` | `handleRegister`, `handleGuest` |
| T30 | Elevation | Malicious or compromised administrator | admin endpoints only for active admins with a full session; MFA can be required; cannot delete self; last active admin cannot be demoted, blocked or deleted; all changes audited | `admin()`, `handleAdminUpdate`, `handleAdminDelete` |
| T31 | Repudiation | Disputed administrative or security actions | append-only JSON-lines `audit.log` (`0600`) with time, actor, action, target, detail; admin page shows the newest 300 | `store.Audit`, `handleAdminAudit` |
| T32 | Info disclosure | Leak of the bootstrap admin password | only via `LOTL_ADMIN_PASSWORD` (not the YAML file), used only when the account does not exist; env file `0600`, removed after first start | `bootstrapAdmin`, `deploy/systemd/lotl.env` |
| T33 | Tampering | Command injection / replay from a second socket or proxy | per-connection HMAC-SHA256 key, strictly increasing sequence numbers; failures dropped and scored | `anticheat.go`, `Hub.handle` |
| T34 | Tampering | Modified client, bots, scripted micro | module integrity report, `navigator.webdriver`, sustained-APM detection; warn → kick → account flag (limited, see §3.5) | `integrityCheck`, `cheatState.rate` |
| T35 | Info disclosure | Probing for hidden units with a map hack | fog filtering means nothing hidden is sent (T12); commands naming hidden entities or unexplored build sites are scored as map-hack symptoms | `inspectCommand` |
| T36 | Tampering | Editing saved games (resources, techs, units) | saves never leave the server (no upload/download API); owner-scoped paths with validated ids; `LoadGame` validates every field | `store.SaveGame`, `game.LoadGame` |
| T37 | DoS | Disk/CPU exhaustion via saves or demo rooms | registered users only, ≤ `maxSavesPerUser` saves of ≤ 8 MiB, 1 save per 10 s; ≤ `demo.maxRooms` demo rooms within `maxRooms`, stopped when no spectator is left | `SaveGame`, `saveL`, `startDemo` |
| T38 | Info disclosure | Metrics/statistics reveal usage and capacity data | `/api/stats` and `/metrics` need the bearer token, an admin session or a loopback address (§3.7); token compared in constant time, ≥ 16 chars | `diagAllowed` |
| T39 | Tampering | Typo in the configuration silently disables a control | unknown YAML keys rejected, ranges validated, start-up fails on error | `config.Parse`, `Validate` |

## 3. Application-layer controls

### 3.1 Input validation

| Input | Validator | Checks |
|---|---|---|
| REST bodies | `decode()` | JSON object of the exact struct, unknown fields rejected, no trailing data, ≤ 1 MiB |
| Names | `store.ValidName` | `^[A-Za-z0-9_\-]{3,20}$` |
| Passwords | `store.Register` / `Authenticate` | 8–128 bytes (over-long rejected before hashing) |
| WebSocket messages | `ParseClientMsg` | ≤ 16 KiB, known `t`, difficulty, team 0..8, slot 0..7, opp 0..7, string lengths, chat channel and text, slot kinds, command id count, command argument charset, skirmish bounds |
| Game commands | `Game.Apply` | player not defeated, coordinates finite and clamped, ownership, visibility, age, footprint, cost, queue length |
| Levels | `Level.Validate` | size, ages, objective, resources (finite, 0..100 000), difficulty, tile alphabet and length, object kinds and bounds, 2..8 starts on passable tiles away from edges, text cleaning |
| Score query | `handleScores` | `level` ≤ 64 bytes |
| Configuration | `config.Parse` / `Validate` | known keys only; port, room count, registration mode, password length 8..128, session TTL ≥ 1 min, positive rate limits, body 64 KiB..16 MiB, saves 0..1000, demo timings, `0 < warnScore < kickScore`, `maxAPM ≥ 60`, token ≥ 16 chars |
| Saved games | `game.LoadGame` | version, level (`Validate`), 1..8 players, finite numbers, ages, difficulties, unique ids < `nextId`, owners, known unit/building/resource/tech types, map bounds, orders, queue length |
| Save ids | `validSaveID` | `s-` + 16 lower-case hex; path is `saves/<lower-case owner>/<id>.json` |
| Admin bodies | `decode` + store | role `user`/`admin`, status `active`/`pending`/`blocked`; note ≤ 300 chars, control characters removed |
| Integrity report | `ParseClientMsg` | ≤ 64 hashes, keys ≤ 64 bytes, values exactly 64 chars |
| Signed commands | `ParseClientMsg`, `cheatState.verify` | MAC 64 chars, `n > 0`, payload parses as a command, HMAC and sequence checked |

### 3.2 Browser security headers

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';
  img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self';
  font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self';
  frame-ancestors 'none'; worker-src 'self' blob:
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Strict-Transport-Security: max-age=63072000; includeSubDomains   (TLS / -secure-cookies only)
```

The client has no inline scripts or styles, no third-party resources and no
build step ([ADR-0004](adr/0004-vanilla-js-canvas-client.md)), which is
what makes `script-src 'self'` without `unsafe-inline`/`unsafe-eval`
possible. Art and audio are procedural, so `img-src`/`media-src` need no
remote origins.

### 3.3 Sessions, passwords and MFA

- argon2id via `golang.org/x/crypto/argon2.IDKey`, 16-byte random salt,
  32-byte key, parameters m = 19 MiB, t = 2, p = 1 (OWASP minimum);
  verification with `subtle.ConstantTimeCompare`; unknown users hash against a
  dummy salt to equalise timing ([ADR-0007](adr/0007-argon2id-sessions.md)).
  Minimum length `accounts.minPasswordLength` (8..128).
- Sessions are opaque random tokens held only in server memory
  (`map[token]*session`) with a `security.sessionTTL` expiry (default
  7 days); logout deletes them; expired entries are purged whenever a new
  session is created. A restart logs everybody out.
- **Every request re-reads the account**: a deleted, `blocked` or `pending`
  account loses its session at once, and admin rights follow the current
  role.
- **TOTP** ([ADR-0014](adr/0014-totp-mfa-without-dependencies.md)): 160-bit
  secret, RFC 6238 SHA-1/6 digits/30 s, ±1 step, one use per step. Required
  per account (`mfaRequired`) or for all admins (`requireAdminMFA`); such
  accounts without an authenticator get a restricted session that can only
  enrol. MFA cannot be disabled while required. Secrets are stored in
  `users.json` and never returned by the API.
- Cookie: `HttpOnly; SameSite=Strict; Path=/`, plus `Secure` with TLS or
  `secureCookies` (which also enables HSTS).

### 3.4 Fair play

| Cheat | Why it does not work |
|---|---|
| Map hack | the client never receives hidden enemy units, events or private enemy data (see [design.md §8](design.md#8-fog-of-war-and-visibility)) |
| Speed / resource hack | resources, timers, HP and positions live only on the server; snapshots are views |
| Commanding enemy units | `ownUnits` / `ownBuilding` filter by the seat's player index |
| Targeting unseen entities | `canSee` check in `Apply` |
| Building in the fog or on blocked tiles | explored + `footprintFree` check |
| Skipping ages / training future units | age checks in `queueUnit`, `queueResearch`, `CmdBuild` |
| Flooding orders to out-micro | per-connection command limiter; sustained APM above `maxAPM` is scored |
| Editing a saved game | saves exist only on the server ([ADR-0016](adr/0016-server-side-save-games.md)) |
| Scores from a flagged game | players removed by the anti-cheat are not recorded (`Slot.flagged`) |

The AI uses the same code paths and pays for everything. Its advantages
are the documented difficulty profile: speed multiplier, and on
`super_hard`/`insane` a resource trickle, on `insane` full map vision
([game-design.md](game-design.md#computer-opponents)).

### 3.5 Anti-cheat

Layered on top of server authority and fog filtering
([ADR-0015](adr/0015-layered-anti-cheat.md), `internal/server/anticheat.go`,
`web/js/integrity.js`). Active when `anticheat.enabled`; signing also needs
`anticheat.signedCommands`.

```mermaid
flowchart LR
    c["client cmd<br/>{p, n, mac}"] --> v{"HMAC + sequence ok?"}
    v -- no --> s1["score +25 (MAC / unsigned)<br/>or +15 (sequence), drop"]
    v -- yes --> l["cmd limiter 25/s"] --> apm{"> maxAPM in last 60 s?"}
    apm -- yes --> s2["score +10<br/>(at most every 20 s)"]
    apm --> q["room queue"] --> t["Room.tick: inspectCommand"]
    t -- "hidden target +12<br/>unexplored build +8<br/>other player's units +10" --> s3[score]
    t --> a["Game.Apply<br/>(authoritative validation)"]
    i["integrity report<br/>module SHA-256, webdriver"] -- "mismatch +30<br/>automation +15" --> s4[score]
    s1 & s2 & s3 & s4 --> th{"score"}
    th -- "≥ warnScore (40)" --> w["warn message"]
    th -- "≥ kickScore (100)" --> k["resign + disconnect<br/>result not recorded<br/>account flag + audit"]
```

| Layer | Check | Weight |
|---|---|---|
| Protocol | bad or missing MAC | 25 |
| Protocol | sequence not `last + 1` (replay, reorder, injection) | 15 |
| Client | module digests differ from served files (or none sent) | 30 |
| Client | `navigator.webdriver` | 15 |
| Server | command targets an entity the player cannot see | 12 |
| Server | build order on an unexplored tile | 8 |
| Server | command lists another player's units | 10 |
| Server | > `maxAPM` (900) commands in a sliding minute | 10 |

Each event is logged (`anticheat` WARN with player, reason, score) and
counted (`lotl_cheat_flags_total`, `lotl_cheat_kicks_total`). Scores live
per connection; flags (last 50) persist on registered accounts and are shown
on the admin page. There is no automatic ban.

**Limitations (by design):** the browser is under the player's control, so
the key, the digests and `webdriver` can all be faked by a determined
cheater; the client layers only stop casual tools and replayed traffic.
Hidden-target findings can occasionally hit honest players (an enemy leaves
vision between snapshot and tick), which is why single events never reach
the thresholds. The protection that cannot be bypassed remains server
authority (T8) and fog filtering (T12).

### 3.6 Administration and audit

| Control | Implementation |
|---|---|
| Who | active accounts with role `admin` and a full (non-restricted) session; optional mandatory MFA |
| First admin | `accounts.bootstrapAdmin` + `LOTL_ADMIN_PASSWORD`, created at start-up if missing (an existing account of that name is promoted and activated) |
| Lock-out protection | the last active admin cannot be demoted, blocked or deleted; nobody can delete themselves |
| Immediate effect | status/MFA/password changes and deletion end sessions and close the player's WebSocket |
| Audit | `audit.log` in the data dir, JSON lines, `0600`, append-only from the server's point of view; viewable at `/admin.html` |
| No secret exposure | `AdminUser` view has no hash, salt or MFA secret |

The audit log is not tamper-evident against someone with file access to the
data directory; ship the journal (`anticheat`) and copies of `audit.log` to
external storage if that matters.

### 3.7 Diagnostics exposure

`/healthz`, `/readyz` and `/api/health` are public and reveal only liveness,
version and uptime. `/api/stats` and `/metrics` (user/room counts,
traffic, latencies, runtime) require:

1. the `metrics.token` as `Authorization: Bearer …` (if set), or
2. an admin session, or
3. with no token: `metrics.public: true` (everyone) or a **loopback**
   client address — but only when `server.trustProxy` is off.

With `trustProxy: true` (a reverse proxy in front) the loopback rule is
disabled, because every proxied request arrives from loopback; use
`metrics.token` or an admin session there.

### 3.8 Known limitations

- **Remembered enemy buildings are live.** An enemy building becomes known
  only once it has actually been *seen* (per-player memory `seenB`), so new
  construction in old territory stays hidden until scouted. After that it is
  reported with its current HP/progress rather than a frozen "last-seen"
  copy, which leaks damage/destruction of remembered buildings.
- **Public presence data.** Online player names, room lists and the
  leaderboard are visible to anyone with a session (and `/api/online` to
  anyone).
- **IP-based limits.** Behind NAT many players share a bucket; without
  `trustProxy` behind a proxy all clients share the proxy's bucket.
- **No self-service account recovery or lockout.** A lost password or
  authenticator needs an administrator; there are no MFA recovery codes.
  Sessions are not bound to IP or user agent.
- **Client-side anti-cheat can be bypassed** (§3.5).
- **Global lock granularity.** The store re-serialises a whole file per
  write (fine at the intended scale; see [ADR-0006](adr/0006-json-file-store.md)).

## 4. Operating-system layer

Applied by `hardening.Apply` in `main.go` **after** the YAML configuration
is read, the store is opened, TLS keys are loaded and the listener is bound,
before the first request is served
([ADR-0008](adr/0008-defence-in-depth-sandbox.md)).

```mermaid
flowchart TB
    start["start: config file, flags, logger, store.Open, TLS keys, bind/inherit socket"] --> umask["umask 077, RLIMIT_CORE=0"]
    umask --> dump["PR_SET_DUMPABLE=0 (all threads)"]
    dump --> nnp["PR_SET_NO_NEW_PRIVS=1 (all threads) — fatal on error"]
    nnp --> caps["clear ambient, bounding (if CAP_SETPCAP), effective/permitted/inheritable"]
    caps --> ll["Landlock ruleset (ABI ≥ 1)"]
    ll --> sc["seccomp filter, TSYNC — fatal on error"]
    sc --> serve["serve"]
```

| Layer | What it enforces | Failure mode |
|---|---|---|
| `no_new_privs` | no privilege gain via setuid/file caps; prerequisite for unprivileged seccomp and Landlock | fatal |
| Non-dumpable, `RLIMIT_CORE=0` | no core dumps, no `ptrace` attach by same-UID processes, `/proc/PID/*` owned by root | warning |
| Capabilities | all sets cleared (`capset`), ambient cleared, bounding set dropped when permitted | warning |
| Landlock FS | every file-system right handled; only the data dir gets read file/read dir/write/truncate, make/remove regular files and make/remove directories (per-user `saves/` folders); everything else (including reading `/etc` and the config file) is denied | warning if the kernel lacks Landlock |
| Landlock net (ABI ≥ 4) | `bind` only to the listening port; `connect` to no TCP port | applied when available |
| Landlock scopes (ABI ≥ 6) | no connecting to abstract UNIX sockets or signalling processes outside the domain | applied when available |
| seccomp-BPF | foreign architecture → kill; x32 → EPERM; 61 (+11 amd64 / +1 arm64) dangerous calls → EPERM; see [deploy/seccomp/README.md](../deploy/seccomp/README.md) | fatal |

The binary must be built with `CGO_ENABLED=0`: `syscall.AllThreadsSyscall`
(used to apply `prctl`, `capset` and `landlock_restrict_self` to every OS
thread) returns `ENOTSUP` in cgo builds. `-no-sandbox` disables this layer
for debugging only.

### systemd

`deploy/systemd/lotl.service` adds an independent outer sandbox:
`DynamicUser`, `StateDirectory`, `ProtectSystem=strict`, `ProtectHome`,
`PrivateTmp`, `PrivateDevices`, `PrivateUsers`, `ProtectKernel*`,
`ProtectControlGroups`, `ProtectClock`, `ProtectHostname`,
`ProtectProc=invisible`, `ProcSubset=pid`, empty `CapabilityBoundingSet`,
`NoNewPrivileges`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`,
`RestrictNamespaces`, `RestrictRealtime`, `RestrictSUIDSGID`,
`LockPersonality`, `MemoryDenyWriteExecute`, `SystemCallArchitectures=native`,
`SystemCallFilter=@system-service` minus `@privileged @resources …` plus
`@sandbox capset`, `UMask=0077`, `NoExecPaths=/`, resource limits. Socket
activation (`lotl.socket`) lets systemd bind privileged ports so the server
never needs `CAP_NET_BIND_SERVICE`.

`systemd-analyze security lotl.service` rates the unit **1.2 (OK)** on
systemd 255; the remaining points are inherent to a network service
(network access, `AF_INET`/`AF_UNIX`, host root directory).

### SELinux

`deploy/selinux/` defines `lotl_t` with access to `lotl_port_t` (bind,
listen, accept), `lotl_var_lib_t` (manage), `lotl_etc_t` (read) and the
journal — no `name_connect`, no `execmem`, no capabilities. See
[deploy/selinux/README.md](../deploy/selinux/README.md).

### Containers

The `Dockerfile` produces a distroless static image running as UID 65532
with `/data` as the only volume; `docker-compose.yml` adds
`read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, PID and memory
limits. The in-process sandbox works inside the container as well.

## 5. Supply chain

| Dependency (`go.mod`) | Version | Used for |
|---|---|---|
| `github.com/coder/websocket` | v1.8.13 | WebSocket server, permessage-deflate |
| `golang.org/x/crypto` | v0.41.0 | `argon2` |
| `golang.org/x/sys` | v0.35.0 | `unix` constants and calls for hardening |
| `gopkg.in/yaml.v3` | v3.0.1 | configuration file |

TOTP and the client's SHA-256/HMAC are implemented in-tree
(`internal/totp`, `web/js/integrity.js`).

- No JavaScript dependencies, no npm, no bundler; the client is served from
  `go:embed` ([ADR-0012](adr/0012-embedded-static-assets.md)).
- `go.sum` pins module hashes; `go mod verify` checks the module cache.
- Reproducible static build: `CGO_ENABLED=0 go build -trimpath
  -buildvcs=false -ldflags="-s -w" ./cmd/lotl-server` — no C toolchain, no
  absolute paths or VCS stamps in the binary; with the same Go version,
  `GOOS`/`GOARCH` and module versions the output is byte-identical.
- Vulnerability check: `govulncheck ./...`.

## 6. Verifying a deployment

```sh
# systemd sandbox rating
systemd-analyze security lotl.service

pid=$(systemctl show -p MainPID --value lotl.service)

# no_new_privs, seccomp mode 2 (filter), number of stacked filters
grep -E 'NoNewPrivs|Seccomp' /proc/$pid/status
# NoNewPrivs:      1
# Seccomp:         2
# Seccomp_filters: …

# no capabilities at all
grep -E '^Cap(Prm|Eff|Bnd|Amb)' /proc/$pid/status    # all 0000000000000000

# what the server applied (Landlock ABI, denied syscall count, warnings)
journalctl -u lotl.service -o cat | grep '"msg":"sandbox"'

# SELinux domain
ps -o label= -p $pid                                 # …:lotl_t:…

# security headers
curl -sI http://127.0.0.1:8080/ | grep -iE 'content-security|x-frame|referrer|nosniff'

# CSRF and content-type enforcement
curl -s -X POST -H 'Origin: https://evil.example' -H 'Content-Type: application/json' \
     -d '{}' http://127.0.0.1:8080/api/login           # 403 cross-origin request refused
curl -s -X POST -d '{}' http://127.0.0.1:8080/api/login  # 415

# diagnostics are not public (run from a non-loopback host, or with a token set)
curl -s -o /dev/null -w '%{http_code}\n' https://game.example.org/metrics   # 403

# recent administrative actions
sudo tail -n 20 /var/lib/private/lotl/audit.log | jq .
```

Example output from a development host (kernel with Landlock ABI 7):

```text
{"level":"INFO","msg":"sandbox","noNewPrivs":true,"caps":true,"landlockABI":7,
 "landlockFS":true,"landlockNet":true,"seccomp":true,"denied":72,"warnings":""}
NoNewPrivs: 1   Seccomp: 2   CapPrm/CapEff/CapBnd: 0000000000000000
```

## 7. Reporting

Please report vulnerabilities privately to the maintainers rather than in a
public issue, including the version (commit), configuration (flags, systemd
or container) and reproduction steps.
