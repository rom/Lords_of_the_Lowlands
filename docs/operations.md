# Operations

## Build

Requirements: Go 1.24 (see `go.mod`). No C toolchain, Node or other tools
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
```

### Flags and environment

| Flag | Environment | Default | Meaning |
|---|---|---|---|
| `-listen` | `LOTL_LISTEN` | `127.0.0.1:8080` | listen address `host:port` |
| `-port` | `LOTL_PORT` | `0` | port only; replaces the port of `-listen` (0 = keep) |
| `-data` | `LOTL_DATA` | `./data` | data directory (created `0700`) |
| `-tls-cert` | `LOTL_TLS_CERT` | — | certificate file; enables HTTPS (both required) |
| `-tls-key` | `LOTL_TLS_KEY` | — | private key file |
| `-secure-cookies` | — | `false` | `Secure` cookie + HSTS (implied by TLS) |
| `-trust-proxy` | — | `false` | use the last `X-Forwarded-For` hop as client IP |
| `-allow-origin` | — | — | comma-separated extra `Origin` hosts (CSRF and WebSocket) |
| `-no-sandbox` | — | `false` | skip Landlock/seccomp/capability hardening (debug only) |
| `-log-level` | — | `info` | `debug`, `info`, `warn`, `error` |
| `-max-rooms` | — | `200` | concurrent rooms (lobby + playing) |

Environment variables provide defaults; flags given on the command line win.

### Choosing the port

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
sudo install -d -m 0750 /etc/lotl && sudo install -m 0640 deploy/systemd/lotl.env /etc/lotl/
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
`/etc/lotl/lotl.env`, e.g. `LOTL_OPTS=-secure-cookies -trust-proxy`.

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
```

or `docker compose up -d --build` with the provided `docker-compose.yml`.
The container always listens on 8080 inside; change the published host
port on the left of `ports:`. The image has no shell, so there is nothing to
`docker exec` into; use `docker logs lotl`.

## Data directory and backup

| File | Content |
|---|---|
| `users.json` | accounts (argon2id hashes), statistics, campaign progress |
| `scores.json` | top 25 scores per level |
| `levels.json` | custom levels |
| `.<name>.tmp*` | transient files during an atomic write (removed automatically) |

- Location: `-data` (systemd: `/var/lib/lotl`, which with `DynamicUser` is a
  symlink to `/var/lib/private/lotl`; Docker: the `/data` volume).
- Permissions: directory `0700`, files `0600`, owned by the service user.
- Each file is replaced atomically (temp + `fsync` + `rename`), so copying
  the files while the server runs always yields valid JSON per file.
  Files are written independently, so a backup taken during a game result
  write may have `users.json` and `scores.json` from slightly different
  moments; stop the service for a strictly consistent snapshot.

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
lost on restart.

## Logs

Structured JSON (`log/slog`) on stderr — the journal under systemd, the
container log under Docker. Every line has `time`, `level`, `msg`.

| `msg` | Level | Fields |
|---|---|---|
| `sandbox` | INFO | `noNewPrivs`, `caps`, `landlockABI`, `landlockFS`, `landlockNet`, `seccomp`, `denied`, `warnings` |
| `sandbox disabled` | WARN | (`-no-sandbox`) |
| `listening` | INFO | `addr`, `tls`, `data` |
| `shutting down` | INFO | |
| `panic` | ERROR | `err`, `path` |
| HTTP server errors (TLS handshakes, …) | WARN | via `http.Server.ErrorLog` |

```sh
journalctl -u lotl.service -f -o cat | jq .
journalctl -u lotl.service -o cat | jq 'select(.level=="ERROR")'
```

## Health and monitoring

- `GET /healthz` → `200 ok` (not rate limited; no authentication).
- `GET /api/online` → players connected.
- systemd: `systemctl status lotl.service`, `Restart=on-failure`.

## Upgrading

1. Build the new binary (`deploy/install.sh` does build + install + restart).
2. `systemctl restart lotl.service` — on `SIGTERM` the server stops all
   games, closes WebSockets and drains HTTP for up to 10 s.
3. Players must log in again (sessions are in memory); running games are
   lost — upgrade when the lobby is quiet (`/api/online`).
4. Data files are forward compatible JSON; unknown or invalid custom levels
   are dropped on load, so keep a backup before major upgrades.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
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
