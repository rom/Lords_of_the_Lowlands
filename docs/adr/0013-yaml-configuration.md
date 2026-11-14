# 13. YAML configuration file with flag/env overrides

Date: 2026-11-14

## Status

Accepted

## Context

The server grew settings that do not fit on a command line: account policy
(registration mode, guests, bootstrap admin, MFA), anti-cheat thresholds,
demo mode, save limits, rate limits and the metrics token. Operators also
need the existing flags and `LOTL_*` variables to keep working
(systemd unit, Docker, scripts).

## Decision

- Add `internal/config`: one `Config` struct (sections `server`, `data`,
  `security`, `accounts`, `game`, `anticheat`, `metrics`) with
  `Default()`, `Load(path)`, `Parse()` and `Validate()`.
- Decode with `gopkg.in/yaml.v3` and `KnownFields(true)`: unknown keys are
  an error, so a typo cannot silently disable a setting.
- `Validate()` checks ranges (ports, room count, password length,
  rate limits, body size, demo timings, anti-cheat thresholds, token length)
  and runs again after overrides are applied.
- Path from `-config` or `LOTL_CONFIG`. Precedence:
  **flag > environment > file > built-in default** (`parseFlags`).
- The file is read once at start-up, **before** the sandbox is applied, so
  it may live outside the data directory (Landlock forbids reading it
  afterwards).
- Secrets do not belong in the file where avoidable: the bootstrap admin
  password comes only from `LOTL_ADMIN_PASSWORD`.

## Consequences

- One documented example (`deploy/config/lotl.yaml`) lists every key with
  its default; `TestDefaultsAndExample` checks that it loads and validates
  (keeping its values equal to `Default()` is a review rule).
- Configuration changes need a restart (no reload; the file is unreadable
  after start-up anyway).
- New third-party dependency `gopkg.in/yaml.v3` (pure Go).
- Only the historic settings have flags/env variables; the newer ones are
  file-only.
