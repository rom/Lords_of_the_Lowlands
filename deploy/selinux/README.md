# SELinux policy module `lotl`

A targeted-policy module (reference-policy style) that confines
`lotl-server` in its own domain. It is a third, kernel-enforced layer next to
the systemd sandbox (`deploy/systemd/lotl.service`) and the server's in-process
Landlock/seccomp hardening (`internal/hardening`).

| Type             | Labels                                                    |
|------------------|-----------------------------------------------------------|
| `lotl_t`         | the running server process                                |
| `lotl_exec_t`    | `/usr/local/bin/lotl-server`, `/usr/bin/lotl-server`      |
| `lotl_var_lib_t` | `/var/lib/lotl(/.*)?`, `/var/lib/private/lotl(/.*)?`      |
| `lotl_etc_t`     | `/etc/lotl(/.*)?` (env file, TLS certificate and key)     |
| `lotl_port_t`    | TCP 8080 (assigned with `semanage port`)                  |

What `lotl_t` may do:

- bind and listen on `lotl_port_t`, accept connections, send/receive on them;
- create, write, rename and delete files below its data directory (the store
  writes atomically: temp file, `fsync`, `rename`);
- read `/etc/lotl` (TLS material, read once at start-up);
- log to the journal through the stderr stream systemd provides;
- signal its own threads, query/adjust its own rlimits and capability sets.

What it may **not** do: connect anywhere (`name_connect` is never granted),
bind any other port, execute anything, map writable+executable memory
(`execmem`), ptrace, use any capability, or read user home directories and
other services' data.

The module also allows `init_t` the `nnp_transition` into `lotl_t` (the unit
uses `NoNewPrivileges=yes`) and, for socket activation, to create/bind the
`lotl_t`-labelled listening socket on `lotl_port_t`.

## Build and install

Requires the policy development files (`selinux-policy-devel` on
Fedora/RHEL, `selinux-policy-dev` on Debian) and `policycoreutils`
(`semanage`, `restorecon`).

```sh
cd deploy/selinux
make -f /usr/share/selinux/devel/Makefile lotl.pp
sudo semodule -i lotl.pp

# Label the game port (use -m instead of -a if 8080 already has a type,
# e.g. http_cache_port_t on Fedora):
sudo semanage port -a -t lotl_port_t -p tcp 8080 \
  || sudo semanage port -m -t lotl_port_t -p tcp 8080

# Apply file contexts
sudo restorecon -Rv /usr/local/bin/lotl-server /etc/lotl /var/lib/lotl /var/lib/private/lotl

sudo systemctl restart lotl.socket lotl.service
```

`deploy/install.sh` performs these steps automatically when `semodule` and
the devel Makefile are present.

## Verify

```sh
ps -eZ | grep lotl-server            # expect system_u:system_r:lotl_t:s0
ls -Z /usr/local/bin/lotl-server      # expect lotl_exec_t
ls -dZ /var/lib/private/lotl          # expect lotl_var_lib_t
semanage port -l | grep lotl_port_t
```

## Changing the port

```sh
sudo semanage port -a -t lotl_port_t -p tcp 9000
sudo systemctl edit lotl.socket    # ListenStream= / ListenStream=9000
```

## Troubleshooting

Start in permissive mode for this domain only, exercise the game (log in,
play a match, save a level), then inspect denials:

```sh
sudo semanage permissive -a lotl_t
sudo ausearch -m AVC,USER_AVC -c lotl-server -ts recent
sudo ausearch -m AVC -ts recent | audit2allow -m lotl-local   # review, don't blindly load
sudo semanage permissive -d lotl_t
```

Expect no denials during normal operation. A denial for `name_connect`
indicates something is trying to make an outbound connection and should be
investigated, not allowed.

## Uninstall

```sh
sudo semodule -r lotl
sudo semanage port -d -t lotl_port_t -p tcp 8080
sudo restorecon -Rv /usr/local/bin/lotl-server /var/lib/private/lotl
```

The module was written against the reference-policy interfaces
(`init_daemon_domain`, `corenet_port`, `files_var_lib_filetrans`,
`logging_send_syslog_msg`, ...). Interface availability differs slightly
between distributions; build errors about unknown interfaces usually mean
the distribution names them differently (check
`/usr/share/selinux/devel/include`).
