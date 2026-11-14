package game

import (
	"errors"
	"fmt"
	"math"
	"math/rand"
	"strings"
	"unicode/utf8"
)

// Terrain codes. Tiles are stored as the characters '0'..'6'.
const (
	TGrass    = 0
	TDirt     = 1
	TSand     = 2
	TWater    = 3 // impassable for ground units (void in space themes)
	TMountain = 4 // impassable
	TShallow  = 5 // passable ford
	TRoad     = 6 // paved / plating
	NumTerrain
)

// Themes change the look of terrain and resources.
var Themes = []string{"temperate", "desert", "winter", "tropical", "moon", "mars", "space"}

// Map types shape the terrain and adjust the technology tree.
const (
	MapInland    = "inland"
	MapCoastal   = "coastal"
	MapRiverland = "riverland"
	MapLakes     = "lakes"
	MapDesert    = "desert"
	MapHighland  = "highland"
)

// MapTypes lists the selectable map types.
var MapTypes = []string{MapInland, MapCoastal, MapRiverland, MapLakes, MapDesert, MapHighland}

// ValidMapType reports whether t names a map type ("" means inland).
func ValidMapType(t string) bool {
	for _, m := range MapTypes {
		if m == t {
			return true
		}
	}
	return t == ""
}

// Earthly reports whether a theme has seas that boats can sail.
func Earthly(theme string) bool { return theme != "moon" && theme != "mars" && theme != "space" }

// NavalMap reports whether docks, fishing and warships exist on a map type.
func NavalMap(mapType, theme string) bool {
	return Earthly(theme) && (mapType == MapCoastal || mapType == MapRiverland || mapType == MapLakes)
}

// forMapType returns generator parameters adjusted for a map type.
func (g *GenParams) forMapType(t string) *GenParams {
	c := *g
	switch t {
	case MapCoastal:
		c.Water = math.Min(c.Water, 0.25)
	case MapRiverland:
		c.River = true
		c.Water = math.Min(c.Water, 0.3)
	case MapLakes:
		c.Water = math.Max(c.Water, 0.6)
		c.River = false
	case MapDesert:
		c.Water, c.River = 0, false
		c.Forest *= 0.3
		c.Animals *= 0.4
		c.Riches = math.Min(1, c.Riches+0.4)
	case MapHighland:
		c.Mountains = math.Max(c.Mountains, 0.65)
		c.Water *= 0.4
		c.Riches = math.Min(1, c.Riches+0.3)
	}
	return &c
}

// Objective types.
const (
	ObjConquest = "conquest"
	ObjSurvive  = "survive"
	ObjAdvance  = "advance"
)

// Objective is the victory condition of a level.
type Objective struct {
	Type    string  `json:"type"`
	Minutes float64 `json:"minutes,omitempty"`
}

// Point is a tile coordinate.
type Point struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// Object is a map object placed in a level (resource or animal).
type Object struct {
	Kind string `json:"k"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
}

// GenParams parameterise the procedural map generator.
type GenParams struct {
	Seed      int64   `json:"seed"`
	Water     float64 `json:"water"`     // 0..1 lake coverage
	Mountains float64 `json:"mountains"` // 0..1
	Forest    float64 `json:"forest"`    // 0..1
	River     bool    `json:"river"`
	Animals   float64 `json:"animals"` // 0..1
	Riches    float64 `json:"riches"`  // 0..1 extra mines
}

// Level is either a built-in campaign level or a user-made level.
type Level struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Author      string     `json:"author,omitempty"`
	Theme       string     `json:"theme"`
	Width       int        `json:"width"`
	Height      int        `json:"height"`
	StartAge    int        `json:"startAge"`
	MaxAge      int        `json:"maxAge"`
	Objective   Objective  `json:"objective"`
	StartRes    Res        `json:"startRes"`
	Tiles       string     `json:"tiles,omitempty"`
	Objects     []Object   `json:"objects,omitempty"`
	Starts      []Point    `json:"starts,omitempty"`
	MaxPlayers  int        `json:"maxPlayers"`
	MapType     string     `json:"mapType,omitempty"`
	Opponents   int        `json:"opponents,omitempty"`
	Difficulty  string     `json:"difficulty,omitempty"`
	Gen         *GenParams `json:"gen,omitempty"`
}

// Limits for user-supplied levels.
const (
	MinMapSize    = 24
	MaxMapSize    = 128
	MaxObjects    = 6000
	MaxPlayers    = 8
	MaxNameLen    = 48
	MaxDescLen    = 600
	MaxLevelBytes = 512 * 1024
)

var objectKinds = map[string]bool{"fish": true, "tree": true, "berry": true, "gold": true, "stone": true, "crystal": true, "deer": true, "boar": true, "mammoth": true}

// ObjectKinds returns the valid object kinds for levels.
func ObjectKinds() []string {
	return []string{"tree", "berry", "gold", "stone", "crystal", "fish", "deer", "boar", "mammoth"}
}

func validTheme(t string) bool {
	for _, x := range Themes {
		if x == t {
			return true
		}
	}
	return false
}

// CleanText strips control characters and trims to max runes.
func CleanText(s string, max int) string {
	if !utf8.ValidString(s) {
		s = strings.ToValidUTF8(s, "")
	}
	var b strings.Builder
	n := 0
	for _, r := range s {
		if r < 0x20 || r == 0x7f || (r >= 0x80 && r < 0xa0) || r == 0x2028 || r == 0x2029 || (r >= 0x202a && r <= 0x202e) || (r >= 0x2066 && r <= 0x2069) {
			if r == '\n' && max > 100 {
				b.WriteRune(' ')
				n++
			}
			continue
		}
		if n >= max {
			break
		}
		b.WriteRune(r)
		n++
	}
	return strings.TrimSpace(b.String())
}

// Validate checks a level for structural soundness and normalises text.
// Levels that carry Gen parameters may omit tiles.
func (l *Level) Validate() error {
	l.Name = CleanText(l.Name, MaxNameLen)
	l.Description = CleanText(l.Description, MaxDescLen)
	l.Author = CleanText(l.Author, MaxNameLen)
	if l.Name == "" {
		return errors.New("level name required")
	}
	if l.Theme == "" {
		l.Theme = "temperate"
	}
	if !validTheme(l.Theme) {
		return fmt.Errorf("unknown theme %q", l.Theme)
	}
	if l.Width < MinMapSize || l.Width > MaxMapSize || l.Height < MinMapSize || l.Height > MaxMapSize {
		return fmt.Errorf("map size must be between %d and %d", MinMapSize, MaxMapSize)
	}
	if l.StartAge < 0 || l.StartAge > MaxAge || l.MaxAge < l.StartAge || l.MaxAge > MaxAge {
		return errors.New("invalid age range")
	}
	switch l.Objective.Type {
	case "", ObjConquest:
		l.Objective.Type = ObjConquest
	case ObjSurvive:
		if l.Objective.Minutes < 1 || l.Objective.Minutes > 120 {
			return errors.New("survive objective needs 1..120 minutes")
		}
	case ObjAdvance:
		if l.MaxAge == l.StartAge {
			return errors.New("advance objective needs maxAge > startAge")
		}
	default:
		return fmt.Errorf("unknown objective %q", l.Objective.Type)
	}
	for i, v := range l.StartRes {
		if v < 0 || v > 100000 || math.IsNaN(v) {
			return fmt.Errorf("invalid start resource %d", i)
		}
	}
	if !ValidMapType(l.MapType) {
		return fmt.Errorf("unknown map type %q", l.MapType)
	}
	if l.MapType == "" {
		l.MapType = MapInland
	}
	if l.Difficulty == "" {
		l.Difficulty = "normal"
	}
	if !ValidDifficulty(l.Difficulty) {
		return errors.New("invalid difficulty")
	}
	if l.Gen != nil && l.Tiles == "" {
		if l.MaxPlayers < 2 || l.MaxPlayers > MaxPlayers {
			return errors.New("maxPlayers must be 2..8")
		}
		return nil
	}
	if len(l.Tiles) != l.Width*l.Height {
		return errors.New("tiles length does not match dimensions")
	}
	for i := 0; i < len(l.Tiles); i++ {
		c := l.Tiles[i]
		if c < '0' || c >= '0'+NumTerrain {
			return fmt.Errorf("invalid tile at %d", i)
		}
	}
	if len(l.Objects) > MaxObjects {
		return errors.New("too many objects")
	}
	for _, o := range l.Objects {
		if !objectKinds[o.Kind] {
			return fmt.Errorf("unknown object kind %q", o.Kind)
		}
		if o.X < 0 || o.Y < 0 || o.X >= l.Width || o.Y >= l.Height {
			return errors.New("object out of bounds")
		}
	}
	if len(l.Starts) < 2 || len(l.Starts) > MaxPlayers {
		return errors.New("level needs 2..8 start positions")
	}
	for _, s := range l.Starts {
		if s.X < 2 || s.Y < 2 || s.X >= l.Width-2 || s.Y >= l.Height-2 {
			return errors.New("start position too close to edge")
		}
		if !Passable(int(l.Tiles[s.Y*l.Width+s.X] - '0')) {
			return errors.New("start position on impassable terrain")
		}
	}
	l.MaxPlayers = len(l.Starts)
	if l.Opponents < 0 || l.Opponents >= l.MaxPlayers {
		l.Opponents = l.MaxPlayers - 1
	}
	return nil
}

// Passable reports whether ground units can walk on terrain t.
func Passable(t int) bool { return t != TWater && t != TMountain }

// Materialize returns a copy of the level with tiles, objects and starts
// generated if the level only carries generator parameters.
func (l *Level) Materialize(players int) *Level {
	out := *l
	if out.Tiles != "" {
		out.Objects = append([]Object(nil), l.Objects...)
		out.Starts = append([]Point(nil), l.Starts...)
		return &out
	}
	g := l.Gen
	if g == nil {
		g = &GenParams{Seed: 1, Forest: 0.5, Animals: 0.5}
	}
	if players < 2 {
		players = 2
	}
	if players > l.MaxPlayers && l.MaxPlayers >= 2 {
		players = l.MaxPlayers
	}
	tiles, objs, starts := generate(l.Width, l.Height, players, g, l.Theme, l.MapType, l.StartAge)
	out.Tiles = tiles
	out.Objects = objs
	out.Starts = starts
	return &out
}

// value noise -------------------------------------------------------------

type noise struct {
	perm [512]int
	grad [256]float64
}

func newNoise(r *rand.Rand) *noise {
	n := &noise{}
	p := r.Perm(256)
	for i := 0; i < 512; i++ {
		n.perm[i] = p[i&255]
	}
	for i := range n.grad {
		n.grad[i] = r.Float64()
	}
	return n
}

func smooth(t float64) float64 { return t * t * (3 - 2*t) }

func (n *noise) at(x, y float64) float64 {
	xi, yi := int(math.Floor(x)), int(math.Floor(y))
	xf, yf := x-float64(xi), y-float64(yi)
	h := func(i, j int) float64 { return n.grad[n.perm[(n.perm[i&255]+j)&255]] }
	a, b := h(xi, yi), h(xi+1, yi)
	c, d := h(xi, yi+1), h(xi+1, yi+1)
	u, v := smooth(xf), smooth(yf)
	return a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v
}

func (n *noise) fbm(x, y float64, oct int) float64 {
	s, amp, f, norm := 0.0, 1.0, 1.0, 0.0
	for i := 0; i < oct; i++ {
		s += amp * n.at(x*f, y*f)
		norm += amp
		amp *= 0.5
		f *= 2
	}
	return s / norm
}

// generate builds a map. It is deterministic for a given seed.
func generate(w, h, players int, gp *GenParams, theme, mapType string, age int) (string, []Object, []Point) {
	g := gp.forMapType(mapType)
	r := rand.New(rand.NewSource(g.Seed))
	nz := newNoise(r)
	nz2 := newNoise(r)
	t := make([]byte, w*h)
	// start positions on a ring
	starts := make([]Point, players)
	cx, cy := float64(w)/2, float64(h)/2
	rad := math.Min(cx, cy) * 0.68
	off := r.Float64() * math.Pi * 2
	// coastal maps: an ocean along one side, the ring shifted inland
	oceanA := off + math.Pi/4
	if mapType == MapCoastal {
		cx -= math.Cos(oceanA) * float64(w) * 0.17
		cy -= math.Sin(oceanA) * float64(h) * 0.17
		rad = math.Min(float64(w), float64(h)) * 0.25
	}
	for i := range starts {
		a := off + float64(i)*2*math.Pi/float64(players)
		starts[i] = Point{int(cx + math.Cos(a)*rad), int(cy + math.Sin(a)*rad)}
	}
	distStart := func(x, y int) float64 {
		best := 1e9
		for _, s := range starts {
			d := math.Hypot(float64(x-s.X), float64(y-s.Y))
			if d < best {
				best = d
			}
		}
		return best
	}
	half := math.Min(float64(w), float64(h)) / 2
	mcx, mcy := float64(w)/2, float64(h)/2
	waterLvl := 1 - g.Water*0.45
	mtnLvl := 1 - g.Mountains*0.35
	riverA := r.Float64() * math.Pi
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			fx, fy := float64(x)/12, float64(y)/12
			e := nz.fbm(fx, fy, 4)
			m := nz2.fbm(fx*1.3+40, fy*1.3+40, 3)
			d := distStart(x, y)
			tt := byte(TGrass)
			if m > 0.62 {
				tt = TDirt
			}
			if e > waterLvl && d > 9 {
				tt = TWater
			} else if e > waterLvl-0.05 && d > 7 {
				tt = TSand
			}
			if m > mtnLvl && d > 10 && tt != TWater {
				tt = TMountain
			}
			if mapType == MapCoastal {
				proj := ((float64(x)-mcx)*math.Cos(oceanA)+(float64(y)-mcy)*math.Sin(oceanA))/half + (nz2.at(fx*1.5, fy*1.5)-0.5)*0.35
				if proj > 0.5 && d > 8 {
					tt = TWater
				} else if proj > 0.42 && d > 6 && tt != TWater {
					tt = TSand
				}
			}
			if mapType == MapDesert && tt == TGrass && m < 0.55 {
				tt = TSand
			}
			if g.River {
				// river through the centre, perpendicular to riverA
				px, py := float64(x)-cx, float64(y)-cy
				dist := math.Abs(px*math.Cos(riverA)+py*math.Sin(riverA)) + (nz.at(fx*2, fy*2)-0.5)*4
				if dist < 1.6 && d > 6 {
					tt = TWater
				} else if dist < 2.8 && d > 6 && tt != TMountain {
					tt = TSand
				}
			}
			t[y*w+x] = tt
		}
	}
	// connect every start to the next with a passable road/ford
	for i := range starts {
		a, b := starts[i], starts[(i+1)%len(starts)]
		carve(t, w, h, a, b, r)
		carve(t, w, h, a, Point{int(cx), int(cy)}, r)
	}
	// clear around starts
	for _, s := range starts {
		for y := s.Y - 6; y <= s.Y+6; y++ {
			for x := s.X - 6; x <= s.X+6; x++ {
				if x >= 0 && y >= 0 && x < w && y < h && math.Hypot(float64(x-s.X), float64(y-s.Y)) < 6.5 {
					if v := t[y*w+x]; v == TWater || v == TMountain {
						t[y*w+x] = TGrass
					}
				}
			}
		}
	}
	occ := make([]bool, w*h)
	var objs []Object
	put := func(k string, x, y int) bool {
		if x < 1 || y < 1 || x >= w-1 || y >= h-1 || occ[y*w+x] || !Passable(int(t[y*w+x])) || t[y*w+x] == TShallow || t[y*w+x] == TRoad {
			return false
		}
		occ[y*w+x] = true
		objs = append(objs, Object{k, x, y})
		return true
	}
	// reserve town-centre area
	for _, s := range starts {
		for y := s.Y - 3; y <= s.Y+3; y++ {
			for x := s.X - 3; x <= s.X+3; x++ {
				if x >= 0 && y >= 0 && x < w && y < h {
					occ[y*w+x] = true
				}
			}
		}
	}
	space := theme == "space" || theme == "moon" || theme == "mars"
	// forests
	fn := newNoise(r)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			v := fn.fbm(float64(x)/7, float64(y)/7, 3)
			if v > 0.70-g.Forest*0.2 && distStart(x, y) > 7 && r.Float64() < 0.85 {
				put("tree", x, y)
			} else if r.Float64() < 0.004*g.Forest {
				put("tree", x, y)
			}
		}
	}
	cluster := func(k string, cx, cy, n int) {
		placed := 0
		for tries := 0; placed < n && tries < n*20; tries++ {
			x := cx + r.Intn(5) - 2
			y := cy + r.Intn(5) - 2
			if put(k, x, y) {
				placed++
			}
		}
	}
	ring := func(s Point, rmin, rmax float64) (int, int) {
		a := r.Float64() * 2 * math.Pi
		d := rmin + r.Float64()*(rmax-rmin)
		return s.X + int(math.Cos(a)*d), s.Y + int(math.Sin(a)*d)
	}
	for _, s := range starts {
		// personal resources near each start – identical counts for fairness
		x, y := ring(s, 5, 7)
		cluster("berry", x, y, 6)
		x, y = ring(s, 7, 10)
		cluster("gold", x, y, 4)
		x, y = ring(s, 7, 10)
		cluster("stone", x, y, 4)
		for i := 0; i < 3; i++ {
			x, y = ring(s, 6, 10)
			cluster("tree", x, y, 8)
		}
		if age >= 10 || space {
			x, y = ring(s, 8, 11)
			cluster("crystal", x, y, 3)
		}
		if !space {
			n := int(2 + g.Animals*4)
			for i := 0; i < n; i++ {
				x, y = ring(s, 6, 12)
				put("deer", x, y)
			}
			x, y = ring(s, 10, 14)
			if age <= 1 {
				put("mammoth", x, y)
			} else {
				put("boar", x, y)
			}
		}
	}
	extra := int(float64(w*h) / 900 * (0.5 + g.Riches))
	for i := 0; i < extra; i++ {
		x, y := 2+r.Intn(w-4), 2+r.Intn(h-4)
		if distStart(x, y) < 14 {
			continue
		}
		switch i % 4 {
		case 0:
			cluster("gold", x, y, 4)
		case 1:
			cluster("stone", x, y, 4)
		case 2:
			if age >= 10 || space {
				cluster("crystal", x, y, 3)
			} else {
				cluster("berry", x, y, 5)
			}
		case 3:
			if !space {
				for j := 0; j < 3; j++ {
					put([]string{"deer", "deer", "boar"}[j], x+j, y)
				}
			}
		}
	}
	if mapType == MapDesert && !space {
		// a few oases with palms
		for i := 0; i < 2+w*h/2500; i++ {
			ox, oy := 4+r.Intn(w-8), 4+r.Intn(h-8)
			if distStart(ox, oy) < 12 {
				continue
			}
			for y := oy - 2; y <= oy+2; y++ {
				for x := ox - 2; x <= ox+2; x++ {
					if d := math.Hypot(float64(x-ox), float64(y-oy)); d < 1.6 && !occ[y*w+x] {
						t[y*w+x] = TWater
					} else if d < 2.6 && !occ[y*w+x] {
						t[y*w+x] = TGrass
					}
				}
			}
			cluster("tree", ox+2, oy+2, 3)
		}
	}
	if NavalMap(mapType, theme) {
		objs = append(objs, placeFish(t, w, h, starts, occ, r)...)
	}
	return string(mapBytesToChars(t)), objs, starts
}

// placeFish scatters schools of fish in shallow water near shores and makes
// sure every start has fish within reach of a dock.
func placeFish(t []byte, w, h int, starts []Point, occ []bool, r *rand.Rand) []Object {
	shore := shoreDistance(t, w, h)
	var out []Object
	add := func(x, y int) {
		if x < 1 || y < 1 || x >= w-1 || y >= h-1 || occ[y*w+x] || t[y*w+x] != TWater {
			return
		}
		occ[y*w+x] = true
		out = append(out, Object{"fish", x, y})
	}
	for y := 1; y < h-1; y++ {
		for x := 1; x < w-1; x++ {
			if d := shore[y*w+x]; d >= 2 && d <= 4 && r.Float64() < 0.025 {
				add(x, y)
			}
		}
	}
	for _, s := range starts {
		best, bd := -1, 1e9
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				if t[y*w+x] == TWater && shore[y*w+x] >= 2 {
					if d := math.Hypot(float64(x-s.X), float64(y-s.Y)); d < bd {
						bd, best = d, y*w+x
					}
				}
			}
		}
		if best >= 0 && bd < 22 {
			bx, by := best%w, best/w
			for i := 0; i < 8; i++ {
				add(bx+r.Intn(5)-2, by+r.Intn(5)-2)
			}
		}
	}
	return out
}

// shoreDistance returns, for every tile, the 4-neighbour distance to land.
func shoreDistance(t []byte, w, h int) []int {
	d := make([]int, w*h)
	var q []int
	for i, v := range t {
		if v != TWater {
			q = append(q, i)
		} else {
			d[i] = 1 << 20
		}
	}
	for k := 0; k < len(q); k++ {
		i := q[k]
		x, y := i%w, i/w
		for _, n := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			nx, ny := x+n[0], y+n[1]
			if nx < 0 || ny < 0 || nx >= w || ny >= h {
				continue
			}
			j := ny*w + nx
			if d[j] > d[i]+1 {
				d[j] = d[i] + 1
				q = append(q, j)
			}
		}
	}
	return d
}

func mapBytesToChars(t []byte) []byte {
	out := make([]byte, len(t))
	for i, v := range t {
		out[i] = '0' + v
	}
	return out
}

// carve a wiggly passable path from a to b.
func carve(t []byte, w, h int, a, b Point, r *rand.Rand) {
	x, y := float64(a.X), float64(a.Y)
	for i := 0; i < w*h; i++ {
		dx, dy := float64(b.X)-x, float64(b.Y)-y
		d := math.Hypot(dx, dy)
		if d < 1 {
			break
		}
		x += dx/d + (r.Float64()-0.5)*0.6
		y += dy/d + (r.Float64()-0.5)*0.6
		for oy := -1; oy <= 1; oy++ {
			for ox := -1; ox <= 1; ox++ {
				ix, iy := int(x)+ox, int(y)+oy
				if ix < 0 || iy < 0 || ix >= w || iy >= h {
					continue
				}
				switch t[iy*w+ix] {
				case TWater:
					t[iy*w+ix] = TShallow
				case TMountain:
					t[iy*w+ix] = TDirt
				}
			}
		}
	}
}
