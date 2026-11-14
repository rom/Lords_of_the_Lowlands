# 8. Defence-in-depth OS sandbox: in-process seccomp + Landlock + capabilities + systemd + SELinux

Date: 2026-11-14

## Status

Accepted

## Context

The server parses untrusted input from the Internet. A memory-safety bug is
unlikely in Go, but logic bugs, dependency bugs or runtime bugs could still
give an attacker code execution (ASR-3). The process needs very little from
the OS after start-up: accept TCP connections on one port, read and write
files in one directory, write logs to stderr. Deployments vary (bare
systemd, containers, developer laptops), so a protection that depends on
one launcher would often be missing.

## Decision

Apply several **independent** layers:

1. **In-process, always on** (`internal/hardening`, called from `main`
   after binding the socket and loading TLS keys):
   umask 077; `RLIMIT_CORE=0`; `PR_SET_DUMPABLE=0`; `PR_SET_NO_NEW_PRIVS`;
   clear ambient/bounding/effective/permitted/inheritable capabilities;
   **Landlock** — file-system access only below the data directory, TCP
   bind only to the listening port and no TCP connect (ABI ≥ 4), scoping of
   abstract UNIX sockets and signals (ABI ≥ 6); **seccomp-BPF** denylist of
   61 dangerous system calls (+ legacy calls per architecture), killing on
   foreign architectures and refusing the x32 ABI. Optional layers degrade to
   warnings on old kernels; no_new_privs and seccomp failures are fatal.
   `-no-sandbox` exists for debugging only.
2. **systemd unit** (`deploy/systemd`): `DynamicUser`, empty capability
   bounding set, `ProtectSystem=strict` and friends, `SystemCallFilter`
   allow-list, address-family and namespace restrictions,
   `MemoryDenyWriteExecute`, resource limits; socket activation for
   privileged ports.
3. **SELinux module** (`deploy/selinux`): `lotl_t` domain with bind/accept
   on `lotl_port_t`, data in `lotl_var_lib_t`, no `name_connect`, no
   `execmem`, no capabilities.
4. **Containers**: distroless non-root image, read-only root,
   `cap_drop: ALL`, `no-new-privileges`.

## Consequences

- An attacker who gains code execution cannot exec a shell, read other
  files, connect out, change identity, load modules, use BPF/io_uring or
  ptrace — regardless of how the binary was launched.
- The binary must be built with `CGO_ENABLED=0` (`AllThreadsSyscall`).
- Everything the process needs must be opened before `Apply`: TLS
  certificates cannot be reloaded without a restart; `/etc/localtime` cannot
  be read afterwards (the unit sets `TZ=UTC`).
- The outer systemd filter must allow `seccomp`, `landlock_*` and `capset`
  (`@sandbox capset`) or the inner layer fails or degrades.
- The in-process filter is a denylist (robust against Go runtime changes);
  the allow-list role is left to systemd/container profiles.
- More moving parts to document and verify (see
  [../security.md](../security.md#6-verifying-a-deployment)).
