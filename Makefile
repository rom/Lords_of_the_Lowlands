# Lords of the Lowlands — build, test, coverage and fuzzing.
GO        ?= go
BIN       ?= bin/lotl-server
PORT      ?= 8080
FUZZTIME  ?= 30s
export CGO_ENABLED = 0

.PHONY: all build run test race cover cover-html fuzz vet fmt clean long

all: vet test build

build:
	$(GO) build -trimpath -ldflags="-s -w" -o $(BIN) ./cmd/lotl-server

run: build
	./$(BIN) -port $(PORT) -data ./data

vet:
	$(GO) vet ./...
	@test -z "$$(gofmt -l .)" || (echo "gofmt needed:"; gofmt -l .; exit 1)

fmt:
	gofmt -w .

test:
	$(GO) test ./...

race:
	CGO_ENABLED=1 $(GO) test -race ./internal/server/...

# Coverage over all packages; fails below 80 %.
cover:
	$(GO) test -coverpkg=./... -coverprofile=coverage.out ./...
	@$(GO) tool cover -func=coverage.out | tail -1
	@$(GO) tool cover -func=coverage.out | awk '/^total:/ { sub("%","",$$3); if ($$3+0 < 80) { print "coverage below 80%"; exit 1 } }'

cover-html: cover
	$(GO) tool cover -html=coverage.out -o coverage.html

FUZZ_TARGETS = \
	internal/server:FuzzParseClientMsg \
	internal/server:FuzzHTTPAPI \
	internal/game:FuzzLevelJSON \
	internal/game:FuzzApply \
	internal/game:FuzzFog \
	internal/game:FuzzCleanText \
	internal/game:FuzzLoadGame \
	internal/store:FuzzOpenCorruptFiles \
	internal/store:FuzzValidName

fuzz:
	@for t in $(FUZZ_TARGETS); do \
		pkg=$${t%%:*}; fn=$${t##*:}; \
		echo "== $$fn ($$pkg)"; \
		$(GO) test ./$$pkg -run='^$$' -fuzz="^$$fn$$" -fuzztime=$(FUZZTIME) || exit 1; \
	done

# hour-long AI vs AI matches across ages
long:
	LOTL_LONG=1 $(GO) test ./internal/game -run TestLongGames -v -timeout 30m

clean:
	rm -f $(BIN) coverage.out coverage.html
