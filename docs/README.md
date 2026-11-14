# Lords of the Lowlands — documentation

A historical-to-space real-time strategy game: Go back-end with a
server-authoritative simulation, browser client in plain ES modules and
Canvas 2D, hardened for Internet deployment, with accounts, MFA,
administration, diagnostics and anti-cheat.

## For players and designers

| Document | Contents |
|---|---|
| [manual.md](manual.md) | **User manual**: the objective, getting started, the screen, controls and every shortcut, economy, the seventeen ages and how to advance, military and counters, technologies and the tech tree, maps and sizes, tactics, playing with the right balance, difficulties, campaign, skirmish, multiplayer, saving, settings, editor (shown in-game: main menu *Manual & FAQ*, `F4`) |
| [faq.md](faq.md) | **FAQ**: 100 common questions and answers in twelve sections (also in-game) |
| [game-design.md](game-design.md) | the 17 ages, units per age and line, map types and naval units, buildings and their era names, technologies (incl. map techs), the 17 campaign levels, saved games, demo mode, counters, balance philosophy, six AI difficulties, scoring, controls |
| [level-editor.md](level-editor.md) | using the editor, map type and fish, level file format, validation limits |

## For developers

| Document | Contents |
|---|---|
| [architecture.md](architecture.md) | C4 context/container/component views, match data flow, anti-cheat, save/restore and demo flows, start-up order, concurrency model, persistence, deployment view |
| [design.md](design.md) | simulation, entity model, unit generation (incl. boats), counter matrix, combat, economy, techs and map techs, AI profiles, pathfinding and naval domain, fog, snapshot protocol, rendering, audio, levels and map types, editor, scoring, save format, demo mode, anti-cheat, metrics, configuration |
| [api.md](api.md) | REST endpoints (accounts, MFA, saves, admin, diagnostics, levels, scores), WebSocket messages (both directions, signing, save/restore, demo), snapshot format, metrics, limits |
| [testing.md](testing.md) | test strategy, simulation, naval, save and integration tests, fuzzing, coverage (92.4 %), browser smoke tests |
| [asr.md](asr.md) | architecturally significant requirements ASR-1…17 with quality-attribute scenarios |
| [adr/](adr/README.md) | architecture decision records 0001–0018 |

## For operators and security reviewers

| Document | Contents |
|---|---|
| [operations.md](operations.md) | build, run, flags/env, **configuration file**, port selection, systemd, accounts and bootstrap admin, TLS, reverse proxy, Docker, backup (incl. saves and audit log), logs, Prometheus monitoring, upgrades, troubleshooting |
| [security.md](security.md) | threat model (STRIDE, T1–T39), trust boundaries, input validation, sessions and MFA, fair play and anti-cheat, administration and audit, diagnostics exposure, OS controls, supply chain, verification |
| [../deploy/config/lotl.yaml](../deploy/config/lotl.yaml) | example configuration with every key and its default |
| [../deploy/systemd/](../deploy/systemd/) | `lotl.service` (hardened unit), `lotl.socket` (socket activation), `lotl.env` |
| [../deploy/selinux/README.md](../deploy/selinux/README.md) | SELinux policy module `lotl` |
| [../deploy/seccomp/README.md](../deploy/seccomp/README.md) | in-process seccomp filter and its layering with systemd |
| [../deploy/install.sh](../deploy/install.sh) | build-and-install script |
| [../Dockerfile](../Dockerfile), [../docker-compose.yml](../docker-compose.yml) | container image and example deployment |

## Quick start

```sh
make build && ./bin/lotl-server -port 8080      # http://127.0.0.1:8080
./bin/lotl-server -config deploy/config/lotl.yaml
# or
docker compose up -d --build                    # http://localhost:8080
```

## Repository map

```text
cmd/lotl-server/     entry point: config file, flags, env, socket activation, sandbox, HTTP server
internal/config/     YAML configuration: defaults, loading, validation
internal/game/       simulation: defs, game loop, commands, AI, pathfinding, fog, levels, map types, save/load
internal/levels/     the 17 campaign levels, skirmish generator options
internal/server/     HTTP API, sessions, MFA, admin, metrics, anti-cheat, WebSocket hub, rooms, demo, chat
internal/store/      JSON file store, argon2id accounts, roles, scores, custom levels, saves, audit log
internal/totp/       RFC 6238 one-time passwords
internal/hardening/  no_new_privs, capabilities, Landlock, seccomp
web/                 embedded browser client, level editor and admin page
deploy/              systemd, example config, SELinux, seccomp notes, install script
docs/                this documentation
```
