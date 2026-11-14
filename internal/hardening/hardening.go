// Package hardening confines the server process using Linux kernel
// security features: no_new_privs, capability dropping, non-dumpable
// process, resource limits, Landlock file-system and network rules, and a
// seccomp-BPF system-call filter.
//
// The functions must be called after the listening socket and all files
// that are needed only at start-up (TLS keys) have been opened. The binary
// must be built with CGO_ENABLED=0 so that the Go runtime can apply
// per-thread settings to all threads (syscall.AllThreadsSyscall).
package hardening

// Options select which protections are applied.
type Options struct {
	// DataDir is the only directory the process may write to.
	DataDir string
	// ReadOnly lists additional paths that may be read.
	ReadOnly []string
	// BindPort is the TCP port the server listens on (0 = none).
	BindPort int
	// AllowConnect lists TCP ports the process may connect to (usually
	// none: the game server never makes outbound connections).
	AllowConnect []int
	// Disable* switch individual layers off (for debugging).
	DisableLandlock bool
	DisableSeccomp  bool
	DisableCaps     bool
}

// Report describes what was applied.
type Report struct {
	NoNewPrivs     bool   `json:"noNewPrivs"`
	NonDumpable    bool   `json:"nonDumpable"`
	CapsDropped    bool   `json:"capsDropped"`
	LandlockABI    int    `json:"landlockABI"`
	LandlockFS     bool   `json:"landlockFS"`
	LandlockNet    bool   `json:"landlockNet"`
	LandlockScoped bool   `json:"landlockScoped"`
	Seccomp        bool   `json:"seccomp"`
	SeccompDenied  int    `json:"seccompDenied"`
	Warnings       []string `json:"warnings,omitempty"`
}
