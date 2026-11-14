// Package totp implements time-based one-time passwords (RFC 6238, SHA-1,
// 6 digits, 30 s steps) compatible with common authenticator apps.
package totp

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1" // #nosec G505 -- RFC 6238 default; HMAC-SHA1 is not broken
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const (
	// Step is the TOTP time step.
	Step = 30
	// Digits is the code length.
	Digits = 6
)

var enc = base32.StdEncoding.WithPadding(base32.NoPadding)

// NewSecret returns a random 160-bit base32 secret.
func NewSecret() string {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return enc.EncodeToString(b)
}

// Code computes the code for a time step.
func Code(secret string, step int64) (string, error) {
	key, err := enc.DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil || len(key) < 10 {
		return "", fmt.Errorf("invalid secret")
	}
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(step))
	m := hmac.New(sha1.New, key)
	m.Write(msg[:])
	sum := m.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	v := binary.BigEndian.Uint32(sum[off:off+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", v%1000000), nil
}

// Verify checks code against the steps around now (±1 for clock skew). It
// returns the matched step; callers must reject steps <= the last used one
// to prevent replay.
func Verify(secret, code string, now time.Time) (int64, bool) {
	code = strings.TrimSpace(code)
	if len(code) != Digits {
		return 0, false
	}
	cur := now.Unix() / Step
	for _, d := range []int64{0, -1, 1} {
		c, err := Code(secret, cur+d)
		if err != nil {
			return 0, false
		}
		if subtle.ConstantTimeCompare([]byte(c), []byte(code)) == 1 {
			return cur + d, true
		}
	}
	return 0, false
}

// URI returns an otpauth:// URI for authenticator apps.
func URI(issuer, account, secret string) string {
	label := url.PathEscape(issuer + ":" + account)
	q := url.Values{"secret": {secret}, "issuer": {issuer}, "algorithm": {"SHA1"}, "digits": {"6"}, "period": {"30"}}
	return "otpauth://totp/" + label + "?" + q.Encode()
}
