# 7. argon2id passwords and server-side sessions with SameSite=Strict cookies

Date: 2026-11-14

## Status

Accepted

## Context

Players register with a name and password (ASR-4). The browser talks to the
same origin via `fetch` and a WebSocket. We need password storage that
resists offline cracking, session handling that resists theft and CSRF, and
no dependency on external identity providers. Options: bcrypt/scrypt/argon2id;
JWTs vs opaque tokens; cookies vs `Authorization` headers (not available to
browser WebSockets).

## Decision

- Hash passwords with **argon2id** (`golang.org/x/crypto/argon2.IDKey`):
  m = 19 MiB, t = 2, p = 1, 32-byte key, 16-byte random salt per user
  (OWASP 2023 minimum). Compare with `subtle.ConstantTimeCompare`; hash a
  dummy for unknown users. Passwords 8–128 bytes.
- Issue **opaque session tokens** (32 bytes from `crypto/rand`, base64url)
  stored **only in server memory** with a 7-day expiry.
- Deliver them in a cookie `lotl_session` with `HttpOnly`,
  `SameSite=Strict`, `Path=/` and `Secure` when served over TLS
  (`-secure-cookies` behind a proxy).
- Additionally require same-origin `Origin`/`Referer` and
  `Content-Type: application/json` for state-changing API calls, and rely on
  the WebSocket library's Origin check.
- Rate-limit `register`/`login` per IP (1 per 5 s, burst 8).

## Consequences

- A stolen `users.json` is expensive to crack; hashing costs ~19 MiB and some
  tens of milliseconds per login, bounded by the auth rate limit.
- `HttpOnly` keeps tokens away from scripts; `SameSite=Strict` plus the
  Origin check stop CSRF and cross-site WebSocket hijacking.
- Logout and expiry are immediate (server-side state), unlike stateless JWTs.
- Restarting the server logs everybody out; multiple server instances would
  need a shared session store.
- No password reset or 2FA (no e-mail is collected).
