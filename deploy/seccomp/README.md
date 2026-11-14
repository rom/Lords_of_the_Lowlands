# System-call filtering

`lotl-server` is filtered twice:

1. **In-process seccomp-BPF filter** — installed by the server itself
   (`internal/hardening/seccomp_linux.go`, `seccomp_amd64.go`,
   `seccomp_arm64.go`) right after the listening socket is open. It works on
   any Linux host, with or without systemd or containers.
2. **systemd `SystemCallFilter=`** — an allow-list applied by the service
   manager before `execve` (`deploy/systemd/lotl.service`).

Both filters are evaluated by the kernel for every system call; the most
restrictive verdict wins. A call must pass *both*.

## The in-process filter

`hardening.BuildFilter()` assembles a classic BPF program:

```text
load arch
if arch != native (AUDIT_ARCH_X86_64 / AUDIT_ARCH_AARCH64) -> SECCOMP_RET_KILL_PROCESS
load nr
if nr >= 0x40000000 (x32 ABI, amd64 only)                 -> SECCOMP_RET_ERRNO(EPERM)
if nr in denylist                                          -> SECCOMP_RET_ERRNO(EPERM)
else                                                       -> SECCOMP_RET_ALLOW
```

It is installed with `seccomp(SECCOMP_SET_MODE_FILTER, SECCOMP_FILTER_FLAG_TSYNC)`
so all OS threads of the Go runtime get it at once; `no_new_privs` is set on
every thread beforehand (`prctl` via `syscall.AllThreadsSyscall`, which needs
a `CGO_ENABLED=0` build). Failure to install the filter is fatal — the
server refuses to start (unless `-no-sandbox` is given).

Denied calls return `EPERM` rather than killing the process so that a
future Go runtime needing one of them fails visibly in the log instead of
crashing. Only a foreign architecture (e.g. 32-bit `int 0x80` entry on
amd64) kills, because syscall numbers differ there and the denylist would
not apply.

The number of denied calls is logged at start-up:

```json
{"level":"INFO","msg":"sandbox","noNewPrivs":true,"caps":true,"landlockABI":6,
 "landlockFS":true,"landlockNet":true,"seccomp":true,"denied":72,"warnings":""}
```

(`denied` is 61 common + 11 amd64-specific = 72 on x86-64, 61 + 1 = 62 on arm64.)

### Denylist

| Category | System calls | Why |
|---|---|---|
| Process introspection | `ptrace`, `process_vm_readv`, `process_vm_writev`, `kcmp`, `pidfd_getfd` | no debugging/reading of other processes, no fd theft |
| Kernel replacement / modules | `kexec_load`, `kexec_file_load`, `init_module`, `finit_module`, `delete_module` | |
| Mounts | `mount`, `umount2`, `pivot_root`, `chroot`, `move_mount`, `fsopen`, `fsmount`, `fspick`, `open_tree`, `fsconfig`, `mount_setattr` | |
| Swap / power | `swapon`, `swapoff`, `reboot` | |
| Namespaces | `setns`, `unshare` | common container-escape primitives |
| Kernel attack surface | `bpf`, `perf_event_open`, `userfaultfd`, `io_uring_setup`, `io_uring_enter`, `io_uring_register` | historically rich in exploitable bugs |
| Keyrings | `keyctl`, `add_key`, `request_key` | |
| Accounting / quotas | `acct`, `quotactl` | |
| Clock | `settimeofday`, `clock_settime`, `adjtimex`, `clock_adjtime` | |
| File handles | `open_by_handle_at`, `name_to_handle_at` | bypass of path-based checks |
| Program execution | `execve`, `execveat` | the server never runs other programs; a compromise cannot spawn a shell |
| Misc. privileged | `fanotify_init`, `vhangup`, `syslog`, `lookup_dcookie`, `personality`, `sethostname`, `setdomainname` | |
| Identity changes | `setuid`, `setgid`, `setreuid`, `setregid`, `setresuid`, `setresgid`, `setgroups`, `setfsuid`, `setfsgid` | |
| amd64 legacy (`seccomp_amd64.go`) | `iopl`, `ioperm`, `uselib`, `create_module`, `get_kernel_syms`, `query_module`, `nfsservctl`, `_sysctl`, `ustat`, `sysfs`, `modify_ldt` | obsolete or raw-I/O calls |
| arm64 (`seccomp_arm64.go`) | `nfsservctl` | |

Other architectures (`seccomp_generic.go`) have no filter: `BuildFilter`
returns an error and `Apply` fails, so the server must be started with
`-no-sandbox` there.

A denylist (rather than an allow-list) is used in-process on purpose: the set
of calls the Go runtime and standard library may issue changes between Go
releases, while the dangerous calls above are stable. The *allow-list* role
is taken by systemd (below) or the container runtime's default profile.

## Layering with systemd

`lotl.service` sets:

```ini
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources @mount @debug @cpu-emulation @obsolete @raw-io @reboot @swap @module @clock
SystemCallFilter=@sandbox capset
SystemCallErrorNumber=EPERM
```

Assignments are applied in order: start from `@system-service`, remove the
privileged/resource groups, then re-add exactly what the in-process hardening
needs:

| Needed by `internal/hardening` | systemd group | Note |
|---|---|---|
| `prctl` (`PR_SET_NO_NEW_PRIVS`, `PR_SET_DUMPABLE`, `PR_CAP_AMBIENT`, `PR_CAPBSET_DROP`) | `@process` (in `@system-service`) | |
| `capset` | `@privileged` | re-added explicitly; without it capability clearing is reported as a warning |
| `seccomp` | `@sandbox` | **not** in `@system-service`; without it the server refuses to start |
| `landlock_create_ruleset`, `landlock_add_rule`, `landlock_restrict_self` | `@sandbox` | without them Landlock is reported as a warning |
| `prlimit64` (for `RLIMIT_CORE=0`) | `@default` | `setrlimit` is removed with `@resources`; Go uses `prlimit64` |
| `tgkill`, `rt_sigprocmask`, ... (`AllThreadsSyscall`) | `@process`, `@signal` | |
| `umask` | `@system-service` | |

Check what systemd allows on your version with
`systemd-analyze syscall-filter @system-service` and
`systemd-analyze syscall-filter @sandbox`.

`MemoryDenyWriteExecute=yes`, `LockPersonality=yes`,
`RestrictAddressFamilies=` and `RestrictNamespaces=yes` are also implemented
by systemd as seccomp filters and stack with the above.

## Containers

Docker's and Podman's default seccomp profiles allow `seccomp(2)`
(with `no-new-privileges`) and, on current versions, the Landlock calls. If
the runtime's profile blocks Landlock, the server starts with a
`landlock: ...` warning; if it blocks `seccomp(2)`, start-up fails with
`hardening: seccomp: operation not permitted`. Use a profile that allows them
rather than `-no-sandbox` in production.

## Verifying

```sh
pid=$(systemctl show -p MainPID --value lotl.service)
grep -E 'Seccomp|NoNewPrivs' /proc/$pid/status
# Seccomp:          2          (filter mode)
# Seccomp_filters:  N          (systemd's filters + the server's own)
# NoNewPrivs:       1
journalctl -u lotl.service -o cat | grep '"msg":"sandbox"'
```
