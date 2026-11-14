# 6. JSON file store with atomic writes instead of a database

Date: 2026-11-14

## Status

Accepted

## Context

Persistent data is small: accounts (name, salt, hash, a few counters),
top-25 scores per level and user-made levels (≤ 5 000, each ≤ 1 MiB on the
wire, typically tens of KB). Writes are rare (registration, game end, level
save). The server should be a single binary without external services
(ASR-13) and its sandbox should allow writing to exactly one directory
(ASR-3). Options: PostgreSQL/MySQL, SQLite (needs cgo or a pure-Go port),
BoltDB/bbolt, or plain files.

## Decision

`internal/store` keeps all data in memory behind a `sync.RWMutex` and
persists three JSON files in the data directory (`users.json`,
`scores.json`, `levels.json`). Every change rewrites the affected file
**atomically**: `CreateTemp` in the same directory, `Chmod 0600`, write,
`fsync`, `rename`. Files are loaded and levels re-validated at start-up.

## Consequences

- Zero dependencies and zero operations: backup is copying a directory;
  files are human-readable and diffable.
- The sandbox rule is simple: read/write regular files beneath one directory
  (Landlock, systemd `StateDirectory`, SELinux `lotl_var_lib_t`).
- A crash never leaves a partially written file.
- Every write re-serialises a whole file and the store has one lock: fine for
  the expected write rate, but it does not scale to very large user bases.
- Files are written independently (no multi-file transactions); a crash
  between `users.json` and `scores.json` in `RecordGame` can lose one score
  entry.
- Sessions are deliberately *not* persisted (see [ADR-0007](0007-argon2id-sessions.md)).
- Migrating to SQLite or a server database later only requires replacing
  the `Store` implementation behind the same methods.
