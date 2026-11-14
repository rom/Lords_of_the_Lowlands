# 14. TOTP multi-factor authentication without external dependencies

Date: 2026-11-14

## Status

Accepted

## Context

Administrator accounts can block, delete and reset other accounts, so a
stolen password must not be enough to take one over (ASR-4, ASR-15). The
server has no outbound network (Landlock, SELinux), which rules out SMS,
e-mail and hosted identity providers. A TOTP library would be one more
dependency for about 60 lines of code.

## Decision

- Implement RFC 6238 TOTP in `internal/totp` with the standard library:
  HMAC-SHA1, 6 digits, 30 s step, 160-bit random base32 secret,
  `otpauth://` URI for authenticator apps, constant-time comparison,
  ±1 step clock skew.
- `Verify` returns the matched step; the server stores it as
  `User.MFALastStep` and rejects any step ≤ the last one, so a code can be
  used only once.
- Enrolment: `POST /api/mfa/setup` keeps the pending secret in the
  session; `POST /api/mfa/enable` stores it only after a valid code.
- Accounts with `mfaRequired` (or admins with `accounts.requireAdminMFA`)
  but no authenticator get a **restricted session** that can only enrol
  (`/api/me`, `/api/mfa/*`, `/api/logout`).
- Tested against the RFC 6238 Appendix B vectors.

## Consequences

- Works with any TOTP app; no network access, no new dependency.
- No recovery codes: a lost authenticator needs an administrator
  (`resetMfa`), and the last administrator needs file-level recovery.
- Secrets are stored in `users.json` (protected like password hashes, but
  not hashed — TOTP needs the plain secret).
