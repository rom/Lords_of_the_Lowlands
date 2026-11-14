package totp

import (
	"strings"
	"testing"
	"time"
)

// RFC 6238 Appendix B test vector (SHA-1, secret "12345678901234567890").
func TestRFCVector(t *testing.T) {
	secret := enc.EncodeToString([]byte("12345678901234567890"))
	for ts, want := range map[int64]string{59: "287082", 1111111109: "081804", 1234567890: "005924", 2000000000: "279037"} {
		got, err := Code(secret, ts/Step)
		if err != nil || got != want {
			t.Fatalf("t=%d got %s want %s", ts, got, want)
		}
	}
}

func TestVerify(t *testing.T) {
	s := NewSecret()
	now := time.Unix(1700000000, 0)
	c, _ := Code(s, now.Unix()/Step)
	if st, ok := Verify(s, c, now); !ok || st != now.Unix()/Step {
		t.Fatal("verify current")
	}
	prev, _ := Code(s, now.Unix()/Step-1)
	if _, ok := Verify(s, prev, now); !ok {
		t.Fatal("skew -1")
	}
	old, _ := Code(s, now.Unix()/Step-3)
	if _, ok := Verify(s, old, now); ok {
		t.Fatal("old code accepted")
	}
	if _, ok := Verify(s, "12345", now); ok {
		t.Fatal("short code")
	}
	if _, ok := Verify("!!", "123456", now); ok {
		t.Fatal("bad secret")
	}
	if _, err := Code("AA", 1); err == nil {
		t.Fatal("short secret")
	}
	u := URI("Lords of the Lowlands", "alice", s)
	if !strings.HasPrefix(u, "otpauth://totp/") || !strings.Contains(u, "secret="+s) {
		t.Fatal(u)
	}
}
