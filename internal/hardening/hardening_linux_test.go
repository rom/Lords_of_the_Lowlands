//go:build linux

package hardening

import (
	"encoding/binary"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"

	"golang.org/x/sys/unix"
)

// runBPF is a tiny classic-BPF interpreter covering the instructions our
// filter uses, so the program can be verified without loading it.
func runBPF(t *testing.T, prog []unix.SockFilter, data []byte) uint32 {
	t.Helper()
	var a uint32
	for pc := 0; pc < len(prog); pc++ {
		ins := prog[pc]
		switch ins.Code {
		case unix.BPF_LD | unix.BPF_W | unix.BPF_ABS:
			a = binary.LittleEndian.Uint32(data[ins.K:])
		case unix.BPF_JMP | unix.BPF_JEQ | unix.BPF_K:
			if a == ins.K {
				pc += int(ins.Jt)
			} else {
				pc += int(ins.Jf)
			}
		case unix.BPF_JMP | unix.BPF_JGE | unix.BPF_K:
			if a >= ins.K {
				pc += int(ins.Jt)
			} else {
				pc += int(ins.Jf)
			}
		case unix.BPF_RET | unix.BPF_K:
			return ins.K
		default:
			t.Fatalf("unknown instruction %#x", ins.Code)
		}
	}
	t.Fatal("fell off the end of the program")
	return 0
}

func seccompData(nr, arch uint32) []byte {
	b := make([]byte, 64)
	binary.LittleEndian.PutUint32(b[0:], nr)
	binary.LittleEndian.PutUint32(b[4:], arch)
	return b
}

func TestFilterProgram(t *testing.T) {
	prog, n, err := BuildFilter()
	if err != nil {
		t.Fatal(err)
	}
	if n != len(DeniedSyscalls()) || n < 50 {
		t.Fatalf("denied %d", n)
	}
	eperm := uint32(unix.SECCOMP_RET_ERRNO | uint32(unix.EPERM))
	for _, nr := range DeniedSyscalls() {
		if got := runBPF(t, prog, seccompData(uint32(nr), nativeArch)); got != eperm {
			t.Fatalf("syscall %d: got %#x", nr, got)
		}
	}
	for _, nr := range []uintptr{unix.SYS_READ, unix.SYS_WRITE, unix.SYS_MMAP, unix.SYS_FUTEX, unix.SYS_ACCEPT4, unix.SYS_EPOLL_PWAIT, unix.SYS_CLONE, unix.SYS_OPENAT} {
		if got := runBPF(t, prog, seccompData(uint32(nr), nativeArch)); got != unix.SECCOMP_RET_ALLOW {
			t.Fatalf("syscall %d should be allowed, got %#x", nr, got)
		}
	}
	if got := runBPF(t, prog, seccompData(unix.SYS_READ, 0x12345)); got != unix.SECCOMP_RET_KILL_PROCESS {
		t.Fatal("foreign arch must be killed")
	}
	if x32Bit != 0 {
		if got := runBPF(t, prog, seccompData(x32Bit|1, nativeArch)); got != eperm {
			t.Fatal("x32 must be refused")
		}
	}
	has := map[uintptr]bool{}
	for _, nr := range DeniedSyscalls() {
		has[nr] = true
	}
	for _, nr := range []uintptr{unix.SYS_PTRACE, unix.SYS_EXECVE, unix.SYS_BPF, unix.SYS_MOUNT, unix.SYS_UNSHARE, unix.SYS_KEXEC_LOAD} {
		if !has[nr] {
			t.Fatalf("%d must be denied", nr)
		}
	}
}

func TestAccessMasks(t *testing.T) {
	if fsAccess(1)&unix.LANDLOCK_ACCESS_FS_REFER != 0 || fsAccess(2)&unix.LANDLOCK_ACCESS_FS_REFER == 0 {
		t.Fatal("refer")
	}
	if fsAccess(3)&unix.LANDLOCK_ACCESS_FS_TRUNCATE == 0 || fsAccess(5)&unix.LANDLOCK_ACCESS_FS_IOCTL_DEV == 0 {
		t.Fatal("truncate/ioctl")
	}
	if DataDirAccess(1)&unix.LANDLOCK_ACCESS_FS_EXECUTE != 0 || DataDirAccess(3)&unix.LANDLOCK_ACCESS_FS_TRUNCATE == 0 {
		t.Fatal("data dir rights")
	}
	_ = LandlockABI()
	if _, err := Effective(); err != nil {
		t.Fatal(err)
	}
}

// TestApplyPartialInProcess applies the layers that do not restrict the
// test runner itself (no_new_privs, non-dumpable, capabilities).
func TestApplyPartialInProcess(t *testing.T) {
	rep, err := Apply(Options{DisableLandlock: true, DisableSeccomp: true})
	if err != nil {
		t.Fatal(err)
	}
	if !rep.NoNewPrivs {
		t.Fatal("no_new_privs")
	}
	b, _ := os.ReadFile("/proc/self/status")
	if !strings.Contains(string(b), "NoNewPrivs:\t1") {
		t.Fatal("NoNewPrivs not set in /proc")
	}
	if rep.CapsDropped {
		if eff, _ := Effective(); eff != 0 {
			t.Fatalf("effective caps %#x", eff)
		}
	}
}

// TestSandboxInChild applies the full sandbox in a child process and checks
// that it blocks what it should while the data directory stays usable.
func TestSandboxInChild(t *testing.T) {
	if os.Getenv("LOTL_SANDBOX_CHILD") == "1" {
		sandboxChild()
		return
	}
	dir := t.TempDir()
	data := filepath.Join(dir, "data")
	os.Mkdir(data, 0o700)
	outside := filepath.Join(dir, "outside")
	cmd := exec.Command(os.Args[0], "-test.run=^TestSandboxInChild$", "-test.v")
	cmd.Env = append(os.Environ(), "LOTL_SANDBOX_CHILD=1", "LOTL_DATA="+data, "LOTL_OUTSIDE="+outside)
	out, err := cmd.CombinedOutput()
	t.Logf("%s", out)
	if err != nil {
		t.Fatalf("child failed: %v", err)
	}
	for _, want := range []string{"seccomp=true", "unshare=EPERM", "exec=blocked", "datadir=ok", "ptrace=EPERM"} {
		if !strings.Contains(string(out), want) {
			t.Fatalf("missing %q", want)
		}
	}
	if LandlockABI() >= 1 && !strings.Contains(string(out), "outside=blocked") {
		t.Fatal("landlock should block writes outside the data dir")
	}
	if LandlockABI() >= 4 && !strings.Contains(string(out), "connect=blocked") {
		t.Fatal("landlock should block outbound TCP")
	}
}

func sandboxChild() {
	data, outside := os.Getenv("LOTL_DATA"), os.Getenv("LOTL_OUTSIDE")
	var extra []string
	if d := os.Getenv("GOCOVERDIR"); d != "" {
		extra = append(extra, d) // let coverage data out of the sandbox
	}
	rep, err := Apply(Options{DataDir: data, BindPort: 8080, Writable: extra, ReadOnly: []string{"/nonexistent-path"}, AllowConnect: []int{1}})
	if err != nil {
		fmt.Println("apply error:", err)
		os.Exit(2)
	}
	fmt.Printf("seccomp=%v landlock=%v abi=%d warnings=%v\n", rep.Seccomp, rep.LandlockFS, rep.LandlockABI, rep.Warnings)
	if err := unix.Unshare(unix.CLONE_NEWUSER); errors.Is(err, unix.EPERM) {
		fmt.Println("unshare=EPERM")
	}
	if _, _, e := syscall.Syscall(unix.SYS_PTRACE, unix.PTRACE_TRACEME, 0, 0); e == unix.EPERM {
		fmt.Println("ptrace=EPERM")
	}
	if err := exec.Command("/bin/true").Run(); err != nil {
		fmt.Println("exec=blocked")
	}
	if err := os.MkdirAll(filepath.Join(data, "saves", "u"), 0o700); err != nil {
		fmt.Println("mkdir failed:", err)
	}
	if err := os.WriteFile(filepath.Join(data, "saves", "u", "x"), []byte("ok"), 0o600); err == nil {
		fmt.Println("datadir=ok")
	}
	if err := os.WriteFile(outside, []byte("no"), 0o600); err != nil {
		fmt.Println("outside=blocked")
	}
	fd, err := unix.Socket(unix.AF_INET, unix.SOCK_STREAM, 0)
	if err == nil {
		err = unix.Connect(fd, &unix.SockaddrInet4{Port: 9, Addr: [4]byte{127, 0, 0, 1}})
		if errors.Is(err, unix.EACCES) || errors.Is(err, unix.EPERM) {
			fmt.Println("connect=blocked")
		}
	}
	os.Exit(0)
}
