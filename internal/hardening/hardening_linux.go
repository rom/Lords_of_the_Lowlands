//go:build linux

package hardening

import (
	"errors"
	"fmt"
	"os"
	"syscall"
	"unsafe"

	"golang.org/x/sys/unix"
)

// Apply enables every available protection. Failures of optional layers
// (e.g. Landlock on old kernels) are reported as warnings; failure to set
// no_new_privs or to install the seccomp filter is an error.
func Apply(o Options) (*Report, error) {
	r := &Report{}
	syscall.Umask(0o077)
	// Never write core dumps (they could contain session tokens).
	_ = unix.Setrlimit(unix.RLIMIT_CORE, &unix.Rlimit{Cur: 0, Max: 0})
	if err := prctlAll(unix.PR_SET_DUMPABLE, 0); err == nil {
		r.NonDumpable = true
	} else {
		r.Warnings = append(r.Warnings, "dumpable: "+err.Error())
	}
	if err := prctlAll(unix.PR_SET_NO_NEW_PRIVS, 1); err != nil {
		return r, fmt.Errorf("no_new_privs: %w", err)
	}
	r.NoNewPrivs = true
	if !o.DisableCaps {
		if err := DropCapabilities(); err != nil {
			r.Warnings = append(r.Warnings, "capabilities: "+err.Error())
		} else {
			r.CapsDropped = true
		}
	}
	if !o.DisableLandlock {
		if err := applyLandlock(o, r); err != nil {
			r.Warnings = append(r.Warnings, "landlock: "+err.Error())
		}
	}
	if !o.DisableSeccomp {
		prog, n, err := BuildFilter()
		if err != nil {
			return r, err
		}
		if err := installFilter(prog); err != nil {
			return r, fmt.Errorf("seccomp: %w", err)
		}
		r.Seccomp, r.SeccompDenied = true, n
	}
	return r, nil
}

// prctlAll performs prctl on every OS thread of the process.
func prctlAll(op, arg uintptr) error {
	_, _, e := syscall.AllThreadsSyscall(syscall.SYS_PRCTL, op, arg, 0)
	if e == syscall.ENOTSUP {
		// cgo builds: fall back to the current thread only.
		_, _, e = syscall.RawSyscall(syscall.SYS_PRCTL, op, arg, 0)
	}
	if e != 0 {
		return e
	}
	return nil
}

// DropCapabilities clears the ambient, bounding, effective, permitted and
// inheritable capability sets.
func DropCapabilities() error {
	_, _, _ = syscall.AllThreadsSyscall(syscall.SYS_PRCTL, unix.PR_CAP_AMBIENT, unix.PR_CAP_AMBIENT_CLEAR_ALL, 0)
	for c := 0; c <= unix.CAP_LAST_CAP; c++ {
		// Needs CAP_SETPCAP; harmless EPERM otherwise (unprivileged
		// processes cannot regain capabilities anyway with no_new_privs).
		_, _, _ = syscall.AllThreadsSyscall(syscall.SYS_PRCTL, unix.PR_CAPBSET_DROP, uintptr(c), 0)
	}
	hdr := unix.CapUserHeader{Version: unix.LINUX_CAPABILITY_VERSION_3}
	var data [2]unix.CapUserData
	_, _, e := syscall.AllThreadsSyscall(syscall.SYS_CAPSET, uintptr(unsafe.Pointer(&hdr)), uintptr(unsafe.Pointer(&data[0])), 0)
	if e == syscall.ENOTSUP {
		_, _, e = syscall.RawSyscall(syscall.SYS_CAPSET, uintptr(unsafe.Pointer(&hdr)), uintptr(unsafe.Pointer(&data[0])), 0)
	}
	if e != 0 {
		return e
	}
	return nil
}

// Effective returns the current effective capability mask.
func Effective() (uint64, error) {
	hdr := unix.CapUserHeader{Version: unix.LINUX_CAPABILITY_VERSION_3}
	var data [2]unix.CapUserData
	if err := unix.Capget(&hdr, &data[0]); err != nil {
		return 0, err
	}
	return uint64(data[0].Effective) | uint64(data[1].Effective)<<32, nil
}

// ---------------------------------------------------------------------------
// Landlock

const (
	ruleTypePathBeneath = 1
	ruleTypeNetPort     = 2
)

type pathBeneathAttr struct {
	allowedAccess uint64
	parentFd      int32
}

// LandlockABI returns the kernel's Landlock ABI version (0 if unsupported).
func LandlockABI() int {
	v, _, e := syscall.Syscall(unix.SYS_LANDLOCK_CREATE_RULESET, 0, 0, unix.LANDLOCK_CREATE_RULESET_VERSION)
	if e != 0 {
		return 0
	}
	return int(v)
}

// fsAccess returns all file-system rights known to the given ABI.
func fsAccess(abi int) uint64 {
	a := uint64(unix.LANDLOCK_ACCESS_FS_EXECUTE | unix.LANDLOCK_ACCESS_FS_WRITE_FILE | unix.LANDLOCK_ACCESS_FS_READ_FILE |
		unix.LANDLOCK_ACCESS_FS_READ_DIR | unix.LANDLOCK_ACCESS_FS_REMOVE_DIR | unix.LANDLOCK_ACCESS_FS_REMOVE_FILE |
		unix.LANDLOCK_ACCESS_FS_MAKE_CHAR | unix.LANDLOCK_ACCESS_FS_MAKE_DIR | unix.LANDLOCK_ACCESS_FS_MAKE_REG |
		unix.LANDLOCK_ACCESS_FS_MAKE_SOCK | unix.LANDLOCK_ACCESS_FS_MAKE_FIFO | unix.LANDLOCK_ACCESS_FS_MAKE_BLOCK |
		unix.LANDLOCK_ACCESS_FS_MAKE_SYM)
	if abi >= 2 {
		a |= unix.LANDLOCK_ACCESS_FS_REFER
	}
	if abi >= 3 {
		a |= unix.LANDLOCK_ACCESS_FS_TRUNCATE
	}
	if abi >= 5 {
		a |= unix.LANDLOCK_ACCESS_FS_IOCTL_DEV
	}
	return a
}

// DataDirAccess are the rights granted beneath the data directory.
func DataDirAccess(abi int) uint64 {
	a := uint64(unix.LANDLOCK_ACCESS_FS_WRITE_FILE | unix.LANDLOCK_ACCESS_FS_READ_FILE | unix.LANDLOCK_ACCESS_FS_READ_DIR |
		unix.LANDLOCK_ACCESS_FS_REMOVE_FILE | unix.LANDLOCK_ACCESS_FS_MAKE_REG)
	if abi >= 3 {
		a |= unix.LANDLOCK_ACCESS_FS_TRUNCATE
	}
	return a
}

func applyLandlock(o Options, r *Report) error {
	abi := LandlockABI()
	r.LandlockABI = abi
	if abi < 1 {
		return errors.New("not supported by this kernel")
	}
	attr := unix.LandlockRulesetAttr{Access_fs: fsAccess(abi)}
	size := unsafe.Sizeof(attr.Access_fs)
	if abi >= 4 {
		attr.Access_net = unix.LANDLOCK_ACCESS_NET_BIND_TCP | unix.LANDLOCK_ACCESS_NET_CONNECT_TCP
		size += unsafe.Sizeof(attr.Access_net)
	}
	if abi >= 6 {
		attr.Scoped = unix.LANDLOCK_SCOPE_ABSTRACT_UNIX_SOCKET | unix.LANDLOCK_SCOPE_SIGNAL
		size += unsafe.Sizeof(attr.Scoped)
	}
	fd, _, e := syscall.Syscall(unix.SYS_LANDLOCK_CREATE_RULESET, uintptr(unsafe.Pointer(&attr)), size, 0)
	if e != 0 {
		return fmt.Errorf("create ruleset: %w", e)
	}
	defer syscall.Close(int(fd))
	addPath := func(path string, access uint64) error {
		f, err := os.OpenFile(path, unix.O_PATH|unix.O_CLOEXEC, 0)
		if err != nil {
			return err
		}
		defer f.Close()
		pb := pathBeneathAttr{allowedAccess: access & attr.Access_fs, parentFd: int32(f.Fd())}
		_, _, e := syscall.Syscall6(unix.SYS_LANDLOCK_ADD_RULE, fd, ruleTypePathBeneath, uintptr(unsafe.Pointer(&pb)), 0, 0, 0)
		if e != 0 {
			return fmt.Errorf("add rule %s: %w", path, e)
		}
		return nil
	}
	if o.DataDir != "" {
		if err := addPath(o.DataDir, DataDirAccess(abi)); err != nil {
			return err
		}
	}
	for _, p := range o.ReadOnly {
		if err := addPath(p, unix.LANDLOCK_ACCESS_FS_READ_FILE|unix.LANDLOCK_ACCESS_FS_READ_DIR); err != nil {
			r.Warnings = append(r.Warnings, err.Error())
		}
	}
	if abi >= 4 {
		addPort := func(port int, access uint64) error {
			np := struct {
				allowed uint64
				port    uint64
			}{access, uint64(port)}
			_, _, e := syscall.Syscall6(unix.SYS_LANDLOCK_ADD_RULE, fd, ruleTypeNetPort, uintptr(unsafe.Pointer(&np)), 0, 0, 0)
			if e != 0 {
				return fmt.Errorf("add port rule %d: %w", port, e)
			}
			return nil
		}
		if o.BindPort > 0 {
			if err := addPort(o.BindPort, unix.LANDLOCK_ACCESS_NET_BIND_TCP); err != nil {
				return err
			}
		}
		for _, p := range o.AllowConnect {
			if err := addPort(p, unix.LANDLOCK_ACCESS_NET_CONNECT_TCP); err != nil {
				return err
			}
		}
	}
	_, _, e = syscall.AllThreadsSyscall(unix.SYS_LANDLOCK_RESTRICT_SELF, fd, 0, 0)
	if e == syscall.ENOTSUP {
		return errors.New("binary built with cgo; rebuild with CGO_ENABLED=0")
	}
	if e != 0 {
		return fmt.Errorf("restrict self: %w", e)
	}
	r.LandlockFS = true
	r.LandlockNet = abi >= 4
	r.LandlockScoped = abi >= 6
	return nil
}

// ---------------------------------------------------------------------------
// seccomp

func installFilter(prog []unix.SockFilter) error {
	fp := unix.SockFprog{Len: uint16(len(prog)), Filter: &prog[0]}
	_, _, e := syscall.RawSyscall(unix.SYS_SECCOMP, unix.SECCOMP_SET_MODE_FILTER, unix.SECCOMP_FILTER_FLAG_TSYNC, uintptr(unsafe.Pointer(&fp)))
	if e != 0 {
		return e
	}
	return nil
}
