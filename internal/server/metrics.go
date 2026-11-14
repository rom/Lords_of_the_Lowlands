package server

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Version is reported by the health endpoint (set by the linker or main).
var Version = "dev"

// Metrics collects counters and latency histograms for diagnostics.
type Metrics struct {
	httpRequests atomic.Int64
	httpErrors   atomic.Int64
	wsIn         atomic.Int64
	wsOut        atomic.Int64
	wsBytesOut   atomic.Int64
	wsDropped    atomic.Int64
	snapshots    atomic.Int64
	commands     atomic.Int64
	cmdRejected  atomic.Int64
	loginOK      atomic.Int64
	loginFail    atomic.Int64
	gamesStarted atomic.Int64
	gamesEnded   atomic.Int64
	cheatFlags   atomic.Int64
	cheatKicks   atomic.Int64
	saves        atomic.Int64
	restores     atomic.Int64

	mu    sync.Mutex
	ticks latency // simulation step + snapshot fan-out per room tick
	reqs  latency // HTTP request latency
}

// latency is a fixed-bucket histogram in seconds plus a ring of recent
// samples for percentiles.
type latency struct {
	buckets [11]int64 // len(latBounds)+1
	count   int64
	sum     float64
	max     float64
	ring    [1024]float64
	n       int
}

var latBounds = []float64{0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 1}

func newMetrics() *Metrics { return &Metrics{} }

func (l *latency) observe(sec float64) {
	i := sort.SearchFloat64s(latBounds, sec)
	l.buckets[i]++
	l.count++
	l.sum += sec
	if sec > l.max {
		l.max = sec
	}
	l.ring[l.n%len(l.ring)] = sec
	l.n++
}

func (l *latency) pct(p float64) float64 {
	n := l.n
	if n > len(l.ring) {
		n = len(l.ring)
	}
	if n == 0 {
		return 0
	}
	v := append([]float64(nil), l.ring[:n]...)
	sort.Float64s(v)
	return v[int(p*float64(n-1))]
}

// ObserveTick records one room tick duration.
func (m *Metrics) ObserveTick(d time.Duration) {
	m.mu.Lock()
	m.ticks.observe(d.Seconds())
	m.mu.Unlock()
}

func (m *Metrics) observeReq(d time.Duration) {
	m.mu.Lock()
	m.reqs.observe(d.Seconds())
	m.mu.Unlock()
}

// statusWriter captures the response code.
type statusWriter struct {
	http.ResponseWriter
	code int
}

func (w *statusWriter) WriteHeader(c int) { w.code = c; w.ResponseWriter.WriteHeader(c) }

// Unwrap lets http.ResponseController and the WebSocket upgrade reach the
// underlying writer (Hijacker, Flusher).
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (s *Server) instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ws" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, code: 200}
		next.ServeHTTP(sw, r)
		s.metrics.httpRequests.Add(1)
		if sw.code >= 500 {
			s.metrics.httpErrors.Add(1)
		}
		s.metrics.observeReq(time.Since(start))
	})
}

// diagAllowed decides who may read statistics and metrics: a bearer token
// when configured, administrators, everyone when metrics.public is set, and
// otherwise only loopback clients.
func (s *Server) diagAllowed(r *http.Request) bool {
	if tok := s.set.Metrics.Token; tok != "" {
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if subtle.ConstantTimeCompare([]byte(got), []byte(tok)) == 1 {
			return true
		}
	} else if s.set.Metrics.Public {
		return true
	}
	if ss, _ := s.sessionFor(r); ss != nil && ss.Admin {
		return true
	}
	if s.set.Metrics.Token == "" {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err == nil {
			if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
				return true
			}
		}
	}
	return false
}

// handleReady checks that the data directory is writable.
func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	dir := s.cfg.Store.Dir()
	f, err := os.CreateTemp(dir, ".ready*")
	if err != nil {
		http.Error(w, "data directory not writable", http.StatusServiceUnavailable)
		return
	}
	name := f.Name()
	f.Close()
	os.Remove(name)
	w.Write([]byte("ready\n"))
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "ok", "version": Version,
		"uptimeSeconds": int64(time.Since(s.started).Seconds()), "time": time.Now().UTC()})
}

// Stats is the JSON statistics document.
type Stats struct {
	Version       string             `json:"version"`
	UptimeSeconds int64              `json:"uptimeSeconds"`
	Users         int                `json:"users"`
	Online        int                `json:"online"`
	Sessions      int                `json:"sessions"`
	Rooms         map[string]int     `json:"rooms"`
	Players       int                `json:"playersInGames"`
	Counters      map[string]int64   `json:"counters"`
	Tick          map[string]float64 `json:"tickSeconds"`
	HTTP          map[string]float64 `json:"httpSeconds"`
	Runtime       map[string]uint64  `json:"runtime"`
}

func (s *Server) collect() Stats {
	m := s.metrics
	st := Stats{Version: Version, UptimeSeconds: int64(time.Since(s.started).Seconds()), Users: len(s.cfg.Store.ListUsers()),
		Online: len(s.hub.onlineNames()), Rooms: map[string]int{}}
	s.mu.Lock()
	st.Sessions = len(s.sessions)
	s.mu.Unlock()
	s.hub.mu.Lock()
	for _, r := range s.hub.rooms {
		r.mu.Lock()
		k := r.State
		if r.Demo {
			k = "demo"
		}
		st.Rooms[k]++
		if r.State == StatePlaying {
			for _, sl := range r.Slots {
				if sl.client != nil {
					st.Players++
				}
			}
		}
		r.mu.Unlock()
	}
	s.hub.mu.Unlock()
	st.Counters = map[string]int64{
		"http_requests": m.httpRequests.Load(), "http_errors": m.httpErrors.Load(), "ws_messages_in": m.wsIn.Load(),
		"ws_messages_out": m.wsOut.Load(), "ws_bytes_out": m.wsBytesOut.Load(), "ws_dropped": m.wsDropped.Load(),
		"snapshots": m.snapshots.Load(), "commands": m.commands.Load(), "commands_rejected": m.cmdRejected.Load(),
		"logins_ok": m.loginOK.Load(), "logins_failed": m.loginFail.Load(), "games_started": m.gamesStarted.Load(),
		"games_ended": m.gamesEnded.Load(), "cheat_flags": m.cheatFlags.Load(), "cheat_kicks": m.cheatKicks.Load(),
		"games_saved": m.saves.Load(), "games_restored": m.restores.Load(),
	}
	m.mu.Lock()
	st.Tick = map[string]float64{"count": float64(m.ticks.count), "p50": m.ticks.pct(0.5), "p95": m.ticks.pct(0.95), "p99": m.ticks.pct(0.99), "max": m.ticks.max}
	st.HTTP = map[string]float64{"count": float64(m.reqs.count), "p50": m.reqs.pct(0.5), "p95": m.reqs.pct(0.95), "max": m.reqs.max}
	m.mu.Unlock()
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	st.Runtime = map[string]uint64{"goroutines": uint64(runtime.NumGoroutine()), "heap_alloc_bytes": ms.HeapAlloc,
		"heap_sys_bytes": ms.HeapSys, "gc_cycles": uint64(ms.NumGC), "gc_pause_total_ns": ms.PauseTotalNs}
	return st
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	if !s.diagAllowed(r) {
		writeErr(w, http.StatusForbidden, "statistics require the metrics token or an administrator")
		return
	}
	writeJSON(w, http.StatusOK, s.collect())
}

// handleMetrics exposes the Prometheus text format.
func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	if !s.diagAllowed(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	st := s.collect()
	var b strings.Builder
	gauge := func(name, help string, v float64, labels string) {
		fmt.Fprintf(&b, "# HELP lotl_%s %s\n# TYPE lotl_%s gauge\nlotl_%s%s %g\n", name, help, name, name, labels, v)
	}
	gauge("uptime_seconds", "Seconds since start.", float64(st.UptimeSeconds), "")
	gauge("users", "Registered accounts.", float64(st.Users), "")
	gauge("online", "Connected players.", float64(st.Online), "")
	gauge("sessions", "Active sessions.", float64(st.Sessions), "")
	gauge("players_in_games", "Connected players in running games.", float64(st.Players), "")
	keys := make([]string, 0, len(st.Rooms))
	for k := range st.Rooms {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	fmt.Fprintf(&b, "# HELP lotl_rooms Rooms by state.\n# TYPE lotl_rooms gauge\n")
	for _, k := range keys {
		fmt.Fprintf(&b, "lotl_rooms{state=%q} %d\n", k, st.Rooms[k])
	}
	ckeys := make([]string, 0, len(st.Counters))
	for k := range st.Counters {
		ckeys = append(ckeys, k)
	}
	sort.Strings(ckeys)
	for _, k := range ckeys {
		fmt.Fprintf(&b, "# TYPE lotl_%s_total counter\nlotl_%s_total %d\n", k, k, st.Counters[k])
	}
	s.metrics.mu.Lock()
	writeHist(&b, "tick_duration_seconds", "Simulation tick plus snapshot fan-out.", &s.metrics.ticks)
	writeHist(&b, "http_request_duration_seconds", "HTTP request latency.", &s.metrics.reqs)
	s.metrics.mu.Unlock()
	for _, k := range []string{"goroutines", "heap_alloc_bytes", "heap_sys_bytes", "gc_cycles"} {
		gauge("go_"+k, "Go runtime "+k+".", float64(st.Runtime[k]), "")
	}
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.Write([]byte(b.String()))
}

func writeHist(b *strings.Builder, name, help string, l *latency) {
	fmt.Fprintf(b, "# HELP lotl_%s %s\n# TYPE lotl_%s histogram\n", name, help, name)
	var cum int64
	for i, ub := range latBounds {
		cum += l.buckets[i]
		fmt.Fprintf(b, "lotl_%s_bucket{le=\"%g\"} %d\n", name, ub, cum)
	}
	cum += l.buckets[len(latBounds)]
	fmt.Fprintf(b, "lotl_%s_bucket{le=\"+Inf\"} %d\nlotl_%s_sum %g\nlotl_%s_count %d\n", name, cum, name, l.sum, name, l.count)
}

// hashStatic computes SHA-256 digests of the client's JavaScript modules
// for the anti-cheat integrity check.
func hashStatic(fsys fs.FS) map[string]string {
	out := map[string]string{}
	_ = fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || filepath.Ext(p) != ".js" {
			return nil
		}
		b, err := fs.ReadFile(fsys, p)
		if err == nil {
			sum := sha256.Sum256(b)
			out["/"+p] = hex.EncodeToString(sum[:])
		}
		return nil
	})
	return out
}
