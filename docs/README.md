# Lords of the Lowlands — documentation

A historical-to-space real-time strategy game: Go back-end with a
server-authoritative simulation, browser client in plain ES modules and
Canvas 2D, hardened for Internet deployment.

## For players and designers

| Document | Contents |
|---|---|
| [game-design.md](game-design.md) | the 17 ages, units per age and line, buildings and their era names, technologies, the 17 campaign levels, counters, balance philosophy, AI difficulty, scoring, controls |
| [level-editor.md](level-editor.md) | using the editor, level file format, validation limits |

## For developers

| Document | Contents |
|---|---|
| [architecture.md](architecture.md) | C4 context/container/component views, match data flow, concurrency model, persistence, deployment view |
| [design.md](design.md) | simulation, entity model, unit generation, counter matrix, combat, economy, techs, AI, pathfinding, fog, snapshot protocol, rendering pipeline, audio synthesis, levels, editor, scoring |
| [api.md](api.md) | REST endpoints, WebSocket messages (both directions), snapshot format, limits |
| [testing.md](testing.md) | test strategy, simulation and integration tests, fuzzing, coverage, browser smoke tests |
| [asr.md](asr.md) | architecturally significant requirements with quality-attribute scenarios |
| [adr/](adr/README.md) | architecture decision records 0001–0012 |

## For operators and security reviewers

| Document | Contents |
|---|---|
| [operations.md](operations.md) | build, run, port selection, systemd, TLS, reverse proxy, Docker, backup, logs, upgrades, troubleshooting |
| [security.md](security.md) | threat model (STRIDE), trust boundaries, application and OS controls, supply chain, verification |
| [../deploy/systemd/](../deploy/systemd/) | `lotl.service` (hardened unit), `lotl.socket` (socket activation), `lotl.env` |
| [../deploy/selinux/README.md](../deploy/selinux/README.md) | SELinux policy module `lotl` |
| [../deploy/seccomp/README.md](../deploy/seccomp/README.md) | in-process seccomp filter and its layering with systemd |
| [../deploy/install.sh](../deploy/install.sh) | build-and-install script |
| [../Dockerfile](../Dockerfile), [../docker-compose.yml](../docker-compose.yml) | container image and example deployment |

## Quick start

```sh
make build && ./bin/lotl-server -port 8080      # http://127.0.0.1:8080
# or
docker compose up -d --build                    # http://localhost:8080
```

## Repository map

```text
cmd/lotl-server/     entry point: flags, env, socket activation, sandbox, HTTP server
internal/game/       simulation: defs, game loop, commands, AI, pathfinding, fog, levels
internal/levels/     the 17 campaign levels, skirmish generator options
internal/server/     HTTP API, sessions, rate limiting, WebSocket hub, rooms, chat
internal/store/      JSON file store, argon2id accounts, scores, custom levels
internal/hardening/  no_new_privs, capabilities, Landlock, seccomp
web/                 embedded browser client and level editor
deploy/              systemd, SELinux, seccomp notes, install script
docs/                this documentation
```
