# 15. Layered anti-cheat on top of the authoritative server

Date: 2026-11-14

## Status

Accepted

## Context

The authoritative simulation ([ADR-0003](0003-server-authoritative-snapshots.md))
and fog filtering ([ADR-0010](0010-server-side-fog-filtering.md)) already
make impossible commands and map hacks ineffective. What remains are
command injection/replay from a second socket or a proxy, modified clients
(bots, scripted micro), and clients probing for information they should
not have. A determined cheater controls the browser, so client-side checks
can be bypassed.

## Decision

Three layers, each scoring suspicious events per connection
(`internal/server/anticheat.go`):

1. **Protocol** — `hello` carries a random 32-byte key; every `cmd` is
   `{p, n, mac}` with `mac = HMAC-SHA256(key, "n:p")` and `n` strictly
   increasing. Bad MAC, bad sequence or unsigned commands are dropped.
2. **Client** — `web/js/integrity.js` reports SHA-256 of its modules and
   `navigator.webdriver`; the server compares them with the digests of the
   files it embeds.
3. **Server** — before `Apply`, `inspectCommand` flags targeting entities
   hidden by fog, building in unexplored land and ordering other players'
   units; a sliding one-minute window flags sustained APM above
   `anticheat.maxAPM`.

Scores add up; at `warnScore` the player gets a `warn`, at `kickScore` they
resign, are disconnected, their result is not recorded, an audit entry is
written and the account gets a flag for the administrator.

## Consequences

- Cheap (one HMAC per command) and pure JavaScript on the client, so it
  also works on plain-HTTP LAN servers without `crypto.subtle`.
- Layers 1–2 only raise the bar: a modified client can extract the key and
  fake digests. The real protection stays server authority + fog filtering.
- Network latency can produce rare hidden-target findings for honest
  players; weights and thresholds are chosen so isolated events never kick.
- Scores are per connection (reset on reconnect); flags persist on the
  account. No automatic ban — a human decides.
