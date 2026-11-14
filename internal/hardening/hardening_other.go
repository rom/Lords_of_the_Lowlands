//go:build !linux

package hardening

// Apply is a no-op on non-Linux systems.
func Apply(o Options) (*Report, error) {
	return &Report{Warnings: []string{"kernel hardening is only available on Linux"}}, nil
}
