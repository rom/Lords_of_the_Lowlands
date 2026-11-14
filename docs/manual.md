# Lords of the Lowlands: User Manual

*From the first fire to the farthest stars.*

This manual explains how to play: what the game is about, how to win, how the economy, the ages and the armies work, which options you can choose, and how to find a good balance between building, researching and fighting. If you have a quick question, the [FAQ](faq.md) may answer it faster.

## Welcome

**Lords of the Lowlands** is a real-time strategy game in the spirit of the classic isometric strategy games. You lead a people through **seventeen ages**. You start with a band of hunter-gatherers around a camp fire in the **Dawn Age** and move through copper, bronze, iron, castles, gunpowder, steam and silicon. In the end your starfighters and void dreadnoughts fight for the galaxy in the **Interstellar Age**.

Every match follows the same loop:

1. **Gather** food, wood, stone, gold and, later, energy with your workers.
2. **Build** houses, drop-off camps, farms, military buildings and an academy.
3. **Train and research** units and technologies.
4. **Advance the age** at your town centre. This unlocks new units and buildings and gives your whole civilisation a new look and new music.
5. **Fight** using counters, siege engines and towers, and then start the loop again with a stronger economy.

Nothing has to be installed. The game runs in your web browser. Every building, unit, sound and piece of music is generated while you play.

## The objective

Each game has one of three objectives. It is shown when the game starts and in the level description.

| Objective | How you win |
|---|---|
| **Conquest** ("Destroy all enemies") | Be the last team standing. |
| **Survive** ("Survive for N minutes") | Hold out until the timer runs out. If a human player's team is still alive when time is up, that team wins. |
| **Advance** ("Be the first to reach the …") | Be the first player to reach the level's final age. Your whole team wins. |

**When is a player defeated?** A player is out once they have **no land units left and no buildings other than houses and farms**. Ships alone do not keep you in the game. When a player is defeated, everything they still own disappears. In Survive and Advance games you also win early if every opponent has been defeated.

**Losing.** You lose when you are defeated as described above, when another team reaches the final age first in an Advance game, or when you **resign** (game menu, *Resign*).

### Scoring

When a game ends, a results table shows every player's score, age, kills, losses, resources gathered and technologies researched. The score is calculated like this:

- gathered resources ÷ 10
- plus the value of the enemies you killed ÷ 5
- plus 60 per technology researched
- plus 400 per age you advanced during the game
- plus 15 per building and 5 per unit you produced
- plus, if you won, 2,000 and a speed bonus of 1,500 − 30 × minutes played (never below 0)

So a fast win scores more than a slow one. Researching and advancing are rewarded as well.

## Getting started

### Accounts

When you open the game you see the **Enter the Realm** screen with three tabs:

- **Sign in**: for an existing account.
- **Register** (called **Request account** if the server's administrator approves new accounts by hand): pick a name of 3–20 letters, digits, `_` or `-` and a password (at least 8 characters by default).
- **Guest**: just enter a name and play.

Guests can play everything: campaign, skirmish, multiplayer and the level editor. A registered account adds:

- **Saved games**: save a running match on the server and resume it later.
- **Hall of Fame**: your wins, best score and campaign progress are recorded, and your scores appear in the high-score tables.
- **Campaign progress**: completed chapters are marked on the campaign screen.
- **Level publishing**: save your own maps to the server and play-test them from the editor.
- **Two-factor sign-in (MFA)** with an authenticator app (see [Security](#security)).

The server operator decides whether registration is open, needs approval, or is closed, and whether guests are allowed. Tabs that are turned off are hidden.

### The main menu

| Button | What it does |
|---|---|
| **Campaign** | The 17-chapter story from the Dawn Age to the stars. |
| **Skirmish vs Computer** | A single game against 1–7 computer opponents on a random or chosen map. |
| **Multiplayer** | The lobby: create or join battles with other players and computer seats, and chat. |
| **Level Editor** | Paint your own maps. |
| **Load Game** | Your saved games (registered players). |
| **Hall of Fame** | Leaderboard and high scores. |
| **Settings** | Sound volumes and, for registered players, account security. |
| **Manual & FAQ** | This manual and the FAQ, with a search box. |
| **Sign out** | Leave your account. |

The panel next to the menu shows your name and, for registered players, games, wins, best score and campaign progress (for example *Campaign 3/17*).

### Your first game

Start with campaign chapter 1, **The First Fire**. It is a small Dawn Age map against one computer opponent on *easy*. If that is still too fast, choose **Super easy** in the campaign screen's *Difficulty* box before you click the chapter. Super easy opponents work at about half speed, do not attack before minute 12 and do not react to raids.

> Tip: press `?` (or `F1`) at any time during a game to see every keyboard shortcut, and `F4` to open this manual. The *Manual & FAQ* button in the main menu and on the sign-in screen opens it too. Every command button also shows its hotkey in the corner, and hovering over a button shows its cost and description.

## The game screen

### Top bar

From left to right:

- **Resources**: food, wood, stone, gold and energy. The energy counter only appears from the Industrial Age, or earlier if you already have energy.
- **Population**: used / available (for example `14/20`). It is highlighted when you are within 2 of the limit, which means it is time to build a house.
- **Age**: the Roman numeral and name of your current age. Hover over it for the era's years and description.
- **Clock**: the game time.
- **Tech Tree**, **?** and **Menu** buttons: your technology tree (`F2`/`Y`), the shortcut help (`?`/`F1`) and the game menu (`F10`).

Below the top bar is a list of all players with their colour, score and current age (as a Roman numeral). Defeated players are greyed out.

### Minimap and fog of war

The minimap (bottom left) shows the whole map. Left-click or drag on it to move the camera. Right-click on it to send the selected units there. Attack alerts flash on the minimap for a few seconds.

The map is covered by **fog of war**:

- **Unexplored** areas are black.
- **Explored** areas show the terrain, resources and the enemy buildings you have seen, but not enemy units.
- **Visible** areas are lit, and everything that happens there can be seen.

Each of your units and buildings sees a certain distance (workers 4 tiles, infantry 5, mounted 6, ranged 7, siege 8). Allies share their vision. You can only place buildings on explored ground.

### Selection panel

The middle of the bottom bar shows what you have selected:

- **One unit**: portrait, hit points, attack, armour and range, plus what it is carrying.
- **One building**: hit points, construction progress, food left in a farm, and the **production queue**. Click a queued item to cancel it and get its full cost back.
- **Several units**: a small icon with a health bar for each unit. Click an icon to select only that unit.
- **A resource**: how much is left.

### Command panel

The right side of the bottom bar shows the buttons for your selection, each with its hotkey:

- **Workers**: *Build Economy* (`Q`) and *Build Military* (`W`). Each opens a page of buildings, and `Esc` goes back. Workers also have *Attack Move*, *Stop*, *Repair* and *Delete*.
- **Soldiers and ships**: *Attack Move* (`A`), *Stop* (`S`) and *Delete* (`Del`).
- **Buildings**: train buttons. A building always trains the **best unit of your current age** in its line. The town centre also has *Advance to …*, and the academy has its technologies. Every building has *Delete Building*, which asks for confirmation first.
- **Foundations**: *Cancel Construction* refunds 75 % of the cost.

Buttons are dimmed when you cannot afford them. Buttons for things your age does not allow yet show which age they require.

### Messages and alerts

Short messages appear on screen, for example "Not enough resources", "Your Barracks is under attack!", "Researched Flint Knapping" or "Red advanced to the Copper Age". An alarm sounds when you are attacked. The alarm sounds different for buildings and units and follows the era: war drums and horns, church bells, bugles and later air-raid sirens and starship klaxons. Press `Space` to jump to the latest attack.

### Chat

Press `Enter` to open the chat line, type, and press `Enter` again to send. `Tab` switches the channel:

- **All**: everyone in this game.
- **Team**: only your allies.
- **Global**: everyone on the server.

## Controls

### Mouse

- **Left click** selects a unit or building. **Drag** a box to select several of your units. Hold **Shift** to add units to the selection or remove them.
- **Double-click** a unit to select all visible units of that type.
- **Right click** gives the sensible command for what is under the cursor: move, gather a resource, attack an enemy, build or repair your own building. With only buildings selected, a right-click sets their **rally point**, where new units will walk to.
- **Mouse wheel** zooms. Moving the mouse to the screen edge scrolls the map.

When you place a building, a ghost shows whether the spot is valid. Left-click to place it. **Shift+click** places several in a row. Right-click or `Esc` cancels.

### Groups and formations

Select some units and press `Ctrl+1` … `Ctrl+9` to store them as a control group. `Shift+number` adds the selection to a group. Press the number to select the group, and press it twice quickly to centre the camera on it. When you move a group, the units spread out in a neat square formation around the target instead of piling up on one spot.

### Complete shortcut list

This is the same list the game shows with `?` / `F1`.

**General**

| Key | Action |
|---|---|
| `?` / `F1` | Show or hide the shortcut help |
| `F10` | Game menu |
| `F2` or `Y` | Your tech tree (click a technology to research it) |
| `F4` | User manual and FAQ |
| `Esc` | Cancel placement / back / close window / clear selection |
| `Enter` | Open chat (`Tab` switches All / Team / Global) |
| `Ctrl+S` | Quick save (registered players) |
| `Shift+M` | Mute / unmute sound |

**Camera**

| Key | Action |
|---|---|
| Arrow keys / screen edge | Scroll the map |
| Mouse wheel or `+` / `−` | Zoom in / out |
| `0` | Reset zoom |
| `Space` | Jump to the latest attack alert |
| `Backspace` | Centre on the selection |
| Minimap click / drag | Move the camera (right-click: move units) |

**Selection**

| Key | Action |
|---|---|
| Click / drag | Select (Shift adds or removes) |
| Double-click | Select all visible units of that type |
| `H` | Select and centre on the town centre (`Shift+H` cycles through them) |
| `.` | Next idle worker (`Ctrl+.` selects all idle workers) |
| `,` | Next idle military unit (`Ctrl+,` selects all) |
| `M` | Select all military units |
| `Ctrl+A` | Select all your units |
| `Ctrl+1…9` | Store selection as group |
| `Shift+1…9` | Add selection to group |
| `1…9` | Recall group (twice: centre on it) |

**Orders**

| Key | Action |
|---|---|
| Right-click | Move / gather / attack / build / repair; set rally point |
| `A` | Attack-move (then click the destination) |
| `S` | Stop |
| `Del` | Delete selection (buildings ask first) |
| `Q W E R T …` | Command buttons in panel order (shown on each button) |
| `Shift` + train key | Train 5 at once |

**Building (workers selected)**

| Key | Action |
|---|---|
| `Q` / `W` | Economy / military build page |
| `Shift+E` `G` `L` `N` `F` `D` `C` `P` | House, granary, lumber camp, mining camp, farm, dock, town centre, generator |
| `Shift+B` `R` `S` `K` `Y` `T` | Barracks, range, stable, workshop, academy, tower |
| `Shift`+click when placing | Place several |

The command hotkeys follow the order of the buttons: `Q W E R T A S D F G Z X C V B`. The exact key is printed on every button.

## Economy

### The five resources

| Resource | Where it comes from | Where it is delivered |
|---|---|---|
| **Food** | berry bushes (150 each), hunting deer (120), wild boar (260) and mammoths (650), farms, fish (350 per school, fishing boats only) | town centre, granary; fish only at a dock |
| **Wood** | trees (120 each) | town centre, lumber camp |
| **Stone** | stone quarries (700) | town centre, mining camp |
| **Gold** | gold mines (800); not used before the Copper Age | town centre, mining camp |
| **Energy** | energy crystals (600) and generators, from the Industrial Age | mining camp (crystals); generators add energy directly |

Before the Copper Age nothing costs gold. Prices that would include gold are charged in food instead.

### Gathering

Select workers and right-click a tree, bush, mine, crystal, farm or animal. A worker works until its hands are full, then walks to the **nearest drop-off building** for that resource, delivers, and goes back. A worker carries 10 + the age number per trip (10 in the Dawn Age, 26 in the Interstellar Age). Gathering speed grows by 6 % every age, by 15 % with every *gather* technology, and every technology you research makes workers 3 % faster on their feet.

How fast each source is gathered, compared with chopping a tree:

| Source | Relative speed |
|---|---|
| Animal carcass (after a hunt) | 1.3 |
| Fish (fishing boat) | 1.1 |
| Tree | 1.0 |
| Berry bush | 0.9 |
| Farm | 0.8 |
| Gold, stone | 0.8 |
| Energy crystal | 0.7 |

Useful things to know:

- **Walking is the biggest waste.** Build a lumber camp at the forest edge, a mining camp next to the mines and a granary next to the berries or farms.
- When a tree or mine runs out, the worker moves on to the next one of the same kind nearby.
- If you send a worker to a different resource while it is carrying something, it **first delivers what it carries** and then starts the new job. If there is nowhere to deliver its load, the load is dropped.
- Workers walking along a path **pass through each other**, so narrow forest lanes and busy drop-offs do not jam.
- A worker that cannot reach its drop-off stops and keeps its load. Give it a new gather order once the way is clear.
- **Hunting**: right-click an animal with workers. Deer run away. **Boars and mammoths fight back**, so send several workers or a few soldiers. Once the animal is dead, the workers gather the carcass, which is the fastest food in the early game.

### Farms

A farm (60 wood, 3×3) is worked by **one worker** and holds a limited amount of food: 320 in the Dawn Age, 25 % more for every age. When the food runs out the farm disappears and you have to build a new one. The map type changes the yield: farms give **60 %** on desert maps and **115 %** on riverland maps. Some map technologies raise it further (Irrigation +50 %, Qanats +40 %, Terrace Farming +25 %). Farm technologies only affect farms built after the research. A worker that finishes building a farm starts farming it straight away.

### Fishing

On maps with enough water you can build a **dock** (from the Neolithic Age, 150 wood). It must touch water along at least two of its edge tiles. The dock trains **fishing boats**, which catch fish and bring it back to a dock, the only drop-off for boats. Only fishing boats can harvest fish. Fish are placed along the shores of coastal, riverland and lakes maps.

### Houses and population

Every unit takes population room: workers, infantry, ranged units and fishing boats use 1, mounted units and warships 2, siege engines 3. Your **population limit** is 10 per town centre plus 5 per house, up to a hard cap of **200**. A unit in the production queue does not start until there is room for it, so build houses (30 wood, quick to build) *before* you need them.

### Building

Select one or more workers, open *Build Economy* (`Q`) or *Build Military* (`W`), or use the `Shift+letter` shortcut, then click a free spot. More workers on one foundation build it faster. Buildings cannot go on water, mountains or fords, on unexplored tiles, or on top of other buildings, trees or mines. Building prices rise by 12 % for every age you are in (houses only 5 %). Cancelling a foundation refunds 75 %.

**Repairing** is free: right-click a damaged building with workers.

| Building | From age | Cost (base) | Purpose |
|---|---|---|---|
| Town centre | Dawn | 275W 100S | trains workers, drop-off for food, wood, stone and gold, advances the age, +10 population; shoots at enemies from the Neolithic Age |
| House | Dawn | 30W | +5 population |
| Granary | Dawn | 80W | food drop-off |
| Lumber camp | Dawn | 80W | wood drop-off |
| Mining camp | Dawn | 80W | stone, gold and energy crystal drop-off |
| Farm | Dawn | 60W | food, one worker |
| Barracks | Dawn | 150W | infantry |
| Range | Dawn | 150W | ranged units |
| Academy | Neolithic | 175W 50S | technologies |
| Tower | Neolithic | 40W 120S | shoots enemies (attack 6, range 7) |
| Dock | Neolithic | 150W | fishing boats, warships, fish drop-off; naval maps only |
| Stable | Copper | 150W 50S | mounted units, later tanks and fighters |
| Workshop | Bronze | 200W 50G | siege engines and artillery |
| Generator | Industrial | 120W 80S 40G | produces energy (0.6 per second at first) |

Buildings change their names and look with the era. For example, the town centre is a Camp Fire in the stone era, a Keep in the Middle Ages, a City Hall in the industrial era and a Command Nexus in space. The academy goes from Shaman Hut to Monastery to Laboratory to Xeno Institute. The command buttons always show the current name.

### Energy

From the **Industrial Age** every new military unit costs some **energy**, and from the Machine Age so does every technology and every age advance. Energy comes from **generators** (each produces energy all the time, more in later ages and with *gather* technologies) and from **energy crystals** mined by workers and delivered to a mining camp. Build generators as soon as you reach the Industrial Age.

### A good opening (Dawn Age start)

You start with a town centre (Camp Fire), 3 gatherers and 200 food, 200 wood and 150 stone. Here is a simple, reliable opening:

1. Queue 3–4 gatherers at the town centre right away (50 food each).
2. Send two gatherers to the nearest berry bushes. If the bushes are not right next to the town centre, have one of them build a **granary** beside them first.
3. Let the third gatherer build a **house**, then a **lumber camp** at the nearest forest, and then chop wood.
4. Send new workers to food (berries and hunting) and wood, about 60/40 at first. Hunt deer with two workers. Gang up on boars and mammoths with four or more.
5. Keep the town centre training workers non-stop and build a house every time you are within about 3 of your population limit.
6. When the berries and animals run low, build farms around the granary or town centre.
7. With about 12–14 workers, save **500 food** and advance to the Neolithic Age. Meanwhile, put up a **barracks** or **range** in case of an early attack.

### How many workers?

There is no single right number. As a guide, the computer opponent aims for **14 + 3 × age** workers (at most 45): about 14 in the Dawn Age, 26 in the Iron Age and 44 in the Information Age. For your worker split, the computer aims for:

| Period | Food | Wood | Stone | Gold | Energy |
|---|---|---|---|---|---|
| Dawn and Neolithic | 50 % | 38 % | 12 % | — | — |
| Copper to Imperial | 45 % | 35 % | 10 % | 10 % | — |
| Industrial onwards | 42 % | 20 % | 8 % | 20 % | 10 % |

From the Renaissance on, armies cost much more gold and less food, so move workers to gold mines then. In any age, look at your stockpiles: if one resource piles up while another is always short, move a few workers over.

## The ages

### How to advance

Select your town centre (`H`) and click **Advance to …**. You must pay the full cost up front, and the advance then takes 40–95 seconds. While the town centre is advancing it works through its queue in order, so it trains no workers until the advance is done. A second town centre keeps worker production going. You can only advance one age at a time, and only up to the level's **final age**. In the last age of a level the button disappears.

When you advance:

- Every production building now trains the **new unit of its line**. Units you already have **keep their old stats**. They are not upgraded, so older units slowly fall behind.
- New buildings and technologies become available.
- Your buildings and units take on the new era's look, the music changes, and everyone gets a message that you advanced.

### All seventeen ages

| # | Age | Era | Advance cost | Time | Key unlocks |
|---|---|---|---|---|---|
| I | Dawn Age | stone | (start) | — | Gatherer, Clubman, Stone Thrower; town centre, houses, drop-offs, farms, barracks, range |
| II | Neolithic Age | stone | 500F | 40 s | academy, tower, dock; Spearman, Slinger; War Canoe; the town centre starts to shoot |
| III | Copper Age | bronze | 800F 200W | 50 s | **gold** comes into use; stable and Onager Rider; Axeman, Bowman; Galley |
| IV | Bronze Age | bronze | 1000F 300W 150S 100G | 60 s | workshop and Battering Ram; War Chariot (mounted archer); Composite Archer |
| V | Iron Age | iron | 1200F 400W 200S 200G | 60 s | Catapult (first ranged siege, area damage); Horseman, Iron Warrior, Iron Archer |
| VI | Classical Age | classical | 1400F 500W 300S 300G | 65 s | Hoplite, Toxotes, Cataphract, Ballista; Trireme |
| VII | Early Middle Ages | medieval | 1600F 600W 350S 400G | 70 s | Man-at-Arms, Crossbowman, Light Cavalry, Mangonel; Longship |
| VIII | High Middle Ages | medieval | 1800F 700W 400S 500G | 70 s | Dismounted Knight, Longbowman, Knight, Trebuchet; War Cog |
| IX | Renaissance | gunpowder | 2000F 800W 450S 600G | 75 s | gunpowder: Arquebusier, Pikeman, Cuirassier, Bombard; Carrack with cannon; armies paid mostly in gold |
| X | Imperial Age | gunpowder | 2200F 900W 500S 700G | 75 s | Grenadier (ranged infantry with area damage), Musketeer, Dragoon, Field Cannon; Ship of the Line |
| XI | Industrial Age | industrial | 2400F 1000W 500S 800G | 80 s | **energy** and generators; Fusilier, Rifleman, Lancer, Field Gun; Ironclad; faster workers |
| XII | Machine Age | industrial | 2600F 1000W 600S 900G 300E | 80 s | first tank (Landship Mk I), Machine Gunner, Howitzer, Battleship; technologies now cost energy |
| XIII | Atomic Age | modern | 2800F 1100W 600S 1000G 500E | 85 s | Battle Tank, Bazooka Team, Rocket Artillery, Destroyer |
| XIV | Information Age | modern | 3000F 1100W 700S 1100G 700E | 85 s | Main Battle Tank, Anti-Tank Team, Missile Launcher, Missile Cruiser |
| XV | Orbital Age | future | 3200F 1200W 700S 1200G 900E | 90 s | Hover Tank, Railgunner, Exo-Trooper, **Drone Carrier** (flying siege), Hover Frigate |
| XVI | Interplanetary Age | space | 3400F 1200W 800S 1300G 1200E | 90 s | **Starfighter** (flying), Void Marine, Plasma Gunner, Bombard Frigate (flying) |
| XVII | Interstellar Age | space | 3600F 1300W 800S 1400G 1500E | 95 s | Psi Templar, Ion Lancer, Void Interceptor, Void Dreadnought |

(F = food, W = wood, S = stone, G = gold, E = energy.)

### When to advance and when to fight

A unit from a newer age is always better value for money than an older one. It gains 30 % of its base hit points and attack per age, but its price only rises by about 22 %. Advancing is therefore usually right, but it is expensive and leaves you briefly without the resources for an army. Guidelines:

- **Advance when you are safe.** Before you click *Advance*, have enough soldiers or towers to stop the next attack. The computer attacks in waves, and the first wave comes early on harder difficulties.
- **Do not starve your army for an advance.** An army one age behind is not hopeless, but an empty barracks loses the game.
- **Advance after a won battle.** When you have just beaten a wave, the enemy needs time to rebuild. That is the best moment to spend your savings on the next age.
- **Advance objectives** ("be the first to reach …") are a race. Put almost everything into the economy and the advance, and only defend.

## Military

### The unit lines

There are five land lines. Each age brings a new unit in every available line, and a production building always trains the best unit of your current age.

| Line | Trained at | First appears | Examples through the ages |
|---|---|---|---|
| Workers | town centre | Dawn | Gatherer, Villager, Citizen, Peasant, Labourer, Worker, Engineer, Technician, Colonist |
| Infantry | barracks | Dawn | Clubman, Spearman, Hoplite, Man-at-Arms, Pikeman, Grenadier, Fusilier, Exo-Trooper, Psi Templar |
| Ranged | range | Dawn | Stone Thrower, Slinger, Bowman, Crossbowman, Longbowman, Arquebusier, Musketeer, Rifleman, Machine Gunner, Railgunner, Ion Lancer |
| Mounted | stable | Copper | Onager Rider, War Chariot, Horseman, Knight, Dragoon, Landship Mk I, Battle Tank, Hover Tank, Starfighter, Void Interceptor |
| Siege | workshop | Bronze | Battering Ram, Catapult, Trebuchet, Bombard, Field Cannon, Howitzer, Missile Launcher, Drone Carrier, Void Dreadnought |

Some special cases:

- **Infantry** fight in melee until the Renaissance. From the Imperial Age (Grenadier) they shoot from 3.5 tiles away, and the Grenadier's grenades also hit nearby enemies.
- **Ranged** units shoot from 5 tiles away, and from 5.5 tiles from the Renaissance.
- **Mounted** units are fast (1.7 against 1.0 for infantry) but use 2 population. The War Chariot and the Dragoon shoot from 4 tiles. From the Machine Age the mounted line becomes **tanks**, with range 5 and area damage.
- **Siege** units are slow, use 3 population, see far (8 tiles) and hit buildings very hard. The Battering Ram fights in melee. Every later siege engine shoots from 7 tiles but has a **minimum range of 2 tiles**: it backs off from enemies that get too close, so it needs an escort.
- **Area damage** (grenades, catapults, cannon, tanks, artillery, missiles, dreadnoughts and the later warships) deals half damage to every enemy near the point of impact. Do not bunch your units up against these.
- **Flying units** arrive late: the Drone Carrier (Orbital), the Starfighter and Bombard Frigate (Interplanetary), and the Void Interceptor and Void Dreadnought (Interstellar). They fly in straight lines over water, mountains and forests and are never blocked by other units. They can still be attacked like any other unit.

Every unit's tooltip on its train button shows its cost, hit points, attack, range and population.

### Counters: rock, paper, scissors

Damage is multiplied depending on who hits whom:

| Attacker | Strong against | Weak against |
|---|---|---|
| **Infantry** | mounted (×1.6), siege (×1.4) | ranged units, which deal ×1.4 to them |
| **Ranged** | infantry (×1.4) | mounted units, which deal ×1.6 to them; poor against buildings (×0.4) |
| **Mounted** | ranged (×1.6), siege (×1.8) | infantry, which deal ×1.6 to them |
| **Siege** | buildings (×3.5) | everything else (×0.7); mounted units deal ×1.8 to them |
| **Workers** | — | buildings (×0.3) |
| **Warships** | buildings (×1.3), boats (×1.2) | — |

In short: **spears beat horses, horses beat archers, archers beat infantry, siege beats buildings**, and cavalry hunts down siege. Mixed armies beat one-line armies.

**Armour** absorbs part of every hit: infantry 10 %, mounted 15 %, siege 25 %, buildings 50 %. Each *armour* technology adds 5 % for your military units, up to 80 % in total. Every hit does at least a little damage.

### Giving orders

- **Right-click an enemy** to attack it.
- **Attack-move** (`A`, then click the destination): the units walk there and fight every enemy they meet on the way. Use it for every advance into enemy land. A plain move order makes units ignore attackers until they arrive.
- Idle soldiers defend themselves and attack enemies that come into sight.
- **Rally points**: select a barracks (or any production building) and right-click the ground. New units walk there, so your army gathers in one spot.
- **Stop** (`S`) cancels the current orders. **Delete** (`Del`) removes the selected units at once, so be careful.

### Towers and the town centre

Towers (from the Neolithic Age, 40 wood and 120 stone) shoot at enemies within 7 tiles and see 9 tiles. Your town centre shoots too, from the Neolithic Age. Both grow stronger with every age and with *attack* technologies. Ranged units barely scratch buildings, so attack towers with **siege**, or with infantry and mounted units if you have no siege yet.

### Naval units

On coastal, riverland and lakes maps (and other maps with enough water) the dock trains two lines:

- **Fishing boats**: Dugout, Fishing Boat, Fishing Ship, Fishing Sloop, Trawler, Factory Trawler and Aqua Drone. They gather fish.
- **Warships**: War Canoe (Neolithic), Galley, War Galley, Bireme, Trireme, Longship, War Cog, Carrack, Ship of the Line, Ironclad, Battleship, Destroyer, Missile Cruiser and Hover Frigate (Orbital, the last new warship). From the Carrack (Renaissance) on, their guns deal area damage.

Warships shoot from 5.5 tiles, deal ×1.3 to buildings and ×1.2 to other boats, and use 2 population. Boats sail on water and fords only. Land units cannot enter water. A player with **only ships left is defeated**, so a fleet cannot save a lost war on land. Moon, Mars and space maps have no boats, and neither do desert maps.

## Technologies

### The academy and the four lines

Technologies are researched at the **academy**, which you can build from the Neolithic Age. In every age there is one technology in each of four lines:

| Line | Effect of each technology |
|---|---|
| **Gathering** (Flint Knapping … Matter Compilers) | +15 % gathering speed, also for generators |
| **Attack** (Fire-Hardened Points … Antimatter Warheads) | +10 % attack for military units and buildings |
| **Armour** (Hide Coats … Phase Shields) | +5 % armour for military units |
| **Hit points** (Herbal Lore … Bio-Uploading) | +10 % hit points for all your units and buildings, including existing ones |

Every technology also makes workers 3 % faster. That makes 68 technologies in total (4 lines × 17 ages). Each can be researched once, from its age on, so if you start late you can still catch up on older ones. For example, the four Dawn Age technologies can be researched as soon as you have an academy in the Neolithic Age. Research takes 25 seconds plus 2 seconds per age of the technology. From the Machine Age technologies also cost energy.

The academy shows the **next available technology of each line** as a button. You can queue several in a row, and several academies can research at the same time.

### Map technologies

Eight extra technologies only exist on certain map types:

| Technology | From age | Cost | Effect | Map types |
|---|---|---|---|---|
| Irrigation | Neolithic | 150F 150W | +50 % farm yield | desert, riverland |
| Terrace Farming | Copper | 150F 200W 50S | +25 % farm yield | highland |
| Fishing Nets | Copper | 100F 150W 50G | +30 % fishing speed | coastal, riverland, lakes |
| Deep Mining | Bronze | 150F 200W 100G | +30 % stone and gold mining | highland, desert |
| Navigation | Iron | 200F 250W 150G | +20 % warship attack and boat hit points | coastal, riverland, lakes |
| Caravans | Iron | 200F 100W 150G | +10 % gathering for all resources | desert, inland |
| Qanats | Classical | 300F 200W 200S 100G | +40 % farm yield | desert |
| Steam Ships | Industrial | 300F 300W 300G 100E | +25 % warship attack and boat hit points | coastal, riverland, lakes |

Farm technologies affect farms built afterwards. Navigation and Steam Ships also improve boats that are already afloat.

### The tech tree screen

Press `F2` or `Y`, or click **Tech Tree** in the top bar, to see **your own** tech tree. It has one column per age of the level, with rows for the age advance, the buildings, every unit line (including warships and fishing boats on naval maps) and every technology line. Each cell is coloured by status: **Done**, **Available now**, **In progress** (with a progress bar), **Later age** and **Not on this map**. Hover over a cell for details and cost. **Click an available technology to research it** at your least busy academy. The header shows how many technologies you have researched and warns you if you have no academy yet. `Esc` closes the screen.

## Maps

### Map types

| Map type | Terrain | Economy | Boats | Extra technologies |
|---|---|---|---|---|
| **Inland** | lakes and hills | normal | docks only if the map has enough water, no fish | Caravans |
| **Coastal** | an ocean along one side; starts pushed inland | normal | yes, fish along the shore | Fishing Nets, Navigation, Steam Ships |
| **Riverland** | a river through the centre with sandy banks and fords | farms +15 % | yes | Irrigation, Fishing Nets, Navigation, Steam Ships |
| **Lakes** | many large lakes, no river | normal | yes | Fishing Nets, Navigation, Steam Ships |
| **Desert** | sand, small oases, few trees and animals, richer mines | farms −40 % | never | Irrigation, Qanats, Deep Mining, Caravans |
| **Highland** | mountain ranges, little water, richer mines | normal | if there is enough water | Terrace Farming, Deep Mining |

There are seven **themes**: temperate, desert, winter, tropical, moon, mars and space. The theme changes the look of the map. Moon, Mars and space maps never have boats, because their "water" is void.

How the map type changes your plan:

- **Coastal, riverland, lakes**: fish are a rich food source, so build a dock early. Warships can raid shoreline buildings and fishing boats, so control the water or protect your shore with towers. Rivers are crossed at fords, which are natural choke points.
- **Desert**: farms give only 60 %, so research **Irrigation** as soon as you reach the Neolithic Age (and **Qanats** later), and use the rich mines (Deep Mining). Wood is scarce, so guard your trees.
- **Highland**: mountains create passes and choke points that towers can hold. Terrace Farming and Deep Mining help.
- **Inland**: a classic land war. Caravans give +10 % gathering.

### Map sizes

You can choose a map size whenever you start a game: in the campaign screen (default: the chapter's own size), in skirmish (default: Normal) and when you create a lobby battle.

| Size | Mini | Tiny | Small | Normal | Large | Very large | Huge | Enormous |
|---|---|---|---|---|---|---|---|---|
| Tiles per side | 48 | 64 | 80 | 112 | 144 | 176 | 208 | 256 |

Resources and forests grow with the area, but every player gets the same starting resources on every size. Generated maps give every start the same personal resources nearby and always leave a passable route between all starts. Extra resources are contested in the middle.

- **Small maps** mean early contact and rushes. Defend early.
- **Large maps** mean long build-ups, scouting, expansion with extra town centres and naval play.
- Hand-drawn custom maps keep their own size.

## Tactics and strategy

### Scouting

You cannot fight what you cannot see. Early on, send one soldier (a fast mounted unit from the Copper Age) to find the enemy town centre and see what they are building. Many archers? Train cavalry. Many cavalry? Train spears (infantry). Keep a unit near likely attack routes as an early warning.

### Three basic plans

- **Rush**: build a barracks or range early and attack with a small army before the enemy is ready. It is strongest on small maps and against easy opponents. If the rush fails you are behind in economy, so aim at enemy workers, not at the town centre, which shoots back from the Neolithic Age.
- **Boom**: put everything into workers, drop-offs, farms and a second town centre, then advance quickly and win with better units. It is strongest on large maps. It is risky against early waves, so keep a few defenders and a tower.
- **Turtle**: towers, a defended town centre and a compact base, then a strong late army. It is good for **Survive** objectives and against fast attackers. Remember that siege engines destroy towers easily.

Most good games mix all three: defend the first waves cheaply, boom while the enemy rebuilds, then attack with a mixed, up-to-date army.

### Defending

- Train soldiers *before* the first expected wave. On normal difficulty the computer can attack from minute 4, on insane from minute 2.5.
- Fight near your **town centre and towers**: they shoot at attackers for free.
- Use counters. Look at what is coming (`Space` jumps to the alert) and train the counter.
- Pull workers away from raiders. Send them back once the area is safe.
- The computer attacks in **waves**. It gathers its army half-way, then strikes. When a wave is beaten it retreats to regroup, and the next wave is two units larger. Use the pause after a beaten wave to advance or expand.

### Attacking

- Always **attack-move** (`A`) into enemy territory.
- Bring **siege** for towers and the town centre, escorted by infantry and mounted units, because siege engines cannot shoot enemies right next to them.
- Kill **workers and drop-off camps** first when you raid. It hurts the enemy economy more than killing soldiers.
- Remember the win condition: you must destroy **every land unit and every building except houses and farms**. Hunt down hidden workers and outlying camps. Ships alone do not count.
- Set **rally points** near the front so that reinforcements join the fight without you sending each one by hand.

### Timing attacks

The best time to attack is just after you advance and before the enemy does. Your new units then outclass theirs. The worst time is while you are paying for an advance yourself. The players' list next to the top bar shows every player's age, so you can see who is ahead.

### Naval control

On water maps, fishing boats are an easy economy boost but also easy prey. Keep a few warships near your fishing grounds, and use warships to hit enemy shore buildings (×1.3 against buildings). Land armies decide the game, though: a player with only ships left is defeated.

### The late game

From the Industrial Age energy limits your army, so keep building generators. From the Orbital Age flying units ignore terrain: tower lines and mountain or river choke points no longer hold, and an attack can come from any side. Keep a mobile defence force at home. In long games the computer is content to attack with ever smaller armies after minute 40, so the game does not stall.

### Tips per difficulty

- **Super easy and easy**: the computer is slow and attacks late (minute 12 and minute 7). Learn the economy, practise booming and advance often. Super easy does not even react when you raid it.
- **Normal**: the computer plays at your speed and attacks from minute 4. A balanced opening with an early barracks is enough.
- **Hard**: 30 % faster, first wave from minute 3.5. Scout, build towers and keep producing soldiers non-stop.
- **Super hard**: 60 % faster and gets free resources. Defend at your town centre, use counters carefully and only advance after beating a wave.
- **Insane**: twice as fast, free resources and it **sees the whole map**. Surprise attacks will not work. A tight economy, constant production and perfect counters are needed.

## Playing with the right balance

### Economy, army and research

A healthy empire spends on three things at once:

1. **Economy**: never stop training workers until you have about the number the computer aims for (14 + 3 × age, up to 45). An idle town centre is the most common mistake. Use `.` to find idle workers.
2. **Army**: keep a standing army large enough to beat the next wave, and keep production buildings busy. Do not let resources pile up. A stockpile of 2,000 food does not fight.
3. **Research and ages**: after the army, spend on the age advance and on the gather and attack technologies of your age. Gather technologies pay for themselves quickly. The hit-point technologies even strengthen units you already have.

A simple rhythm per age: **workers, then defence, then the advance**, with technologies in between whenever the academy is idle.

### Resource planning per age

- **Dawn and Neolithic**: food and wood. Food pays for workers and the first two advances (500 food, then 800 food and 200 wood).
- **Copper to Imperial**: gold and stone appear in every advance and in many units. Put a few workers on each mine early, so the advance is not held up by 100 gold.
- **Renaissance onwards**: armies cost more gold than food. Move workers from farms to gold.
- **Industrial onwards**: energy for every military unit, and from the Machine Age for technologies and advances. Build several generators and mine crystals.

### Population planning

Late armies are smaller but heavier, because mounted units take 2 population, siege engines 3 and the cap is 200. Plan to keep about a third to a half of your population as workers. Build houses in batches (`Shift`+click places several), so the limit never stops your production.

### Choosing a difficulty

| Difficulty | Speed of the computer's economy, building and training | Army size before the first wave | First wave not before | Free resources | Sees |
|---|---|---|---|---|---|
| Super easy | 55 % | 20 + age/2 | minute 12 | none | only what its units see (does not react to raids) |
| Easy | 75 % | 14 + age/2 | minute 7 | none | only what its units see |
| Normal | 100 % | 10 + age/2 | minute 4 | none | only what its units see |
| Hard | 130 % | 8 + age/2 | minute 3.5 | none | only what its units see |
| Super hard | 160 % | 7 + age/2 | minute 3 | 0.3 of each resource per second | only what its units see |
| Insane | 200 % | 6 + age/2 | minute 2.5 | 0.8 of each resource per second | **the whole map** |

The computer plays by the same rules as you. It pays for everything and obeys the population cap. Energy is only handed out free from the Industrial Age. Each wave raises the size of the next one by two. Once every enemy town centre has fallen, all its soldiers join in to finish the game.

### Adjusting the challenge yourself

Besides the difficulty, you can tune a game with these settings:

- **Map size**: smaller maps are harder against aggressive opponents (less time to prepare). Larger maps give a booming player more room.
- **Number of opponents**: in skirmish you can face 1, 2, 3, 5 or 7 computers. In quick games they are all allied against you.
- **Start and final age**: a later start age gives everyone more starting resources and workers (5 workers from the Classical Age, and a soldier from the Bronze Age). A short age range (for example Dawn to Iron) gives a quick game. A long range gives an epic one.
- **Water**: more water in skirmish means more naval play.
- **Mixed teams** in the multiplayer lobby: team up with a friend against several computers, or give a weaker player a computer ally.

## Game modes and options

### Campaign

Seventeen chapters lead through history and beyond. Each chapter starts in one age and lets you advance to the next (the last one stays in the Interstellar Age). All computer opponents in a chapter are allied against you. Before clicking a chapter you can change its **Difficulty** ("Level default" keeps the chapter's own) and its **Map size** ("Chapter default" keeps the size below).

| # | Chapter | Theme | Map type | Ages | Size | Objective | Opponents | Difficulty |
|---|---|---|---|---|---|---|---|---|
| 1 | The First Fire | temperate | inland | Dawn → Neolithic | 84 | Conquest | 1 | easy |
| 2 | Valley of Plenty | temperate | riverland | Neolithic → Copper | 88 | Advance first | 1 | easy |
| 3 | Gift of the River | desert | riverland | Copper → Bronze | 96 | Conquest | 2 | easy |
| 4 | The Sea Peoples | tropical | coastal | Bronze → Iron | 96 | Survive 15 min | 2 | normal |
| 5 | Iron and Ice | winter | coastal | Iron → Classical | 104 | Conquest | 1 | normal |
| 6 | Phalanx | desert | coastal | Classical → Early Middle | 104 | Conquest | 1 | normal |
| 7 | Shield Wall | temperate | riverland | Early Middle → High Middle | 108 | Conquest | 2 | normal |
| 8 | Lords of the Lowlands | temperate | coastal | High Middle → Renaissance | 112 | Conquest | 2 | normal |
| 9 | Pike and Shot | temperate | inland | Renaissance → Imperial | 112 | Conquest | 1 | hard |
| 10 | A New World | tropical | coastal | Imperial → Industrial | 120 | Conquest | 2 | normal |
| 11 | The Iron Horse | temperate | inland | Industrial → Machine | 120 | Conquest | 2 | normal |
| 12 | No Man's Land | winter | inland | Machine → Atomic | 120 | Survive 20 min | 2 | hard |
| 13 | Iron Curtain | winter | lakes | Atomic → Information | 132 | Conquest | 3 | normal |
| 14 | Silicon Frontier | desert | desert | Information → Orbital | 132 | Conquest | 2 | hard |
| 15 | Sea of Tranquility | moon | inland | Orbital → Interplanetary | 128 | Conquest | 2 | hard |
| 16 | Red Planet | mars | inland | Interplanetary → Interstellar | 136 | Conquest | 2 | hard |
| 17 | Battle for the Stars | space | inland | Interstellar | 144 | Conquest | 3 | hard |

**Progressing through the campaign.** All chapters can be played in any order. Nothing is locked, so you can jump straight to the gunpowder era if you like. For registered players, the highest chapter they have won is recorded (shown as *Campaign N/17*), and completed chapters are marked on the campaign screen. Every chapter starts fresh with that chapter's own starting age, resources and workers, so nothing carries over between chapters. Playing them in order teaches the game step by step, because each chapter introduces the next age.

Hints for some chapters:

- **2 Valley of Plenty** is a race to the Copper Age (800 food, 200 wood). Boom hard and defend only as much as needed.
- **4 The Sea Peoples** and **12 No Man's Land** are survival chapters. Build towers, stay close to your town centre and simply outlast the attackers.
- **6 Phalanx** and **14 Silicon Frontier** are on dry maps with weak farms, so look for Irrigation or Qanats where the map type offers them.
- **11 The Iron Horse** introduces energy. Build generators right away.
- **15–17** are fought on the Moon, on Mars and in space: no boats, and flying units arrive.

### Skirmish vs Computer

Choose **Skirmish vs Computer** and set:

| Option | Choices |
|---|---|
| Map | *Random map*, any campaign map, or any player-made map |
| Theme | temperate, desert, winter, tropical, moon, mars, space (random maps) |
| Map type | inland, coastal, riverland, lakes, desert, highland (random maps) |
| Map size | Mini to Enormous (default Normal) |
| Water | slider for the amount of water (random maps) |
| Start age / Final age | any of the 17 ages (the final age is never earlier than the start) |
| Opponents | 1, 2, 3, 5 or 7 |
| Difficulty | Super easy to Insane (default Normal) |

Random-map skirmishes are always **conquest** games. On a campaign or player-made map the map's own objective and ages apply, and the number of opponents is limited by its start positions (campaign maps have 4 seats, so at most 3 opponents). All computer opponents in a skirmish are allied against you.

### Multiplayer

**Multiplayer** opens the lobby:

- **Battles**: the list of open and running battles with map, size, host and number of players. Click **Join** to take a free seat.
- **Create** a battle: choose a map (*Random map*, a campaign map or a player-made map), optionally a map size, and a name, then click **Create**. A random lobby map is a temperate map from the Dawn Age to the Classical Age with four seats.
- **Lords online**: everyone signed in. Click a name to start a whisper.
- **Chat**: the global chat (the last 50 messages are kept). Type `/w name message` to **whisper** privately.

In the **battle room** the host sets up every seat:

- **Seat**: *Open* (waiting for a player), *Computer* (with its own difficulty) or *Closed*.
- **Team**: Team 1 to Team 8. Every player can change their own team. Players with the same team number are allies and share vision.
- **Start Battle** (host only) needs at least two players and at least two different teams.
- The room has its own chat, with **All** and **Team** channels.

Seats are coloured Blue, Red, Yellow, Green, Cyan, Purple, Orange and White, with up to 8 seats depending on the map. If you lose your connection during a battle, your seat is kept. Sign in again and you are put straight back into the running game. Choosing *Leave to Menu* during a battle **resigns**.

### Saving and restoring

Registered players can save a running game:

- **Game menu (`F10`), then Save Game**: choose a name.
- **`Ctrl+S`**: quick save, named after the level and game time.

**Load Game** in the main menu lists your saves with level, age, game time, players and date. **Resume** reopens the game exactly as it was (same age, army, buildings and stockpiles) in a new battle room: your seat is restored, other human seats are open for anyone to join, and seats nobody takes are played by the computer. **Delete** removes a save. A server allows up to 20 saves per player by default.

### The game menu

`F10` or the **Menu** button opens: **Resume**, **Save Game** (registered players), **Tech Tree (F2)**, **Keyboard Shortcuts (?)**, **Manual & FAQ (F4)**, **Settings**, **Resign** (asks first) and **Leave to Menu**. The game does not pause while the menu is open.

### Hall of Fame

The **Hall of Fame** shows the **Greatest Lords** (the top 25 by wins, then best score, with games played and campaign progress) and the **High Scores** (the top 25 scores, for all levels or for one chosen level). Only registered players' games are recorded. Guests and players flagged for cheating are not.

### Demo mode

If nobody touches the menu for a few minutes (3 by default), the game starts a **demo**: a self-playing match between computer opponents with an automatic camera that follows the action. A **DEMO** banner shows the map's name. Press any key or click to return to the menu.

### Settings

**Settings** (from the main menu or the game menu) has sliders for **Master volume**, **Effects** and **Music**, and a **Mute all** box (`Shift+M` toggles mute in a game). Your browser remembers these settings. Registered players also find **Account security** here.

### Level editor

**Level Editor** in the main menu opens a map editor that uses the game's own graphics. You can paint terrain (grass, dirt, sand, water, mountain, ford, road), place trees, berries, gold, stone, crystals, fish and animals, set 2–8 start positions and choose the name, theme, start and final age, objective (conquest, survive 1–120 minutes, advance first), map type, default difficulty and starting resources. **Generate** makes a random map, and **Open** loads a campaign map as a template. Anyone can download and upload levels as files. Saving to the server and **Playtest** need a registered account. Saved levels appear as *player-made maps* in skirmish and in the lobby.

Editor keys: `1`–`7` terrain, `Shift+1`–`9` objects, `E` or `Del` eraser, `P` start-position tool, `[` / `]` brush size, `G` grid, `N` new level, `Ctrl+Z` undo, `Ctrl+S` save to server, right-drag or arrow keys to pan, wheel or `+`/`−` to zoom (`0` resets), `?` / `F1` help.

> Tip: for a fair multiplayer map, give every start the same berries, trees, gold and stone nearby, and make sure all starts are connected by land. The editor does not carve passes for you.

### Security

In **Settings, Account security**, registered players can **enable an authenticator (MFA)**. Add the shown key or setup link to an authenticator app, then enter the 6-digit code. From then on, signing in also asks for the current code. You can disable it there again with a valid code, unless the administrator requires MFA for your account. Never share your password or codes. The game never asks for them in chat.

The server checks every command. Players whose behaviour looks like cheating (seeing through the fog, impossible commands or inhuman action rates) are warned, removed from the game and reported. Their results are not recorded.

## Troubleshooting

- **"Not enough resources"**: the cost is shown in the button's tooltip. Check which resource is short.
- **A unit will not start training**: you are at your population limit. Build a house.
- **"Cannot build there"**: the spot is unexplored, blocked, or on water, mountain or a ford. Docks must touch water on two edge tiles.
- **A button is greyed out with "Requires … Age"**: advance first.
- **No sound**: check *Settings* and `Shift+M`. Browsers only allow sound after your first click or key press.
- **Disconnected**: reload the page and sign in again. A running battle is rejoined automatically.

More answers are in the [FAQ](faq.md#technical-and-troubleshooting).
