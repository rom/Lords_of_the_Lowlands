# 1. Record architecture decisions

Date: 2026-11-14

## Status

Accepted

## Context

Lords of the Lowlands combines a real-time simulation, a multiplayer
back-end, a browser client and an OS-level sandbox. Many choices (server
authority, no build step, JSON files instead of a database, in-process
seccomp) are deliberate trade-offs that look surprising without their
reasons. Contributors need to know why things are the way they are before
changing them.

## Decision

We record architecturally significant decisions as Architecture Decision
Records in `docs/adr/`, using Michael Nygard's format: **Title, Status,
Context, Decision, Consequences**. Files are numbered sequentially
(`NNNN-short-title.md`) and listed in `docs/adr/README.md`. An ADR is never
rewritten to reverse its decision; a new ADR supersedes it and the old one's
status is changed to "Superseded by ADR-NNNN".

ADRs are linked from the requirements they serve in [../asr.md](../asr.md).

## Consequences

- Design rationale lives next to the code and is reviewed in the same pull
  requests.
- Writing an ADR is a small extra step for significant changes; trivial
  choices do not need one.
- The set of ADRs is the starting point for reviews of security and
  performance properties.
