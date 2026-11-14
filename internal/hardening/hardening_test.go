package hardening

import "testing"

func TestReportZero(t *testing.T) {
	var r Report
	if r.Seccomp || r.NoNewPrivs || len(r.Warnings) != 0 {
		t.Fatal("zero report")
	}
}
