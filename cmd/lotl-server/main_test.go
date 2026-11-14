package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestParseFlags(t *testing.T) {
	o, err := parseFlags([]string{"-listen", "0.0.0.0:9000", "-port", "9123"})
	if err != nil || o.listen != "0.0.0.0:9123" {
		t.Fatalf("%v %v", o, err)
	}
	o, _ = parseFlags([]string{"-listen", "localhost", "-port", "81"})
	if o.listen != "localhost:81" {
		t.Fatal(o.listen)
	}
	if _, err := parseFlags([]string{"-port", "70000"}); err == nil {
		t.Fatal("bad port")
	}
	if _, err := parseFlags([]string{"-tls-cert", "x"}); err == nil {
		t.Fatal("cert without key")
	}
	if _, err := parseFlags([]string{"-nope"}); err == nil {
		t.Fatal("unknown flag")
	}
	t.Setenv("LOTL_PORT", "7777")
	t.Setenv("LOTL_LISTEN", "127.0.0.1:1")
	o, _ = parseFlags(nil)
	if o.listen != "127.0.0.1:7777" {
		t.Fatal("env", o.listen)
	}
	t.Setenv("LOTL_PORT", "")
	t.Setenv("LOTL_LISTEN", "")
	// YAML config file, overridden by flags
	f := filepath.Join(t.TempDir(), "lotl.yaml")
	os.WriteFile(f, []byte("server:\n  listen: \"0.0.0.0:7000\"\n  maxRooms: 9\naccounts:\n  registration: closed\n"), 0o600)
	o, err = parseFlags([]string{"-config", f, "-max-rooms", "11", "-trust-proxy", "-secure-cookies", "-allow-origin", "a.example,,b.example", "-no-sandbox", "-data", "/tmp/x", "-log-level", "debug"})
	if err != nil || o.listen != "0.0.0.0:7000" || o.maxRooms != 11 || o.cfg.Accounts.Registration != "closed" || !o.trustProxy || !o.noSandbox || o.origins != "a.example,b.example" {
		t.Fatalf("config+flags: %+v %v", o, err)
	}
	if _, err := parseFlags([]string{"-config", "/nonexistent.yaml"}); err == nil {
		t.Fatal("missing config")
	}
}

func TestRunServesAndShutsDown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	dir := t.TempDir()
	addrc := make(chan string, 1)
	done := make(chan error, 1)
	go func() {
		done <- run(ctx, []string{"-listen", "127.0.0.1:0", "-data", dir, "-no-sandbox", "-allow-origin", "a.example, ,b.example", "-log-level", "error"}, func(a string) { addrc <- a })
	}()
	var addr string
	select {
	case addr = <-addrc:
	case err := <-done:
		t.Fatal(err)
	case <-time.After(5 * time.Second):
		t.Fatal("server did not start")
	}
	resp, err := http.Get("http://" + addr + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if strings.TrimSpace(string(b)) != "ok" {
		t.Fatal("health")
	}
	resp, _ = http.Get("http://" + addr + "/")
	b, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(b), "Lords of the Lowlands") {
		t.Fatal("embedded client not served")
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestRunErrors(t *testing.T) {
	ctx := context.Background()
	if err := run(ctx, []string{"-log-level", "loud"}, nil); err == nil {
		t.Fatal("bad log level")
	}
	if err := run(ctx, []string{"-port", "-1"}, nil); err == nil {
		t.Fatal("bad port")
	}
	f := filepath.Join(t.TempDir(), "file")
	os.WriteFile(f, nil, 0o600)
	if err := run(ctx, []string{"-data", filepath.Join(f, "x"), "-no-sandbox"}, nil); err == nil {
		t.Fatal("bad data dir")
	}
	if err := run(ctx, []string{"-data", t.TempDir(), "-tls-cert", "/nonexistent", "-tls-key", "/nonexistent"}, nil); err == nil {
		t.Fatal("bad tls files")
	}
	// port already in use
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	defer l.Close()
	if err := run(ctx, []string{"-data", t.TempDir(), "-listen", l.Addr().String(), "-no-sandbox"}, nil); err == nil {
		t.Fatal("address in use")
	}
}

func TestSocketActivation(t *testing.T) {
	if os.Getenv("LOTL_SOCKET_CHILD") == "1" {
		os.Setenv("LISTEN_PID", strconv.Itoa(os.Getpid()))
		os.Setenv("LISTEN_FDS", "1")
		o, _ := parseFlags(nil)
		ln, err := listener(o)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(ln.Addr().String(), "127.0.0.1:") {
			t.Fatal(ln.Addr())
		}
		ln.Close()
		return
	}
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	f, _ := l.(*net.TCPListener).File()
	l.Close()
	cmd := exec.Command(os.Args[0], "-test.run=^TestSocketActivation$")
	cmd.Env = append(os.Environ(), "LOTL_SOCKET_CHILD=1")
	cmd.ExtraFiles = []*os.File{f} // becomes fd 3, as with systemd
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
}
