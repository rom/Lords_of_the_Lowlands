# Operations

## Build

Requirements: Go 1.25 or newer (see `go.mod`). No C toolchain, Node or other tools
are needed — the web client is embedded with `go:embed`.

```sh
CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags="-s -w" \
  -o bin/lotl-server ./cmd/lotl-server
```

`CGO_ENABLED=0` is **required** for the sandbox: in cgo builds
`syscall.AllThreadsSyscall` is unavailable and Landlock reports
`binary built with cgo; rebuild with CGO_ENABLED=0`.

Container image: `docker build -t lotl .` (multi-stage, distroless, UID
65532) — see [Docker](#docker).

## Run

```sh
./bin/lotl-server                       # http://127.0.0.1:8080, data in ./data
./bin/lotl-server -listen 0.0.0.0:8080 -data /srv/lotl
./bin/lotl-server -config /etc/lotl/lotl.yaml
```

### Flags and environment

| Flag | Environment | YAML key | Default | Meaning |
|---|---|---|---|---|
| `-config` | `LOTL_CONFIG` | — | — | YAML configuration file |
| `-listen` | `LOTL_LISTEN` | `server.listen` | `127.0.0.1:8080` | listen address `host:port` |
| `-port` | `LOTL_PORT` | `server.port` | `0` | port only; replaces the port of `listen` (0 = keep) |
| `-data` | `LOTL_DATA` | `data.dir` | `./data` | data directory (created `0700`) |
| `-tls-cert` | `LOTL_TLS_CERT` | `server.tlsCert` | — | certificate file; enables HTTPS (both required) |
| `-tls-key` | `LOTL_TLS_KEY` | `server.tlsKey` | — | private key file |
| `-log-level` | `LOTL_LOG_LEVEL` | `server.logLevel` | `info` | `debug`, `info`, `warn`, `error` |
| `-secure-cookies` | — | `server.secureCookies` | `false` | `Secure` cookie + HSTS (implied by TLS) |
| `-trust-proxy` | — | `server.trustProxy` | `false` | use the last `X-Forwarded-For` hop as client IP |
| `-allow-origin` | — | `server.allowedOrigins` | — | extra `Origin` hosts (CSRF and WebSocket); flag is comma-separated |
| `-max-rooms` | — | `server.maxRooms` | `200` | concurrent rooms (lobby + playing + demo), 1..10 000 |
| `-no-sandbox` | — | `security.sandbox: false` | sandbox on | skip Landlock/seccomp/capability hardening (debug only) |
| — | `LOTL_ADMIN_PASSWORD` | — | — | password for `accounts.bootstrapAdmin` |

**Precedence: flag > environment > config file > built-in default.** A flag
counts only if it is given on the command line (also `-trust-proxy=false`).
The merged result is validated again; any error stops the server.

## Configuration file

`deploy/config/lotl.yaml` is a complete example with every key at its
default ([ADR-0013](adr/0013-yaml-configuration.md)). All keys are optional.
**Unknown keys are rejected**, values are range-checked (`Validate`), and the
file is read **once at start-up, before the sandbox** — it may live outside
the data directory, changes need a restart, and the process cannot read it
afterwards.

| Key | Default | Valid | Meaning |
|---|---|---|---|
| `server.listen` / `port` | `127.0.0.1:8080` / `0` | port 0..65535 | see [Choosing the port](#choosing-the-port) |
| `server.tlsCert` / `tlsKey` | — | both or neither | HTTPS |
| `server.secureCookies` / `trustProxy` | `false` | | as the flags |
| `server.allowedOrigins` | `[]` | list of hosts | extra Origin hosts |
| `server.maxRooms` | `200` | 1..10 000 | concurrent rooms |
| `server.logLevel` | `info` | slog level | |
| `data.dir` | `./data` | | data directory (the systemd unit pins `-data /var/lib/lotl`) |
| `security.sandbox` | `true` | | in-process hardening |
| `security.sessionTTL` | `168h` | ≥ `1m` | session lifetime (Go duration) |
| `security.apiRate` / `apiBurst` | `20` / `60` | > 0 / ≥ 1 | `/api/*` requests per second per IP |
| `security.authRate` / `authBurst` | `0.2` / `8` | > 0 / ≥ 1 | login/register attempts per second per IP |
| `security.maxBodyBytes` | `1048576` | 64 KiB..16 MiB | REST body limit |
| `accounts.registration` | `open` | `open`, `approval`, `closed` | who may create accounts |
| `accounts.allowGuests` | `true` | | guest play |
| `accounts.bootstrapAdmin` | — | account name | admin created at start-up (password from `LOTL_ADMIN_PASSWORD`) |
| `accounts.requireAdminMFA` | `false` | | admins must enrol TOTP |
| `accounts.minPasswordLength` | `8` | 8..128 | |
| `accounts.mfaIssuer` | `Lords of the Lowlands` | | label shown in authenticator apps |
| `game.maxSavesPerUser` | `20` | 0..1000 (0 disables saving) | saved games per account |
| `game.demo.enabled` | `true` | | attract mode |
| `game.demo.idleMinutes` / `rotateMinutes` | `3` / `6` | > 0 | idle time before a demo / match length |
| `game.demo.maxRooms` | `10` | ≥ 0 | concurrent demo rooms |
| `anticheat.enabled` | `true` | | all anti-cheat checks |
| `anticheat.signedCommands` | `true` | | HMAC-signed, sequenced commands |
| `anticheat.maxAPM` | `900` | ≥ 60 | sustained actions per minute considered inhuman |
| `anticheat.warnScore` / `kickScore` | `40` / `100` | `0 < warn < kick` | thresholds |
| `metrics.token` | — | empty or ≥ 16 chars | bearer token for `/api/stats` and `/metrics` |
| `metrics.public` | `false` | | without a token: diagnostics for everyone |

Minimal Internet-facing example:

```yaml
server:
  secureCookies: true
  trustProxy: true
accounts:
  registration: approval
  bootstrapAdmin: admin
  requireAdminMFA: true
  minPasswordLength: 12
metrics:
  token: "use-a-long-random-string-here"
```

## Choosing the port

Precedence, highest first:

1. **systemd socket activation** — if `LISTEN_PID` equals the server's PID
   and `LISTEN_FDS=1`, fd 3 is used and `-listen`/`-port` are ignored.
2. **`-port N`** (or `LOTL_PORT=N`) — keeps the host part of `-listen`.
3. **`-listen host:port`** (or `LOTL_LISTEN`).

```sh
./bin/lotl-server -port 9000                       # 127.0.0.1:9000
LOTL_PORT=9000 ./bin/lotl-server -listen 0.0.0.0:0 # 0.0.0.0:9000
./bin/lotl-server -listen '[::]:8080'              # all IPv6 (and IPv4) addresses
```

After start-up Landlock (ABI ≥ 4) allows binding only the port actually in
use. `-listen 127.0.0.1:0` picks a free port, which is printed in the
`listening` log line.

## systemd

```sh
sudo deploy/install.sh            # build, install binary + units, SELinux (if present), enable socket
sudo deploy/install.sh --port 80  # same, socket on port 80 via a drop-in
```

Or manually:

```sh
sudo install -m 0755 bin/lotl-server /usr/local/bin/
sudo install -m 0644 deploy/systemd/lotl.service deploy/systemd/lotl.socket /etc/systemd/system/
sudo install -d -m 0755 /etc/lotl && sudo install -m 0600 deploy/systemd/lotl.env /etc/lotl/
sudo install -m 0644 deploy/config/lotl.yaml /etc/lotl/      # no secrets in it, readable by DynamicUser
echo 'LOTL_CONFIG=/etc/lotl/lotl.yaml' | sudo tee -a /etc/lotl/lotl.env
sudo systemctl daemon-reload
sudo systemctl enable --now lotl.socket
```

| Mode | How | Port change |
|---|---|---|
| Socket activation (default) | `lotl.socket` binds `ListenStream=8080`; first connection starts `lotl.service` | `systemctl edit lotl.socket` → `[Socket]` `ListenStream=` (empty, resets) then `ListenStream=0.0.0.0:9000`; `systemctl restart lotl.socket lotl.service` |
| Direct bind | `systemctl mask --now lotl.socket`, `systemctl enable --now lotl.service` | `LOTL_LISTEN` / `LOTL_PORT` in `/etc/lotl/lotl.env`; ports < 1024 need the commented `CAP_NET_BIND_SERVICE` lines and `PrivateUsers=no` |

On SELinux systems label any new port:
`semanage port -a -t lotl_port_t -p tcp 9000`.

Flags without an environment variable go into `LOTL_OPTS` in
`/etc/lotl/lotl.env`, e.g. `LOTL_OPTS=-secure-cookies -trust-proxy` — or
set them in the YAML file.

The YAML file is read by the service user (with `DynamicUser` an unnamed
UID), so it must be world-readable — or, if it contains `metrics.token`,
keep it `0600 root` and pass it as a credential:

```ini
# systemctl edit lotl.service
[Service]
LoadCredential=lotl.yaml:/etc/lotl/lotl.yaml
Environment=LOTL_CONFIG=%d/lotl.yaml
```

`lotl.env` itself is read by systemd as root, so `0600 root:root` is
enough; keep it out of version control (it may hold `LOTL_ADMIN_PASSWORD`).

## Accounts and administration

### Registration modes

| `accounts.registration` | Self-registration | Result |
|---|---|---|
| `open` (default) | yes | account active, logged in |
| `approval` | yes | status `pending`; cannot log in until an admin sets `active` |
| `closed` | no (**403**) | only admins create accounts (`/admin.html` → *Create player*) |

`accounts.allowGuests: false` disables guest play in every mode.

### First administrator

```yaml
accounts:
  bootstrapAdmin: admin
  requireAdminMFA: true
```

```sh
# /etc/lotl/lotl.env (0600) — or a separate EnvironmentFile= just for this
LOTL_ADMIN_PASSWORD=a-long-random-passphrase
```

On start-up the server creates `admin` (role `admin`, active, MFA required if
`requireAdminMFA`) when the account does not exist, and writes
`bootstrap-admin` to the audit log. If the account already exists but is not
an active admin, it is promoted and activated. If `bootstrapAdmin` is set,
the account does not exist and `LOTL_ADMIN_PASSWORD` is empty, the server
refuses to start. **Remove the password from the environment after the first
start.**

Then sign in, enrol an authenticator if asked (scan the `otpauth://` URI or
type the secret), and open **Administration** (`/admin.html`):

| Tab | Functions |
|---|---|
| Players | list with role, status, MFA, last login, online, cheat flags, note; create; approve/block/activate; promote/demote; require or reset MFA; reset password; clear flags; kick; delete |
| Games | every room incl. demo rooms |
| Health & Performance | `/api/stats` |
| Audit Log | last 300 entries |

Safeguards: the last active admin cannot be demoted, blocked or deleted;
nobody can delete their own account. Lost authenticator: another admin uses
*reset MFA*. Lost last admin: stop the server, set `bootstrapAdmin` to an
existing account (it is promoted) or a new name, start again.

## TLS

Either terminate TLS in the server:

```sh
lotl-server -listen 0.0.0.0:443 -tls-cert /etc/lotl/tls.crt -tls-key /etc/lotl/tls.key
```

- TLS 1.2 minimum, Go's default cipher suites; cookies become `Secure` and
  HSTS (`max-age=63072000; includeSubDomains`) is sent.
- Certificate and key are read once at start-up, **before** the sandbox is
  applied; afterwards Landlock forbids reading them. Rotating certificates
  therefore requires a restart (`systemctl restart lotl.service`).
- With systemd prefer `LoadCredential=` (commented in the unit) so the key
  file need not be readable by the service user.

…or terminate TLS in a reverse proxy (below).

## Reverse proxy

Run the server on loopback and let the proxy handle TLS:

```sh
LOTL_LISTEN=127.0.0.1:8080
LOTL_OPTS=-trust-proxy -secure-cookies
```

Requirements for the proxy:

| Requirement | Why |
|---|---|
| Forward the original `Host` header | CSRF and WebSocket origin checks compare `Origin` with `Host`; otherwise add the public host with `-allow-origin game.example.org` |
| Set/append `X-Forwarded-For` | with `-trust-proxy` the **last** entry is the client IP used for rate limiting |
| Upgrade WebSockets on `/ws` | `Connection: upgrade`, `Upgrade: websocket`; idle timeout > 20 s (server pings every 20 s) |
| Never expose the server port publicly with `-trust-proxy` | otherwise clients can spoof `X-Forwarded-For` |

nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name game.example.org;
    # ssl_certificate …; ssl_certificate_key …;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;  # map $http_upgrade → "upgrade"/"close"
        proxy_read_timeout 120s;
    }
}
```

Caddy:

```caddyfile
game.example.org {
    reverse_proxy 127.0.0.1:8080
}
```

(Caddy forwards `Host`, `X-Forwarded-For` and WebSocket upgrades by
default.)

## Docker

```sh
docker build -t lotl .
docker run -d --name lotl -p 8080:8080 -v lotl-data:/data \
  --read-only --cap-drop ALL --security-opt no-new-privileges lotl
# extra flags after the image name:
docker run … lotl -secure-cookies -trust-proxy
# configuration file and bootstrap admin:
docker run … -v "$PWD/lotl.yaml:/etc/lotl.yaml:ro" -e LOTL_ADMIN_PASSWORD … lotl -config /etc/lotl.yaml
```

The entrypoint passes `-listen 0.0.0.0:8080 -data /data`, which override
`server.listen` and `data.dir` from the file.

or `docker compose up -d --build` with the provided `docker-compose.yml`.
The container always listens on 8080 inside; change the published host
port on the left of `ports:`. The image has no shell, so there is nothing to
`docker exec` into; use `docker logs lotl`.

## Data directory and backup

| File | Content |
|---|---|
| `users.json` | accounts (argon2id hashes, role, status, MFA secrets, anti-cheat flags, notes), statistics, campaign progress |
| `scores.json` | top 25 scores per level |
| `levels.json` | custom levels |
| `saves/<user>/s-<16 hex>.json` | saved games (≤ 8 MiB each), one folder per account (lower-case name) |
| `audit.log` | audit trail, one JSON object per line, append-only |
| `.<name>.tmp*` | transient files during an atomic write (removed automatically) |

- Location: `-data` (systemd: `/var/lib/lotl`, which with `DynamicUser` is a
  symlink to `/var/lib/private/lotl`; Docker: the `/data` volume).
- Permissions: directory `0700`, files `0600`, owned by the service user.
- Each file is replaced atomically (temp + `fsync` + `rename`), so copying
  the files while the server runs always yields valid JSON per file.
  Files are written independently, so a backup taken during a game result
  write may have `users.json` and `scores.json` from slightly different
  moments; stop the service for a strictly consistent snapshot.
- `users.json` contains TOTP secrets and `audit.log` personal data: protect
  backups like the live data (encrypted, access-controlled).
- `audit.log` grows without bound; rotate it offline (stop, move, start) or
  copy-truncate it during a quiet period.

```sh
# online backup
sudo tar -C /var/lib/private -czf lotl-$(date +%F).tgz lotl

# restore
sudo systemctl stop lotl.service lotl.socket
sudo tar -C /var/lib/private -xzf lotl-2026-11-14.tgz
sudo restorecon -R /var/lib/private/lotl     # SELinux only
sudo systemctl start lotl.socket             # systemd fixes ownership for DynamicUser
```

Sessions, chat history, rooms and running games are memory-only and are
lost on restart; saved games survive.

## Logs

Structured JSON (`log/slog`) on stderr — the journal under systemd, the
container log under Docker. Every line has `time`, `level`, `msg`.

| `msg` | Level | Fields |
|---|---|---|
| `sandbox` | INFO | `noNewPrivs`, `caps`, `landlockABI`, `landlockFS`, `landlockNet`, `seccomp`, `denied`, `warnings` |
| `sandbox disabled` | WARN | (`-no-sandbox`) |
| `listening` | INFO | `addr`, `tls`, `data` |
| `anticheat` | WARN | `player`, `reason`, `score` |
| `shutting down` | INFO | |
| `panic` | ERROR | `err`, `path` |
| HTTP server errors (TLS handshakes, …) | WARN | via `http.Server.ErrorLog` |

```sh
journalctl -u lotl.service -f -o cat | jq .
journalctl -u lotl.service -o cat | jq 'select(.level=="ERROR")'
```

## Health and monitoring

| Endpoint | Use | Access |
|---|---|---|
| `GET /healthz` | liveness (`ok`), not rate limited | public |
| `GET /readyz` | readiness: data directory writable, else 503 | public |
| `GET /api/health` | `{"status","version","uptimeSeconds","time"}` | public |
| `GET /api/stats` | JSON statistics (users, rooms by state, counters, tick/HTTP percentiles, runtime) | token, admin or loopback |
| `GET /metrics` | Prometheus text format | token, admin or loopback |

Metric names and the stats document are listed in
[api.md](api.md#diagnostics). Access: with `metrics.token` set, only the
bearer token or an admin session; without a token, admins and loopback
clients (or everyone with `metrics.public: true`). With `trustProxy: true`
the loopback rule is disabled (proxied requests all come from loopback), so
behind a proxy use a token or an admin session.

Prometheus scrape configuration:

```yaml
scrape_configs:
  - job_name: lotl
    scheme: https
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/lotl.token   # same value as metrics.token
    static_configs:
      - targets: ["game.example.org"]
```

Useful expressions and alerts:

| Signal | PromQL |
|---|---|
| tick p99 over budget (100 ms) | `histogram_quantile(0.99, rate(lotl_tick_duration_seconds_bucket[5m])) > 0.05` |
| HTTP 5xx | `rate(lotl_http_errors_total[5m]) > 0` |
| slow clients | `rate(lotl_ws_dropped_total[5m])` |
| login failures | `rate(lotl_logins_failed_total[5m])` |
| cheating | `increase(lotl_cheat_kicks_total[1h]) > 0` |
| load | `lotl_rooms{state="playing"}`, `lotl_players_in_games`, `lotl_go_heap_alloc_bytes` |

systemd: `systemctl status lotl.service`, `Restart=on-failure`. A
`HEALTHCHECK` can use `/healthz`; a load balancer should use `/readyz`.

## Upgrading

1. Build the new binary (`deploy/install.sh` does build + install + restart).
2. `systemctl restart lotl.service` — on `SIGTERM` the server stops all
   games, closes WebSockets and drains HTTP for up to 10 s.
3. Players must log in again (sessions are in memory); running games are
   lost — upgrade when the lobby is quiet (`/api/online`, or
   `lotl_players_in_games`). Ask players to **save** first: saved games
   survive restarts (they fail with `incompatible save` only if
   `SaveVersion` changed).
4. Data files are forward compatible JSON; unknown or invalid custom levels
   are dropped on load, so keep a backup before major upgrades.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `lotl-server: /etc/lotl/lotl.yaml: yaml: unmarshal errors: … field xyz not found` | typo or unknown key in the config file |
| `lotl-server: accounts.registration must be open, approval or closed …` (or another range message) | invalid value; see the [key table](#configuration-file) |
| `accounts.bootstrapAdmin is set but LOTL_ADMIN_PASSWORD is empty` | set the variable for the first start (or create the account first) |
| `open /etc/lotl/lotl.yaml: permission denied` | the service user cannot read the file: make it `0644` or use `LoadCredential=` |
| Admin page says "administrators only" | account is not an active admin; or MFA enrolment pending (log in again and finish it) |
| Users report "your account awaits approval" | `registration: approval`; approve them on the admin page |
| `/metrics` returns 403 to Prometheus | missing/wrong bearer token, or the scraper is not on loopback without a token |
| Honest player kicked by the anti-cheat | check `journalctl … \| jq 'select(.msg=="anticheat")'` and the account flags; modified or cached old client files trigger the integrity check — clear the browser cache; raise `kickScore` if needed |
| `lotl-server: hardening: seccomp: operation not permitted` | the outer filter blocks `seccomp(2)`: keep `SystemCallFilter=@sandbox` in the unit, or use a container seccomp profile that allows it |
| `hardening: no_new_privs: …` | `prctl` blocked by an outer filter; check the unit's `SystemCallFilter` |
| `hardening: seccomp filter not available for this architecture` | only amd64 and arm64 are supported; run with `-no-sandbox` elsewhere |
| `"warnings":"landlock: not supported by this kernel"` | kernel < 5.13 or Landlock not in the LSM list (`cat /sys/kernel/security/lsm`); the server runs without the Landlock layer |
| `"warnings":"landlock: binary built with cgo…"` | rebuild with `CGO_ENABLED=0` |
| `"warnings":"capabilities: operation not permitted"` | `capset` filtered (systemd without `capset` in the allow-list); harmless if the process has no capabilities |
| `open …/users.json: permission denied` / `permission denied` writing | data dir not owned by the service user, or (SELinux) mislabelled → `restorecon -R`; `ausearch -m AVC -c lotl-server` |
| `listen tcp …: bind: address already in use` | another process on the port, or `lotl.socket` already holds it while you start the binary by hand |
| `bind: permission denied` on port < 1024 | use socket activation, or grant `CAP_NET_BIND_SERVICE` (direct-bind mode) |
| Login works but every POST returns `403 cross-origin request refused` | proxy rewrites `Host`; forward it or use `-allow-origin` |
| WebSocket closes immediately / 401 on `/ws` | no session cookie: on plain HTTP do not use `-secure-cookies`; behind TLS proxy use it |
| All players rate-limited together | behind a proxy without `-trust-proxy` |
| Times in logs not in local time | intended: the unit sets `TZ=UTC`; Landlock prevents reading `/etc/localtime` after start-up |
| Something odd that might be the sandbox | reproduce with `LOTL_OPTS=-no-sandbox` (and `systemd-run`/unit overrides for the systemd layer) — never in production; then check `journalctl`, `ausearch`, `dmesg` for seccomp audit lines |

Debugging the systemd layer selectively:

```sh
sudo systemctl edit lotl.service     # temporarily: SystemCallFilter=  (empty resets), or SELinuxContext=
sudo semanage permissive -a lotl_t   # SELinux: log instead of deny for this domain only
```
