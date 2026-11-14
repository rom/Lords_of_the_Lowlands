//go:build linux

package hardening

import (
	"errors"

	"golang.org/x/sys/unix"
)

// commonDenied are system calls the game server never needs. They are
// rejected with EPERM. Dangerous classes: debugging/introspection of
// other processes, kernel modules, mounts and namespaces, eBPF, keyrings,
// program execution, clock manipulation, reboot and io_uring.
var commonDenied = []uintptr{
	unix.SYS_PTRACE, unix.SYS_PROCESS_VM_READV, unix.SYS_PROCESS_VM_WRITEV,
	unix.SYS_KEXEC_LOAD, unix.SYS_KEXEC_FILE_LOAD,
	unix.SYS_INIT_MODULE, unix.SYS_FINIT_MODULE, unix.SYS_DELETE_MODULE,
	unix.SYS_MOUNT, unix.SYS_UMOUNT2, unix.SYS_PIVOT_ROOT, unix.SYS_CHROOT,
	unix.SYS_MOVE_MOUNT, unix.SYS_FSOPEN, unix.SYS_FSMOUNT, unix.SYS_FSPICK, unix.SYS_OPEN_TREE, unix.SYS_FSCONFIG,
	unix.SYS_MOUNT_SETATTR,
	unix.SYS_SWAPON, unix.SYS_SWAPOFF, unix.SYS_REBOOT,
	unix.SYS_SETNS, unix.SYS_UNSHARE,
	unix.SYS_BPF, unix.SYS_PERF_EVENT_OPEN, unix.SYS_USERFAULTFD,
	unix.SYS_KEYCTL, unix.SYS_ADD_KEY, unix.SYS_REQUEST_KEY,
	unix.SYS_ACCT, unix.SYS_QUOTACTL,
	unix.SYS_SETTIMEOFDAY, unix.SYS_CLOCK_SETTIME, unix.SYS_ADJTIMEX, unix.SYS_CLOCK_ADJTIME,
	unix.SYS_OPEN_BY_HANDLE_AT, unix.SYS_NAME_TO_HANDLE_AT,
	unix.SYS_EXECVE, unix.SYS_EXECVEAT,
	unix.SYS_FANOTIFY_INIT, unix.SYS_VHANGUP, unix.SYS_SYSLOG,
	unix.SYS_IO_URING_SETUP, unix.SYS_IO_URING_ENTER, unix.SYS_IO_URING_REGISTER,
	unix.SYS_PERSONALITY, unix.SYS_SETHOSTNAME, unix.SYS_SETDOMAINNAME,
	unix.SYS_LOOKUP_DCOOKIE, unix.SYS_KCMP, unix.SYS_PIDFD_GETFD,
	unix.SYS_SETUID, unix.SYS_SETGID, unix.SYS_SETREUID, unix.SYS_SETREGID,
	unix.SYS_SETRESUID, unix.SYS_SETRESGID, unix.SYS_SETGROUPS, unix.SYS_SETFSUID, unix.SYS_SETFSGID,
}

// DeniedSyscalls returns the denylist for the running architecture.
func DeniedSyscalls() []uintptr {
	return append(append([]uintptr(nil), commonDenied...), archDenied...)
}

func stmt(code uint16, k uint32) unix.SockFilter { return unix.SockFilter{Code: code, K: k} }

func jump(code uint16, k uint32, jt, jf uint8) unix.SockFilter {
	return unix.SockFilter{Code: code, Jt: jt, Jf: jf, K: k}
}

// seccomp_data offsets
const (
	offNr   = 0
	offArch = 4
)

// BuildFilter assembles the seccomp-BPF program:
//
//	if arch != native            -> KILL_PROCESS
//	if nr >= x32 bit (amd64)     -> ERRNO(EPERM)
//	if nr in denylist            -> ERRNO(EPERM)
//	else                         -> ALLOW
func BuildFilter() ([]unix.SockFilter, int, error) {
	if nativeArch == 0 {
		return nil, 0, errors.New("seccomp filter not available for this architecture")
	}
	denied := DeniedSyscalls()
	if len(denied) > 250 {
		return nil, 0, errors.New("denylist too long for 8-bit jumps")
	}
	eperm := uint32(unix.SECCOMP_RET_ERRNO | uint32(unix.EPERM))
	prog := []unix.SockFilter{
		stmt(unix.BPF_LD|unix.BPF_W|unix.BPF_ABS, offArch),
		jump(unix.BPF_JMP|unix.BPF_JEQ|unix.BPF_K, nativeArch, 1, 0),
		stmt(unix.BPF_RET|unix.BPF_K, unix.SECCOMP_RET_KILL_PROCESS),
		stmt(unix.BPF_LD|unix.BPF_W|unix.BPF_ABS, offNr),
	}
	if x32Bit != 0 {
		prog = append(prog,
			jump(unix.BPF_JMP|unix.BPF_JGE|unix.BPF_K, x32Bit, 0, 1),
			stmt(unix.BPF_RET|unix.BPF_K, eperm))
	}
	// Each denied number jumps forward to the shared EPERM return that
	// follows the ALLOW instruction.
	n := len(denied)
	for i, nr := range denied {
		// remaining JEQs after this one: n-1-i, then the ALLOW: +1
		prog = append(prog, jump(unix.BPF_JMP|unix.BPF_JEQ|unix.BPF_K, uint32(nr), uint8(n-1-i+1), 0))
	}
	prog = append(prog,
		stmt(unix.BPF_RET|unix.BPF_K, unix.SECCOMP_RET_ALLOW),
		stmt(unix.BPF_RET|unix.BPF_K, eperm))
	return prog, n, nil
}
