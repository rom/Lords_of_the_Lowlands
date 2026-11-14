//go:build linux && arm64

package hardening

import "golang.org/x/sys/unix"

const nativeArch = unix.AUDIT_ARCH_AARCH64

const x32Bit = 0

var archDenied = []uintptr{unix.SYS_NFSSERVCTL}
