//go:build linux && !amd64 && !arm64

package hardening

// Unsupported architecture: BuildFilter refuses (nativeArch == 0).
const nativeArch = 0

const x32Bit = 0

var archDenied []uintptr
