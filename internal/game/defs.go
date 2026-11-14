// Package game implements the authoritative, deterministic simulation of
// Lords of the Lowlands: ages, units, buildings, technologies, economy,
// combat, pathfinding, fog of war and the computer opponent.
package game

import (
	"fmt"
	"math"
	"sort"
)

// Resource indices.
const (
	Food = iota
	Wood
	Stone
	Gold
	Energy
	NumRes
)

// ResNames are the display names of the five resources.
var ResNames = [NumRes]string{"Food", "Wood", "Stone", "Gold", "Energy"}

// Res is an amount of each resource.
type Res [NumRes]float64

// Add returns r+o.
func (r Res) Add(o Res) Res {
	for i := range r {
		r[i] += o[i]
	}
	return r
}

// Sub returns r-o.
func (r Res) Sub(o Res) Res {
	for i := range r {
		r[i] -= o[i]
	}
	return r
}

// Covers reports whether r has at least o of every resource.
func (r Res) Covers(o Res) bool {
	for i := range r {
		if r[i]+1e-9 < o[i] {
			return false
		}
	}
	return true
}

// Scale multiplies every component by f and rounds to whole units.
func (r Res) Scale(f float64) Res {
	for i := range r {
		r[i] = math.Round(r[i] * f)
	}
	return r
}

// Total sums all resources.
func (r Res) Total() float64 {
	t := 0.0
	for _, v := range r {
		t += v
	}
	return t
}

// Age describes one historical (or future) age.
type Age struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Era         string  `json:"era"`
	Years       string  `json:"years"`
	Desc        string  `json:"desc"`
	AdvanceCost Res     `json:"advanceCost"`
	AdvanceTime float64 `json:"advanceTime"`
}

// Eras group ages that share a visual style.
const (
	EraStone      = "stone"
	EraBronze     = "bronze"
	EraIron       = "iron"
	EraClassical  = "classical"
	EraMedieval   = "medieval"
	EraGunpowder  = "gunpowder"
	EraIndustrial = "industrial"
	EraModern     = "modern"
	EraFuture     = "future"
	EraSpace      = "space"
)

// Ages lists all 17 ages from the Dawn to the Interstellar Age.
var Ages = []Age{
	{0, "Dawn Age", EraStone, "c. 300,000 BC", "Bands of hunter-gatherers with fire, flint and the club.", Res{}, 0},
	{1, "Neolithic Age", EraStone, "c. 10,000 BC", "Farming, polished stone and the first villages.", Res{500, 0, 0, 0, 0}, 40},
	{2, "Copper Age", EraBronze, "c. 4,500 BC", "Smelted copper, the bow and the first chiefdoms.", Res{800, 200, 0, 0, 0}, 50},
	{3, "Bronze Age", EraBronze, "c. 3,000 BC", "Bronze weapons, chariots, writing and city walls.", Res{1000, 300, 150, 100, 0}, 60},
	{4, "Iron Age", EraIron, "c. 1,200 BC", "Iron tools, mounted warriors and siege engines.", Res{1200, 400, 200, 200, 0}, 60},
	{5, "Classical Age", EraClassical, "c. 500 BC", "Phalanx and legion, philosophy and aqueducts.", Res{1400, 500, 300, 300, 0}, 65},
	{6, "Early Middle Ages", EraMedieval, "c. 500 AD", "Chainmail, crossbows and fortified manors.", Res{1600, 600, 350, 400, 0}, 70},
	{7, "High Middle Ages", EraMedieval, "c. 1,100 AD", "Knights, castles, longbows and trebuchets.", Res{1800, 700, 400, 500, 0}, 70},
	{8, "Renaissance", EraGunpowder, "c. 1,450 AD", "Gunpowder, printing press and pike squares.", Res{2000, 800, 450, 600, 0}, 75},
	{9, "Imperial Age", EraGunpowder, "c. 1,650 AD", "Muskets, field cannon and global empires.", Res{2200, 900, 500, 700, 0}, 75},
	{10, "Industrial Age", EraIndustrial, "c. 1,820 AD", "Steam, coal, rifles and railways. Energy matters.", Res{2400, 1000, 500, 800, 0}, 80},
	{11, "Machine Age", EraIndustrial, "c. 1,914 AD", "Machine guns, tanks and mechanised war.", Res{2600, 1000, 600, 900, 300}, 80},
	{12, "Atomic Age", EraModern, "c. 1,945 AD", "Jet engines, rockets and the atom.", Res{2800, 1100, 600, 1000, 500}, 85},
	{13, "Information Age", EraModern, "c. 1,990 AD", "Networks, precision weapons and satellites.", Res{3000, 1100, 700, 1100, 700}, 85},
	{14, "Orbital Age", EraFuture, "c. 2,080 AD", "Space elevators, exo-suits and railguns.", Res{3200, 1200, 700, 1200, 900}, 90},
	{15, "Interplanetary Age", EraSpace, "c. 2,200 AD", "Colonies on Moon and Mars, starfighters and plasma.", Res{3400, 1200, 800, 1300, 1200}, 90},
	{16, "Interstellar Age", EraSpace, "c. 2,400 AD", "Warp drives, void dreadnoughts and galactic war.", Res{3600, 1300, 800, 1400, 1500}, 95},
}

// MaxAge is the last age index.
var MaxAge = len(Ages) - 1

// Unit classes used for counter bonuses.
const (
	ClassWorker   = "worker"
	ClassInfantry = "infantry"
	ClassRanged   = "ranged"
	ClassMounted  = "mounted"
	ClassSiege    = "siege"
	ClassAnimal   = "animal"
	ClassBuilding = "building"
)

// UnitDef is the static definition of a unit type.
type UnitDef struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Class      string  `json:"class"`
	Age        int     `json:"age"`
	Era        string  `json:"era"`
	Cost       Res     `json:"cost"`
	HP         float64 `json:"hp"`
	Attack     float64 `json:"attack"`
	Armor      float64 `json:"armor"` // fraction of damage absorbed, 0..0.8
	Range      float64 `json:"range"`
	MinRange   float64 `json:"minRange"`
	Reload     float64 `json:"reload"`
	Speed      float64 `json:"speed"`
	Sight      float64 `json:"sight"`
	TrainTime  float64 `json:"trainTime"`
	Pop        int     `json:"pop"`
	TrainedAt  string  `json:"trainedAt"`
	Projectile string  `json:"projectile"`
	Flying     bool    `json:"flying"`
	Splash     float64 `json:"splash"`
	Sprite     string  `json:"sprite"`
	Desc       string  `json:"desc"`
	// Animals only.
	Food       float64 `json:"food,omitempty"`
	Aggressive bool    `json:"aggressive,omitempty"`
}

// BuildingDef is the static definition of a building type.
type BuildingDef struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Age        int      `json:"age"`
	Size       int      `json:"size"`
	HP         float64  `json:"hp"`
	Cost       Res      `json:"cost"`
	BuildTime  float64  `json:"buildTime"`
	Pop        int      `json:"pop"`
	Dropoff    []int    `json:"dropoff"`
	Trains     []string `json:"trains"` // unit classes
	Research   bool     `json:"research"`
	Attack     float64  `json:"attack"`
	Range      float64  `json:"range"`
	Reload     float64  `json:"reload"`
	Sight      float64  `json:"sight"`
	Food       float64  `json:"food,omitempty"`   // farms
	Energy     float64  `json:"energy,omitempty"` // energy per second
	Desc       string   `json:"desc"`
	Projectile string   `json:"projectile,omitempty"`
}

// TechDef is a researchable technology.
type TechDef struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Age    int     `json:"age"`
	Kind   string  `json:"kind"` // gather, attack, armor, hp
	Amount float64 `json:"amount"`
	Cost   Res     `json:"cost"`
	Time   float64 `json:"time"`
	Desc   string  `json:"desc"`
}

// ResourceDef describes a harvestable map object.
type ResourceDef struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Res    int     `json:"res"`
	Amount float64 `json:"amount"`
	Rate   float64 `json:"rate"` // gather-rate multiplier
	Block  bool    `json:"block"`
}

// Resources lists harvestable object kinds.
var Resources = map[string]*ResourceDef{
	"tree":    {ID: "tree", Name: "Tree", Res: Wood, Amount: 120, Rate: 1, Block: true},
	"berry":   {ID: "berry", Name: "Berry Bush", Res: Food, Amount: 150, Rate: 0.9, Block: true},
	"gold":    {ID: "gold", Name: "Gold Mine", Res: Gold, Amount: 800, Rate: 0.8, Block: true},
	"stone":   {ID: "stone", Name: "Stone Quarry", Res: Stone, Amount: 700, Rate: 0.8, Block: true},
	"carcass": {ID: "carcass", Name: "Carcass", Res: Food, Amount: 100, Rate: 1.3, Block: false},
	"crystal": {ID: "crystal", Name: "Energy Crystal", Res: Energy, Amount: 600, Rate: 0.7, Block: true},
}

// unit line templates; stats for age 0, scaled by age.
type lineTemplate struct {
	class                               string
	hp, atk, armor, rng, minRng, reload float64
	speed, sight, train                 float64
	cost                                Res
	trainedAt                           string
	pop                                 int
}

var lines = map[string]lineTemplate{
	ClassWorker:   {ClassWorker, 25, 3, 0, 0.7, 0, 1.5, 1.05, 4, 10, Res{50, 0, 0, 0, 0}, "town_center", 1},
	ClassInfantry: {ClassInfantry, 48, 6, 0.10, 0.8, 0, 1.4, 1.0, 5, 14, Res{55, 0, 0, 25, 0}, "barracks", 1},
	ClassRanged:   {ClassRanged, 32, 5, 0.0, 5.0, 0, 1.8, 1.0, 7, 15, Res{30, 40, 0, 15, 0}, "range", 1},
	ClassMounted:  {ClassMounted, 95, 8, 0.15, 0.9, 0, 1.6, 1.7, 6, 20, Res{70, 0, 0, 60, 0}, "stable", 2},
	ClassSiege:    {ClassSiege, 85, 26, 0.25, 7.0, 2.0, 4.0, 0.65, 8, 30, Res{0, 160, 0, 110, 0}, "workshop", 3},
}

type unitSpec struct {
	id, name, proj, sprite, desc string
	flying                       bool
	splash                       float64
}

// Per-age military rosters. Index = age.
var infantryRoster = []unitSpec{
	{"clubman", "Clubman", "", "club", "Swings a heavy wooden club.", false, 0},
	{"spearman", "Spearman", "", "spear", "Flint-tipped spear, deadly against beasts and riders.", false, 0},
	{"axeman", "Axeman", "", "axe", "Copper axe and hide shield.", false, 0},
	{"swordsman", "Bronze Swordsman", "", "sword", "Bronze khopesh and helmet.", false, 0},
	{"iron_warrior", "Iron Warrior", "", "sword", "Iron sword and round shield.", false, 0},
	{"hoplite", "Hoplite", "", "hoplite", "Heavy spear, bronze cuirass and aspis.", false, 0},
	{"man_at_arms", "Man-at-Arms", "", "sword", "Chainmail and a broad sword.", false, 0},
	{"knight_foot", "Dismounted Knight", "", "greatsword", "Plate armour and longsword.", false, 0},
	{"pikeman", "Pikeman", "", "pike", "Five-metre pike in tight squares.", false, 0},
	{"grenadier", "Grenadier", "grenade", "grenadier", "Throws black-powder grenades at close range.", false, 0.8},
	{"fusilier", "Fusilier", "bullet", "bayonet", "Rifled musket with bayonet.", false, 0},
	{"stormtrooper", "Trench Raider", "bullet", "smg", "Submachine gun and trench club.", false, 0},
	{"assault_trooper", "Assault Trooper", "bullet", "rifle", "Automatic rifle and steel helmet.", false, 0},
	{"special_forces", "Special Forces", "bullet", "rifle", "Night-vision and carbine.", false, 0},
	{"exo_trooper", "Exo-Trooper", "laser", "exo", "Powered exoskeleton with pulse carbine.", false, 0},
	{"void_marine", "Void Marine", "plasma", "marine", "Sealed power armour for vacuum combat.", false, 0},
	{"psi_templar", "Psi Templar", "plasma", "templar", "Phase-blade warrior of the stars.", false, 0},
}

var rangedRoster = []unitSpec{
	{"stone_thrower", "Stone Thrower", "stone", "throw", "Hurls stones at a distance.", false, 0},
	{"slinger", "Slinger", "stone", "sling", "Leather sling and lead shot.", false, 0},
	{"bowman", "Bowman", "arrow", "bow", "Simple self bow.", false, 0},
	{"composite_archer", "Composite Archer", "arrow", "bow", "Horn-and-sinew bow with great reach.", false, 0},
	{"iron_archer", "Iron Archer", "arrow", "bow", "Iron-tipped arrows that pierce shields.", false, 0},
	{"toxotes", "Toxotes", "arrow", "bow", "Skilled archer of the classical world.", false, 0},
	{"crossbowman", "Crossbowman", "bolt", "crossbow", "Steel bolts that pierce mail.", false, 0},
	{"longbowman", "Longbowman", "arrow", "longbow", "Yew longbow, the terror of knights.", false, 0},
	{"arquebusier", "Arquebusier", "bullet", "musket", "Matchlock firearm.", false, 0},
	{"musketeer", "Musketeer", "bullet", "musket", "Flintlock musket in volleys.", false, 0},
	{"rifleman", "Rifleman", "bullet", "rifle", "Breech-loading rifle.", false, 0},
	{"machine_gunner", "Machine Gunner", "bullet", "mg", "Water-cooled machine gun.", false, 0},
	{"bazooka", "Bazooka Team", "rocket", "bazooka", "Shoulder rocket against armour.", false, 0},
	{"at_team", "Anti-Tank Team", "missile", "bazooka", "Guided anti-tank missile.", false, 0},
	{"railgunner", "Railgunner", "rail", "railgun", "Magnetic rail rifle.", false, 0},
	{"plasma_gunner", "Plasma Gunner", "plasma", "plasma", "Superheated plasma lance.", false, 0},
	{"ion_lancer", "Ion Lancer", "ion", "plasma", "Ion beam that ignores shields.", false, 0},
}

// mounted roster begins at age 2.
var mountedRoster = []unitSpec{
	{}, {},
	{"onager_rider", "Onager Rider", "", "donkey", "Rides a half-tamed wild ass.", false, 0},
	{"chariot", "War Chariot", "arrow", "chariot", "Two-horse chariot with an archer.", false, 0},
	{"horseman", "Horseman", "", "horse", "Swift rider with spear.", false, 0},
	{"cataphract", "Cataphract", "", "horse", "Armoured heavy cavalry.", false, 0},
	{"light_cavalry", "Light Cavalry", "", "horse", "Fast mail-clad rider.", false, 0},
	{"knight", "Knight", "", "knight", "Plate-armoured lancer on a destrier.", false, 0},
	{"cuirassier", "Cuirassier", "", "knight", "Breastplate and wheel-lock pistols.", false, 0},
	{"dragoon", "Dragoon", "bullet", "horse", "Mounted musketeer.", false, 0},
	{"lancer", "Lancer", "", "horse", "Hussar with lance and sabre.", false, 0},
	{"tank_mk1", "Landship Mk I", "shell", "tank_old", "Rhomboid tank that crosses trenches.", false, 0.6},
	{"battle_tank", "Battle Tank", "shell", "tank", "Turreted medium tank.", false, 0.6},
	{"mbt", "Main Battle Tank", "shell", "tank", "Composite armour and stabilised gun.", false, 0.7},
	{"hover_tank", "Hover Tank", "rail", "hover", "Anti-gravity tank with railgun.", false, 0.6},
	{"starfighter", "Starfighter", "laser", "fighter", "Agile space superiority fighter.", true, 0},
	{"interceptor", "Void Interceptor", "ion", "fighter", "Warp-capable interceptor.", true, 0},
}

// siege roster begins at age 3.
var siegeRoster = []unitSpec{
	{}, {}, {},
	{"battering_ram", "Battering Ram", "", "ram", "Bronze-headed ram for gates and walls.", false, 0},
	{"catapult", "Catapult", "boulder", "catapult", "Torsion catapult throwing stones.", false, 1.0},
	{"ballista", "Ballista", "bolt", "ballista", "Giant crossbow of the legions.", false, 0},
	{"mangonel", "Mangonel", "boulder", "catapult", "Traction-powered stone thrower.", false, 1.2},
	{"trebuchet", "Trebuchet", "boulder", "trebuchet", "Counterweight siege engine.", false, 1.3},
	{"bombard", "Bombard", "cannonball", "cannon", "Huge early cannon.", false, 0.9},
	{"field_cannon", "Field Cannon", "cannonball", "cannon", "Mobile horse-drawn artillery.", false, 1.0},
	{"field_gun", "Field Gun", "shell", "cannon", "Rifled breech-loading artillery.", false, 1.2},
	{"howitzer", "Howitzer", "shell", "artillery", "Heavy indirect-fire artillery.", false, 1.5},
	{"rocket_artillery", "Rocket Artillery", "rocket", "rocket_truck", "Salvo rocket launcher.", false, 1.6},
	{"missile_launcher", "Missile Launcher", "missile", "rocket_truck", "Precision cruise missiles.", false, 1.5},
	{"drone_swarm", "Drone Carrier", "missile", "drone", "Launches swarms of strike drones.", true, 1.4},
	{"frigate", "Bombard Frigate", "plasma", "frigate", "Orbital frigate that bombards the surface.", true, 1.6},
	{"dreadnought", "Void Dreadnought", "ion", "dreadnought", "Planet-cracking capital ship.", true, 2.0},
}

var workerNames = []string{
	"Gatherer", "Villager", "Villager", "Villager", "Villager", "Citizen",
	"Peasant", "Peasant", "Labourer", "Labourer", "Worker", "Worker",
	"Engineer", "Engineer", "Technician", "Colonist", "Colonist",
}

// AgeEra returns the visual era of an age.
func AgeEra(age int) string {
	if age < 0 {
		age = 0
	}
	if age > MaxAge {
		age = MaxAge
	}
	return Ages[age].Era
}

// Units holds every unit definition, keyed by id.
var Units = map[string]*UnitDef{}

// Buildings holds every building definition, keyed by id.
var Buildings = map[string]*BuildingDef{}

// Techs holds every technology definition, keyed by id.
var Techs = map[string]*TechDef{}

// UnitLine maps a class to the per-age unit ids (empty where unavailable).
var UnitLine = map[string][]string{}

func ageScale(age int) float64  { return 1 + 0.30*float64(age) }
func costScale(age int) float64 { return 1 + 0.22*float64(age) }

func eraSpeed(class string, age int) float64 {
	switch {
	case age >= 14 && (class == ClassMounted || class == ClassSiege):
		return 1.35
	case age >= 11 && (class == ClassMounted || class == ClassSiege):
		return 1.15
	case age >= 10 && class == ClassWorker:
		return 1.15
	}
	return 1
}

func makeUnit(t lineTemplate, s unitSpec, age int) *UnitDef {
	sc := ageScale(age)
	cost := t.cost.Scale(costScale(age))
	if age < 2 { // no gold economy before the Copper Age
		cost[Food] += cost[Gold]
		cost[Gold] = 0
	}
	if age >= 8 && t.class != ClassWorker {
		// money economy: later eras pay more in gold, less in food
		f := cost[Food]
		cost[Food] = math.Round(f * 0.5)
		cost[Gold] += math.Round(f * 0.35)
	}
	if age >= 10 && t.class != ClassWorker {
		cost[Energy] = math.Round(10 + 4*float64(age-10)*(1+float64(t.pop)))
	}
	u := &UnitDef{
		ID: s.id, Name: s.name, Class: t.class, Age: age, Era: AgeEra(age), Cost: cost,
		HP: math.Round(t.hp * sc), Attack: math.Round(t.atk*sc*10) / 10, Armor: t.armor,
		Range: t.rng, MinRange: t.minRng, Reload: t.reload,
		Speed: t.speed * eraSpeed(t.class, age), Sight: t.sight, TrainTime: t.train, Pop: t.pop,
		TrainedAt: t.trainedAt, Projectile: s.proj, Flying: s.flying, Splash: s.splash,
		Sprite: s.sprite, Desc: s.desc,
	}
	if t.class == ClassInfantry && s.proj != "" { // firearm infantry
		u.Range = 3.5
	}
	if t.class == ClassMounted && s.proj != "" {
		u.Range = 4
		if s.splash > 0 {
			u.Range = 5
			u.Reload = 2.6
		}
	}
	if s.flying {
		u.Speed = 2.1
		u.Range = math.Max(u.Range, 3.5)
	}
	if s.sprite == "ram" {
		u.Range = 0.9
		u.MinRange = 0
		u.Projectile = ""
	}
	if age >= 8 && t.class == ClassRanged {
		u.Range = 5.5
	}
	return u
}

// Animals are owned by nature.
var animalDefs = []*UnitDef{
	{ID: "deer", Name: "Deer", Class: ClassAnimal, HP: 18, Attack: 0, Speed: 1.5, Sight: 5, Food: 120, Sprite: "deer", Reload: 1, Range: 0.6},
	{ID: "boar", Name: "Wild Boar", Class: ClassAnimal, HP: 60, Attack: 4, Speed: 1.2, Sight: 4, Food: 260, Aggressive: true, Sprite: "boar", Reload: 1.5, Range: 0.7},
	{ID: "mammoth", Name: "Mammoth", Class: ClassAnimal, HP: 220, Attack: 9, Speed: 0.8, Sight: 4, Food: 650, Aggressive: true, Sprite: "mammoth", Reload: 2, Range: 1.0},
}

// building templates: names by era.
type bTemplate struct {
	id               string
	names            map[string]string
	age, size        int
	hp, build        float64
	cost             Res
	pop              int
	dropoff          []int
	trains           []string
	research         bool
	attack, rng, rel float64
	sight            float64
	food, energy     float64
	desc             string
}

func eraNames(stone, bronze, iron, classical, medieval, gunpowder, industrial, modern, future, space string) map[string]string {
	return map[string]string{EraStone: stone, EraBronze: bronze, EraIron: iron, EraClassical: classical,
		EraMedieval: medieval, EraGunpowder: gunpowder, EraIndustrial: industrial, EraModern: modern,
		EraFuture: future, EraSpace: space}
}

var buildingTemplates = []bTemplate{
	{id: "town_center", names: eraNames("Camp Fire", "Chieftain Hall", "Longhouse", "Forum", "Keep", "Town Hall", "City Hall", "Capitol", "Arcology", "Command Nexus"),
		size: 3, hp: 1400, build: 120, cost: Res{0, 275, 100, 0, 0}, pop: 10, dropoff: []int{Food, Wood, Stone, Gold},
		trains: []string{ClassWorker}, attack: 4, rng: 6, rel: 2, sight: 8, desc: "Heart of your settlement. Trains workers and advances the age."},
	{id: "house", names: eraNames("Hut", "Mud House", "Timber House", "Domus", "Cottage", "Townhouse", "Tenement", "Apartment", "Habitat", "Hab Module"),
		size: 2, hp: 300, build: 18, cost: Res{0, 30, 0, 0, 0}, pop: 5, sight: 3, desc: "Provides housing for 5 population."},
	{id: "granary", names: eraNames("Food Cache", "Granary", "Granary", "Horreum", "Mill", "Mill", "Grain Elevator", "Food Depot", "Bio-Store", "Nutrient Hub"),
		size: 2, hp: 500, build: 30, cost: Res{0, 80, 0, 0, 0}, dropoff: []int{Food}, sight: 4, desc: "Drop-off for food."},
	{id: "lumber_camp", names: eraNames("Wood Pile", "Lumber Camp", "Lumber Camp", "Lumber Yard", "Lumber Camp", "Sawmill", "Sawmill", "Timber Works", "Carbon Works", "Carbon Refinery"),
		size: 2, hp: 500, build: 30, cost: Res{0, 80, 0, 0, 0}, dropoff: []int{Wood}, sight: 4, desc: "Drop-off for wood."},
	{id: "mining_camp", names: eraNames("Stone Pile", "Quarry Camp", "Mining Camp", "Mine", "Mining Camp", "Mine Works", "Colliery", "Ore Plant", "Ore Refinery", "Asteroid Refinery"),
		size: 2, hp: 500, build: 30, cost: Res{0, 80, 0, 0, 0}, dropoff: []int{Stone, Gold, Energy}, sight: 4, desc: "Drop-off for stone, gold and crystals."},
	{id: "farm", names: eraNames("Wild Garden", "Field", "Field", "Farm", "Farm", "Farm", "Farmstead", "Agri-Plant", "Hydroponics", "Hydroponic Dome"),
		size: 3, hp: 200, build: 20, cost: Res{0, 60, 0, 0, 0}, food: 320, sight: 2, desc: "A renewable source of food, worked by one worker."},
	{id: "barracks", names: eraNames("War Camp", "War Lodge", "Barracks", "Castrum", "Barracks", "Barracks", "Garrison", "Military Base", "Exo Bay", "Marine Barracks"),
		size: 3, hp: 900, build: 45, cost: Res{0, 150, 0, 0, 0}, trains: []string{ClassInfantry}, sight: 5, desc: "Trains infantry."},
	{id: "range", names: eraNames("Throwing Pit", "Sling Range", "Archery Range", "Archery Range", "Archery Range", "Archery Range", "Rifle Range", "Firing Range", "Weapons Lab", "Plasma Armory"),
		size: 3, hp: 900, build: 45, cost: Res{0, 150, 0, 0, 0}, trains: []string{ClassRanged}, sight: 5, desc: "Trains ranged units."},
	{id: "stable", names: eraNames("Corral", "Corral", "Stable", "Stable", "Stable", "Stable", "Motor Pool", "Tank Factory", "Hover Factory", "Starport"),
		age: 2, size: 3, hp: 1000, build: 50, cost: Res{0, 150, 50, 0, 0}, trains: []string{ClassMounted}, sight: 5, desc: "Trains mounted units, tanks and fighters."},
	{id: "workshop", names: eraNames("Workshop", "Workshop", "Siege Workshop", "Siege Workshop", "Siege Workshop", "Foundry", "Arsenal", "Arsenal", "Drone Yard", "Orbital Shipyard"),
		age: 3, size: 3, hp: 1000, build: 55, cost: Res{0, 200, 0, 50, 0}, trains: []string{ClassSiege}, sight: 5, desc: "Builds siege engines and artillery."},
	{id: "academy", names: eraNames("Shaman Hut", "Elder Hut", "Temple", "Academy", "Monastery", "University", "Institute", "Laboratory", "Research Spire", "Xeno Institute"),
		age: 1, size: 3, hp: 900, build: 50, cost: Res{0, 175, 50, 0, 0}, research: true, sight: 5, desc: "Researches technologies."},
	{id: "tower", names: eraNames("Lookout", "Watch Tower", "Watch Tower", "Tower", "Guard Tower", "Bastion", "Blockhouse", "Bunker", "Laser Turret", "Ion Cannon"),
		age: 1, size: 1, hp: 700, build: 40, cost: Res{0, 40, 120, 0, 0}, attack: 6, rng: 7, rel: 2, sight: 9, desc: "Defensive tower that shoots enemies."},
	{id: "generator", names: eraNames("", "", "", "", "Windmill", "Watermill", "Coal Plant", "Power Station", "Fusion Plant", "Zero-Point Core"),
		age: 10, size: 2, hp: 600, build: 45, cost: Res{0, 120, 80, 40, 0}, energy: 0.6, sight: 3, desc: "Generates energy over time."},
}

// BuildingName returns the age-appropriate name of a building.
func BuildingName(id string, age int) string {
	for _, t := range buildingTemplates {
		if t.id == id {
			if n := t.names[AgeEra(age)]; n != "" {
				return n
			}
			return Buildings[id].Name
		}
	}
	return id
}

// BuildingNames returns the era→name table for client rendering.
func BuildingNames() map[string]map[string]string {
	out := map[string]map[string]string{}
	for _, t := range buildingTemplates {
		out[t.id] = t.names
	}
	return out
}

var techNames = map[string][]string{
	"gather": {"Flint Knapping", "Polished Stone", "Copper Tools", "Bronze Tools", "Iron Tools", "Crop Rotation", "Heavy Plough", "Windmills", "Printing Press", "Agricultural Revolution", "Steam Power", "Assembly Line", "Green Revolution", "Automation", "Nanofabrication", "Asteroid Mining", "Matter Compilers"},
	"attack": {"Fire-Hardened Points", "Flint Blades", "Copper Smelting", "Bronze Casting", "Iron Forging", "Steel Tempering", "Damascus Steel", "Plate Forging", "Corned Powder", "Rifled Barrels", "Smokeless Powder", "Chemical Weapons", "Guided Rockets", "Precision Munitions", "Directed Energy", "Plasma Containment", "Antimatter Warheads"},
	"armor":  {"Hide Coats", "Leather Armour", "Wicker Shields", "Bronze Scale", "Iron Mail", "Linothorax", "Chainmail", "Plate Armour", "Pikemen Drill", "Line Tactics", "Field Fortifications", "Steel Helmets", "Kevlar", "Composite Armour", "Reactive Exo-Plating", "Deflector Shields", "Phase Shields"},
	"hp":     {"Herbal Lore", "Bone Setting", "Wheel", "Masonry", "Architecture", "Aqueducts", "Fortified Walls", "Castle Masonry", "Medicine", "Vaccination", "Steel Frames", "Reinforced Concrete", "Antibiotics", "Genetic Medicine", "Nanobot Repair", "Regeneration", "Bio-Uploading"},
}

func init() { buildDefs() }

func buildDefs() {
	for c, t := range lines {
		var ids []string
		for age := 0; age <= MaxAge; age++ {
			var spec unitSpec
			switch c {
			case ClassWorker:
				spec = unitSpec{id: fmt.Sprintf("worker_%d", age), name: workerNames[age], sprite: "worker", desc: "Gathers resources and constructs buildings."}
			case ClassInfantry:
				spec = infantryRoster[age]
			case ClassRanged:
				spec = rangedRoster[age]
			case ClassMounted:
				spec = mountedRoster[age]
			case ClassSiege:
				spec = siegeRoster[age]
			}
			if spec.id == "" {
				ids = append(ids, "")
				continue
			}
			u := makeUnit(t, spec, age)
			Units[u.ID] = u
			ids = append(ids, u.ID)
		}
		UnitLine[c] = ids
	}
	for _, a := range animalDefs {
		Units[a.ID] = a
	}
	for _, t := range buildingTemplates {
		name := t.names[EraStone]
		if name == "" {
			name = t.names[EraIndustrial]
		}
		Buildings[t.id] = &BuildingDef{
			ID: t.id, Name: name, Age: t.age, Size: t.size, HP: t.hp, Cost: t.cost, BuildTime: t.build,
			Pop: t.pop, Dropoff: t.dropoff, Trains: t.trains, Research: t.research, Attack: t.attack,
			Range: t.rng, Reload: t.rel, Sight: t.sight, Food: t.food, Energy: t.energy, Desc: t.desc,
			Projectile: "arrow",
		}
	}
	kinds := []string{"gather", "attack", "armor", "hp"}
	desc := map[string]string{"gather": "+15% gather rate", "attack": "+10% military attack", "armor": "+5% military armour", "hp": "+10% hit points for buildings and units"}
	amount := map[string]float64{"gather": 0.15, "attack": 0.10, "armor": 0.05, "hp": 0.10}
	base := map[string]Res{"gather": {100, 75, 0, 0, 0}, "attack": {120, 0, 0, 60, 0}, "armor": {120, 60, 0, 40, 0}, "hp": {80, 80, 60, 0, 0}}
	for age := 0; age <= MaxAge; age++ {
		for _, k := range kinds {
			c := base[k].Scale(1 + 0.35*float64(age))
			if age < 2 {
				c[Food] += c[Gold]
				c[Gold] = 0
			}
			if age >= 8 {
				f := c[Food]
				c[Food] = math.Round(f * 0.55)
				c[Gold] += math.Round(f * 0.3)
			}
			if age >= 11 {
				c[Energy] = math.Round(50 + 20*float64(age-11))
			}
			id := fmt.Sprintf("%s_%d", k, age)
			Techs[id] = &TechDef{ID: id, Name: techNames[k][age], Age: age, Kind: k, Amount: amount[k], Cost: c, Time: 25 + 2*float64(age), Desc: desc[k]}
		}
	}
}

// BestUnit returns the most advanced unit id of a class available at age.
func BestUnit(class string, age int) string {
	line := UnitLine[class]
	for a := age; a >= 0; a-- {
		if a < len(line) && line[a] != "" {
			return line[a]
		}
	}
	return ""
}

// Counter returns the damage multiplier of attacker class vs target class.
func Counter(att, tgt string) float64 {
	switch att {
	case ClassInfantry:
		if tgt == ClassMounted {
			return 1.6
		}
		if tgt == ClassSiege {
			return 1.4
		}
	case ClassRanged:
		if tgt == ClassInfantry {
			return 1.4
		}
		if tgt == ClassBuilding {
			return 0.4
		}
	case ClassMounted:
		if tgt == ClassRanged {
			return 1.6
		}
		if tgt == ClassSiege {
			return 1.8
		}
	case ClassSiege:
		if tgt == ClassBuilding {
			return 3.5
		}
		return 0.7
	case ClassWorker:
		if tgt == ClassBuilding {
			return 0.3
		}
	}
	return 1
}

// Defs is the bundle sent to clients so they can render and build UIs.
type Defs struct {
	Ages          []Age                        `json:"ages"`
	Units         map[string]*UnitDef          `json:"units"`
	Buildings     map[string]*BuildingDef      `json:"buildings"`
	BuildingNames map[string]map[string]string `json:"buildingNames"`
	Techs         map[string]*TechDef          `json:"techs"`
	Resources     map[string]*ResourceDef      `json:"resources"`
	UnitLine      map[string][]string          `json:"unitLine"`
	ResNames      [NumRes]string               `json:"resNames"`
}

// AllDefs returns the static definitions.
func AllDefs() *Defs {
	return &Defs{Ages, Units, Buildings, BuildingNames(), Techs, Resources, UnitLine, ResNames}
}

// SortedTechs returns tech ids available at the given age, sorted.
func SortedTechs(age int) []string {
	var out []string
	for id, t := range Techs {
		if t.Age <= age {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}
