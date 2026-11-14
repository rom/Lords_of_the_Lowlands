package server

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// bucket is a token bucket.
type bucket struct {
	tokens float64
	last   time.Time
}

// Limiter is a keyed token-bucket rate limiter.
type Limiter struct {
	mu      sync.Mutex
	rate    float64 // tokens per second
	burst   float64
	buckets map[string]*bucket
	now     func() time.Time
	lastGC  time.Time
}

// NewLimiter creates a limiter allowing rate events/second with burst.
func NewLimiter(rate, burst float64) *Limiter {
	return &Limiter{rate: rate, burst: burst, buckets: map[string]*bucket{}, now: time.Now}
}

// Allow consumes one token for key and reports whether it was available.
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if now.Sub(l.lastGC) > time.Minute {
		for k, b := range l.buckets {
			if now.Sub(b.last) > 10*time.Minute {
				delete(l.buckets, k)
			}
		}
		l.lastGC = now
	}
	b := l.buckets[key]
	if b == nil {
		if len(l.buckets) > 100000 { // bounded memory under attack
			return false
		}
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	}
	b.tokens += now.Sub(b.last).Seconds() * l.rate
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// clientIP returns the remote IP. X-Forwarded-For is honoured only when
// trustProxy is set (i.e. behind a reverse proxy on loopback).
func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
			for i := len(xf) - 1; i >= 0; i-- {
				if xf[i] == ',' {
					xf = xf[i+1:]
					break
				}
			}
			if ip := net.ParseIP(trimSpace(xf)); ip != nil {
				return ip.String()
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func trimSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}
