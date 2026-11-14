// Command lotl-server runs the Lords of the Lowlands game back-end and
// serves the browser client.
package main

import (
	"context"
	"crypto/tls"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/rom/lords_of_the_lowlands/internal/config"
	"github.com/rom/lords_of_the_lowlands/internal/hardening"
	"github.com/rom/lords_of_the_lowlands/internal/server"
	"github.com/rom/lords_of_the_lowlands/internal/store"
	"github.com/rom/lords_of_the_lowlands/web"
)

type options struct {
	listen        string
	port          int
	dataDir       string
	tlsCert       string
	tlsKey        string
	secureCookies bool
	trustProxy    bool
	origins       string
	noSandbox     bool
	logLevel      string
	maxRooms      int
	cfg           *config.Config
}

// parseFlags reads the YAML configuration (-config or LOTL_CONFIG) and
// applies command-line flags and LOTL_* environment variables on top:
// flag > environment > config file > built-in default.
func parseFlags(args []string) (*options, error) {
	fs := flag.NewFlagSet("lotl-server", flag.ContinueOnError)
	o := &options{}
	cfgPath := fs.String("config", os.Getenv("LOTL_CONFIG"), "YAML configuration file")
	fs.StringVar(&o.listen, "listen", "", "listen address host:port")
	fs.IntVar(&o.port, "port", 0, "TCP port (overrides the port of -listen)")
	fs.StringVar(&o.dataDir, "data", "", "data directory (accounts, scores, levels, saves)")
	fs.StringVar(&o.tlsCert, "tls-cert", "", "TLS certificate file (enables HTTPS)")
	fs.StringVar(&o.tlsKey, "tls-key", "", "TLS private key file")
	fs.BoolVar(&o.secureCookies, "secure-cookies", false, "mark cookies Secure and send HSTS (implied by TLS)")
	fs.BoolVar(&o.trustProxy, "trust-proxy", false, "trust X-Forwarded-For from a reverse proxy")
	fs.StringVar(&o.origins, "allow-origin", "", "comma-separated extra allowed Origin hosts")
	fs.BoolVar(&o.noSandbox, "no-sandbox", false, "disable Landlock/seccomp/capability hardening (debug only)")
	fs.StringVar(&o.logLevel, "log-level", "", "log level: debug, info, warn, error")
	fs.IntVar(&o.maxRooms, "max-rooms", 0, "maximum concurrent rooms")
	if err := fs.Parse(args); err != nil {
		return nil, err
	}
	set := map[string]bool{}
	fs.Visit(func(f *flag.Flag) { set[f.Name] = true })
	cfg, err := config.Load(*cfgPath)
	if err != nil {
		return nil, err
	}
	sv := &cfg.Server
	str := func(flagName, env string, dst *string, from string) {
		switch {
		case set[flagName]:
			*dst = from
		case os.Getenv(env) != "":
			*dst = os.Getenv(env)
		}
	}
	str("listen", "LOTL_LISTEN", &sv.Listen, o.listen)
	str("data", "LOTL_DATA", &cfg.Data.Dir, o.dataDir)
	str("tls-cert", "LOTL_TLS_CERT", &sv.TLSCert, o.tlsCert)
	str("tls-key", "LOTL_TLS_KEY", &sv.TLSKey, o.tlsKey)
	str("log-level", "LOTL_LOG_LEVEL", &sv.LogLevel, o.logLevel)
	if set["port"] {
		sv.Port = o.port
	} else if v, err := strconv.Atoi(os.Getenv("LOTL_PORT")); err == nil {
		sv.Port = v
	}
	if set["secure-cookies"] {
		sv.SecureCookies = o.secureCookies
	}
	if set["trust-proxy"] {
		sv.TrustProxy = o.trustProxy
	}
	if set["allow-origin"] {
		sv.AllowedOrigins = nil
		for _, x := range strings.Split(o.origins, ",") {
			if x = strings.TrimSpace(x); x != "" {
				sv.AllowedOrigins = append(sv.AllowedOrigins, x)
			}
		}
	}
	if set["max-rooms"] {
		sv.MaxRooms = o.maxRooms
	}
	if set["no-sandbox"] {
		cfg.Security.Sandbox = !o.noSandbox
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	o.listen, o.port, o.dataDir, o.tlsCert, o.tlsKey = sv.Listen, sv.Port, cfg.Data.Dir, sv.TLSCert, sv.TLSKey
	o.secureCookies, o.trustProxy, o.noSandbox, o.logLevel, o.maxRooms = sv.SecureCookies, sv.TrustProxy, !cfg.Security.Sandbox, sv.LogLevel, sv.MaxRooms
	o.origins = strings.Join(sv.AllowedOrigins, ",")
	if o.port > 0 {
		host, _, err := net.SplitHostPort(o.listen)
		if err != nil {
			host = o.listen
		}
		o.listen = net.JoinHostPort(host, strconv.Itoa(o.port))
	}
	o.cfg = cfg
	return o, nil
}

// listener returns a systemd socket-activated listener if present,
// otherwise binds o.listen.
func listener(o *options) (net.Listener, error) {
	if os.Getenv("LISTEN_PID") == strconv.Itoa(os.Getpid()) && os.Getenv("LISTEN_FDS") == "1" {
		f := os.NewFile(3, "systemd-socket")
		l, err := net.FileListener(f)
		f.Close()
		return l, err
	}
	return net.Listen("tcp", o.listen)
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:], nil); err != nil {
		fmt.Fprintln(os.Stderr, "lotl-server:", err)
		os.Exit(1)
	}
}

// run starts the server and blocks until ctx is cancelled or serving fails.
// ready, if non-nil, is called with the bound address once listening.
func run(ctx context.Context, args []string, ready func(addr string)) error {
	o, err := parseFlags(args)
	if err != nil {
		return err
	}
	var lvl slog.Level
	if err := lvl.UnmarshalText([]byte(o.logLevel)); err != nil {
		return err
	}
	log := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: lvl}))
	dataDir, err := filepath.Abs(o.dataDir)
	if err != nil {
		return err
	}
	st, err := store.Open(dataDir)
	if err != nil {
		return err
	}
	var tlsCfg *tls.Config
	if o.tlsCert != "" {
		cert, err := tls.LoadX509KeyPair(o.tlsCert, o.tlsKey)
		if err != nil {
			return err
		}
		tlsCfg = &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{cert}}
		o.secureCookies = true
	}
	ln, err := listener(o)
	if err != nil {
		return err
	}
	port := 0
	if a, ok := ln.Addr().(*net.TCPAddr); ok {
		port = a.Port
	}
	if !o.noSandbox {
		rep, err := hardening.Apply(hardening.Options{DataDir: dataDir, BindPort: port})
		if err != nil {
			return fmt.Errorf("hardening: %w", err)
		}
		log.Info("sandbox", "noNewPrivs", rep.NoNewPrivs, "caps", rep.CapsDropped, "landlockABI", rep.LandlockABI,
			"landlockFS", rep.LandlockFS, "landlockNet", rep.LandlockNet, "seccomp", rep.Seccomp, "denied", rep.SeccompDenied,
			"warnings", strings.Join(rep.Warnings, "; "))
	} else {
		log.Warn("sandbox disabled")
	}
	var origins []string
	for _, x := range strings.Split(o.origins, ",") {
		if x = strings.TrimSpace(x); x != "" {
			origins = append(origins, x)
		}
	}
	srv, err := server.New(server.Config{Static: web.FS(), Store: st, Logger: log, SecureCookies: o.secureCookies,
		TrustProxy: o.trustProxy, AllowedOrigins: origins, MaxRooms: o.maxRooms, Settings: o.cfg})
	if err != nil {
		return err
	}
	hs := &http.Server{
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    16 << 10,
		TLSConfig:         tlsCfg,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelWarn),
	}
	errc := make(chan error, 1)
	if ready != nil {
		ready(ln.Addr().String())
	}
	go func() {
		log.Info("listening", "addr", ln.Addr().String(), "tls", tlsCfg != nil, "data", dataDir)
		if tlsCfg != nil {
			errc <- hs.ServeTLS(ln, "", "")
		} else {
			errc <- hs.Serve(ln)
		}
	}()
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("shutting down")
		srv.Hub().Shutdown()
		sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return hs.Shutdown(sctx)
	}
	return nil
}
