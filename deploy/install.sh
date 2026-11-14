#!/bin/sh
# Build and install Lords of the Lowlands as a hardened systemd service.
#
# Usage (from anywhere inside the repository):
#   sudo deploy/install.sh [--no-selinux] [--no-enable] [--port N]
#
# Environment:
#   PREFIX      install prefix for the binary (default /usr/local)
#   GO          go command (default: go)
#   SKIP_BUILD  set to 1 to install an existing ./bin/lotl-server
#
# Steps: static build (CGO_ENABLED=0, -trimpath, -ldflags "-s -w"),
# install binary + units + example env file, optionally build and load the
# SELinux module, then enable and start lotl.socket.
set -eu

PREFIX=${PREFIX:-/usr/local}
GO=${GO:-go}
SKIP_BUILD=${SKIP_BUILD:-0}
SELINUX=1
ENABLE=1
PORT=

usage() {
	sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
	exit "${1:-0}"
}

while [ $# -gt 0 ]; do
	case $1 in
	--no-selinux) SELINUX=0 ;;
	--no-enable) ENABLE=0 ;;
	--port)
		[ $# -ge 2 ] || usage 2
		PORT=$2
		shift
		;;
	--port=*) PORT=${1#--port=} ;;
	-h | --help) usage 0 ;;
	*)
		echo "unknown option: $1" >&2
		usage 2
		;;
	esac
	shift
done

if [ -n "$PORT" ]; then
	case $PORT in
	'' | *[!0-9]*)
		echo "--port must be a number" >&2
		exit 2
		;;
	esac
	if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
		echo "--port must be 1..65535" >&2
		exit 2
	fi
fi

log() { printf '==> %s\n' "$*"; }

# Repository root = parent of the directory holding this script.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
BIN="$ROOT/bin/lotl-server"

if [ "$SKIP_BUILD" != 1 ]; then
	log "building static binary"
	(
		cd "$ROOT"
		# cgo must stay off: the sandbox relies on syscall.AllThreadsSyscall.
		CGO_ENABLED=0 "$GO" build -trimpath -buildvcs=false \
			-ldflags="-s -w" -o "$BIN" ./cmd/lotl-server
	)
fi
[ -x "$BIN" ] || {
	echo "missing $BIN" >&2
	exit 1
}

if [ "$(id -u)" -ne 0 ]; then
	echo "installation requires root (run with sudo)" >&2
	exit 1
fi

log "installing binary to $PREFIX/bin"
install -d -m 0755 "$PREFIX/bin"
install -m 0755 "$BIN" "$PREFIX/bin/lotl-server"

log "installing systemd units"
UNITDIR=/etc/systemd/system
install -m 0644 "$SCRIPT_DIR/systemd/lotl.service" "$UNITDIR/lotl.service"
install -m 0644 "$SCRIPT_DIR/systemd/lotl.socket" "$UNITDIR/lotl.socket"
if [ "$PREFIX" != /usr/local ]; then
	sed -i "s|/usr/local/bin/lotl-server|$PREFIX/bin/lotl-server|g; s|^ExecPaths=/usr/local/bin|ExecPaths=$PREFIX/bin|" \
		"$UNITDIR/lotl.service"
fi

install -d -m 0750 /etc/lotl
if [ ! -e /etc/lotl/lotl.env ]; then
	install -m 0640 "$SCRIPT_DIR/systemd/lotl.env" /etc/lotl/lotl.env
else
	log "keeping existing /etc/lotl/lotl.env"
fi

if [ -n "$PORT" ]; then
	log "socket port $PORT (drop-in)"
	install -d -m 0755 "$UNITDIR/lotl.socket.d"
	printf '[Socket]\nListenStream=\nListenStream=%s\n' "$PORT" >"$UNITDIR/lotl.socket.d/port.conf"
fi

install -d -m 0755 "$PREFIX/share/doc/lotl"
for f in "$ROOT"/docs/*.md; do
	[ -e "$f" ] && install -m 0644 "$f" "$PREFIX/share/doc/lotl/"
done

SEL_MAKEFILE=/usr/share/selinux/devel/Makefile
if [ "$SELINUX" = 1 ] && command -v semodule >/dev/null 2>&1 && [ -f "$SEL_MAKEFILE" ]; then
	log "building SELinux module"
	TMP=$(mktemp -d)
	trap 'rm -rf "$TMP"' EXIT INT TERM
	cp "$SCRIPT_DIR/selinux/lotl.te" "$SCRIPT_DIR/selinux/lotl.fc" "$SCRIPT_DIR/selinux/lotl.if" "$TMP/"
	(cd "$TMP" && make -f "$SEL_MAKEFILE" lotl.pp >/dev/null)
	semodule -i "$TMP/lotl.pp"
	SPORT=${PORT:-8080}
	if command -v semanage >/dev/null 2>&1; then
		semanage port -a -t lotl_port_t -p tcp "$SPORT" 2>/dev/null ||
			semanage port -m -t lotl_port_t -p tcp "$SPORT"
	else
		echo "warning: semanage not found; label port $SPORT as lotl_port_t manually" >&2
	fi
	if command -v restorecon >/dev/null 2>&1; then
		restorecon -R "$PREFIX/bin/lotl-server" /etc/lotl
		for d in /var/lib/lotl /var/lib/private/lotl; do
			[ -e "$d" ] && restorecon -R "$d"
		done
	fi
elif [ "$SELINUX" = 1 ]; then
	log "SELinux tooling not found; skipping policy module"
fi

systemctl daemon-reload
if [ "$ENABLE" = 1 ]; then
	log "enabling lotl.socket"
	systemctl enable --now lotl.socket
	# Restart a running service so it picks up the new binary.
	if systemctl is-active --quiet lotl.service; then
		systemctl restart lotl.service
	fi
fi

log "done. Check: systemd-analyze security lotl.service; journalctl -u lotl.service"
