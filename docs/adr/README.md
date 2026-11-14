# Architecture decision records

Format: Michael Nygard (Status / Context / Decision / Consequences); see
[ADR-0001](0001-record-architecture-decisions.md).

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-go-server-and-simulation.md) | Go for the server and the game simulation | Accepted |
| [0003](0003-server-authoritative-snapshots.md) | Server-authoritative simulation with snapshot streaming (not lockstep) | Accepted |
| [0004](0004-vanilla-js-canvas-client.md) | Browser client in vanilla ES modules + Canvas 2D with procedural art | Accepted |
| [0005](0005-coder-websocket-deflate.md) | WebSocket via `github.com/coder/websocket` with permessage-deflate | Accepted |
| [0006](0006-json-file-store.md) | JSON file store with atomic writes instead of a database | Accepted |
| [0007](0007-argon2id-sessions.md) | argon2id passwords and server-side sessions with `SameSite=Strict` cookies | Accepted |
| [0008](0008-defence-in-depth-sandbox.md) | Defence-in-depth OS sandbox (seccomp, Landlock, capabilities, systemd, SELinux) | Accepted |
| [0009](0009-procedural-webaudio.md) | Procedural Web Audio sound effects and generative music | Accepted |
| [0010](0010-server-side-fog-filtering.md) | Fog-of-war filtering on the server | Accepted |
| [0011](0011-data-driven-definitions.md) | Data-driven unit/tech definitions scaled by age | Accepted |
| [0012](0012-embedded-static-assets.md) | Embedded static assets via `go:embed` | Accepted |

New ADR: copy the structure of an existing one, take the next number, add a
row here and link it from [../asr.md](../asr.md) if it serves a requirement.
