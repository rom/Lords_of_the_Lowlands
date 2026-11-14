//go:build linux && amd64

package hardening

import "golang.org/x/sys/unix"

const nativeArch = unix.AUDIT_ARCH_X86_64

// x32Bit marks x32 ABI system calls, which are always refused.
const x32Bit = 0x40000000

var archDenied = []uintptr{unix.SYS_IOPL, unix.SYS_IOPERM, unix.SYS_USELIB, unix.SYS_CREATE_MODULE,
	unix.SYS_GET_KERNEL_SYMS, unix.SYS_QUERY_MODULE, unix.SYS_NFSSERVCTL, unix.SYS__SYSCTL, unix.SYS_USTAT, unix.SYS_SYSFS,
	unix.SYS_MODIFY_LDT}
