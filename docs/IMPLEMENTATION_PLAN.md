# Raxi: Implementation Plan

> **Raxi** is a roguelike arcade taxi game. Each run is one **shift**. You start with a basic cab and no powers. You pick up and deliver passengers before the shift timer runs out. After every **3 deliveries** you choose **1 of 3 powers**, like Slay the Spire's card and relic drafts. When the timer reaches zero the shift ends and you get a score.
>
> Driving should feel like **Crazy Taxi + GTA V arcade handling**. The visuals should look like a **2012-era low-poly 3D** game.

This document is the full spec for the implementing agent. Follow the milestones in order. Each milestone ends with a playable build and has acceptance criteria.

---

## 1. Platform decision: **Browser (WebGL2), packaged to a Windows .exe later**

| Option | Pros | Cons |
|---|---|---|
| **Browser: TypeScript + Three.js + Rapier (chosen)** | No install, instant sharing (itch.io / GitHub Pages). Everything is plain code with no editor scene files, which suits AI implementation. The Gamepad API is standard, so controller support is easy later. 2012-level graphics run well in WebGL2. Can be wrapped as a Windows .exe with **Tauri** or **Electron** without code changes. | No built-in editor. Some browser performance overhead (fine for this art style). |
| Godot 4 → Windows exe | Real engine, good tooling | Editor-centric `.tscn`/`.tres` workflow is error-prone for an AI working text-only. Harder to test headlessly. |
| Unity / Unreal | Powerful | Heavy, licensing, binary assets, overkill for the art style |

**Decision:** Build a browser game first. In milestone M9, add a Tauri build target to produce `Raxi.exe` for Windows.

### Tech stack
- **Language:** TypeScript (strict mode)
- **Build/dev:** Vite
- **Rendering:** Three.js (latest stable, WebGL2 renderer)
- **Physics:** `@dimforge/rapier3d-compat` (WASM, deterministic, fast)
- **UI / HUD / menus:** Plain HTML + CSS overlay over the canvas (no React). A small `UIManager` swaps screens.
- **Audio:** Web Audio API, wrapped in an `AudioManager`. `howler.js` is allowed if convenient.
- **Debug tuning:** `lil-gui`, shown only with the `?debug` URL flag
- **Tests:** Vitest for pure logic. Optional Playwright smoke test.
- **Lint/format:** ESLint + Prettier
- **Packaging (M9):** `vite build` → static site. Tauri v2 → Windows `.exe`.

### Performance targets ("not graphically demanding")
- 60 FPS at 1080p on an Intel Iris Xe / GTX 1050-class GPU
- Fewer than **300 draw calls** and fewer than **500k triangles** in view
- Initial load under 5 s, with no large asset downloads (mostly procedural geometry)
- Quality presets: Low (no shadows, 0.75 resolution scale), Medium, High

---

## 2. Project structure

```
raxi/
├─ index.html
├─ package.json / tsconfig.json / vite.config.ts
├─ public/
│  ├─ audio/            # CC0 sfx + music loops
│  └─ textures/         # small atlases (optional, most textures are canvas-generated)
├─ src/
│  ├─ main.ts                 # bootstrap: renderer, physics init, Game
│  ├─ core/
│  │  ├─ Game.ts              # top-level state machine + main loop
│  │  ├─ Loop.ts              # fixed timestep (60 Hz physics) + render interpolation
│  │  ├─ EventBus.ts          # typed pub/sub (GameEvents map)
│  │  ├─ Rng.ts               # seeded RNG (mulberry32 / sfc32)
│  │  └─ config/
│  │     ├─ balance.ts        # ALL gameplay numbers (timer, scoring, difficulty)
│  │     ├─ vehicle.ts        # car tuning presets
│  │     └─ graphics.ts       # quality presets
│  ├─ input/
│  │  ├─ Actions.ts           # action enum + InputState shape
│  │  ├─ InputManager.ts      # merges devices -> InputState each frame
│  │  ├─ KeyboardDevice.ts
│  │  ├─ GamepadDevice.ts     # stub in MVP, implemented in M10
│  │  └─ bindings.ts          # default bindings, (later) rebinding + persistence
│  ├─ physics/
│  │  ├─ PhysicsWorld.ts      # Rapier world wrapper, collision groups, contact events
│  │  └─ collisionGroups.ts
│  ├─ vehicle/
│  │  ├─ ArcadeVehicle.ts     # raycast-wheel arcade car controller
│  │  ├─ VehicleStats.ts      # base stats + modifier stack -> final stats
│  │  ├─ VehicleVisual.ts     # mesh, wheel spin/steer, body roll, lights
│  │  └─ DriftDetector.ts     # slip angle, airtime, two-wheel, spins
│  ├─ camera/ChaseCamera.ts
│  ├─ world/
│  │  ├─ mapData.ts           # hand-authored road graph, districts, landmarks
│  │  ├─ RoadGraph.ts         # nodes/edges/lanes, A* pathfinding, nearest-point queries
│  │  ├─ CityBuilder.ts       # deterministic generation of meshes + colliders
│  │  ├─ Terrain.ts           # outskirts heightmap (roads flattened)
│  │  ├─ Chunks.ts            # merged geometry per chunk, culling
│  │  ├─ Props.ts             # instanced lamps, trees, hydrants, benches
│  │  └─ textures/            # canvas texture generators (windows, asphalt, etc.)
│  ├─ traffic/
│  │  ├─ TrafficManager.ts    # spawn/despawn pool around player
│  │  ├─ TrafficCar.ts        # lane following, braking, knocked state
│  │  ├─ TrafficLights.ts
│  │  └─ Pedestrians.ts       # simple walkers, dive-away AI, explosion on impact
│  ├─ gameplay/
│  │  ├─ Shift.ts             # run state: timer, score, tier, deliveries
│  │  ├─ ShiftTimer.ts
│  │  ├─ PassengerSpawner.ts
│  │  ├─ Passenger.ts         # types, weights, patience
│  │  ├─ Fare.ts              # active ride: route length, par time, live ratings
│  │  ├─ StyleTracker.ts      # style points, combos
│  │  ├─ SafetyTracker.ts     # penalties
│  │  ├─ RulesTracker.ts      # traffic-rule violations: red light, no blinker, speeding, wrong lane
│  │  ├─ CarCondition.ts      # car health 0-100%, damage sources, performance penalty
│  │  ├─ Wallet.ts            # spendable cash (separate from score)
│  │  ├─ BreakMode.ts         # pause-for-shop mode (timer frozen, passengers hidden)
│  │  ├─ Scoring.ts           # pure functions: grade, time bonus, cash
│  │  └─ Difficulty.ts        # tier scaling
│  ├─ shop/
│  │  ├─ Shop.ts              # purchase logic: buy power, repair, cleanse curse, reroll
│  │  ├─ ShopStock.ts         # seeded stock generation, regenerated after every delivery
│  │  └─ Pricing.ts           # pure price functions
│  ├─ powers/
│  │  ├─ PowerTypes.ts        # PowerDef, rarity, tags, hooks
│  │  ├─ powers/              # one file per category: stats.ts, triggers.ts, actives.ts, cursed.ts
│  │  ├─ PowerRegistry.ts
│  │  ├─ PowerManager.ts      # owned powers, stacks, hook dispatch, active slots
│  │  ├─ StatSystem.ts        # StatKey -> (base + Σadd) × Π(mul)
│  │  └─ Draft.ts             # weighted card offering
│  ├─ ui/
│  │  ├─ UIManager.ts
│  │  ├─ screens/             # MainMenu, Pause, Draft, Shop, ShiftOver, Settings, HowToPlay
│  │  ├─ hud/                 # Timer, Score, FarePanel, NavArrow, Minimap, Speedo, Popups, Abilities
│  │  └─ styles.css
│  ├─ audio/AudioManager.ts, EngineSound.ts
│  ├─ fx/                     # tire smoke, sparks, skid marks, speed lines, camera shake
│  ├─ save/Storage.ts         # localStorage: highscores, settings
│  └─ debug/                  # debug panel, physics debug draw, cheats
└─ tests/                     # vitest specs for Scoring, StatSystem, Draft, RoadGraph, Rng
```

**Rules for the implementer**
- Keep gameplay logic (scoring, powers, timer, draft, pathfinding) **pure and testable**, with no Three.js imports.
- Keep all tunable numbers in `src/core/config/*`. Do not hard-code magic numbers in systems.
- Systems talk to each other through the typed `EventBus` (e.g. `fare:pickup`, `fare:delivered`, `style:drift`, `safety:collision`, `draft:open`), so powers can hook into anything.
- Use the seeded RNG for anything random in a run (passenger spawns, draft offers). Show the seed on the Shift Over screen.

---

## 3. Core architecture

### 3.1 Game state machine
```
Boot → MainMenu → ShiftIntro (3-2-1) → Driving ⇄ Paused
                                        Driving → Draft (paused world) → Driving
                                        Driving (no passenger on board) → Break (timer frozen, free roam)
                                        Break → Shop (inside a garage zone, world paused) → Break
                                        Break → Driving ("Back to work", 1 s countdown)
                                        Driving → ShiftEnding (car coasts, 2 s) → ShiftOver → MainMenu / Restart
```

### 3.2 Main loop
- Fixed physics step of **1/60 s** using an accumulator, capped at 5 steps per frame.
- Order per step: `Input → Powers(tick) → Vehicle → Traffic → Physics.step → Contacts → Gameplay(Shift/Fare/Trackers) → Timer`.
- Render each frame with interpolated transforms. Update the camera, HUD and FX per render frame.
- While in Draft/Paused/Shop, stop physics and timers. In **Break** physics keeps running but all shift timers are frozen (see 8.5). Keep rendering (blurred/dimmed background).

### 3.3 Collision groups
`PLAYER, TRAFFIC, STATIC_WORLD, PROPS_BREAKABLE, PEDESTRIAN (sensor, reports overlap with PLAYER), ZONE_SENSOR, GROUND`. Pickup/drop-off/garage zones are sensor colliders. Turn on CCD for the player car.

---

## 4. Input (keyboard now, controller-ready)

Gameplay code reads only **actions**, never keys. Each device produces a partial `InputState`. `InputManager` merges them by taking the largest absolute value.

```ts
interface InputState {
  throttle: number;   // 0..1
  brake: number;      // 0..1 (brake, then reverse when nearly stopped)
  steer: number;      // -1..1
  handbrake: boolean;
  boost: boolean;     // nitro, if owned
  ability1: boolean;  // active power slot 1
  ability2: boolean;  // active power slot 2
  horn: boolean;
  indicatorLeft: boolean;   // toggles left blinker (edge-triggered)
  indicatorRight: boolean;  // toggles right blinker (edge-triggered)
  shopBreak: boolean;       // start/end Break mode (only without passenger on board)
  lookBack: boolean;
  resetCar: boolean;  // flips upright, costs time
  pause: boolean;
  // menu nav (edge-triggered)
  uiUp, uiDown, uiLeft, uiRight, uiConfirm, uiBack: boolean;
}
```

| Action | Keyboard (default) | Future gamepad (standard mapping) |
|---|---|---|
| Throttle | W / ↑ | RT |
| Brake / reverse | S / ↓ | LT |
| Steer | A D / ← → | Left stick X |
| Handbrake (drift) | Space | A / Cross |
| Boost | Left Shift | B / Circle |
| Ability 1 / 2 | Q / E | X / Y (or LB / RB) |
| Horn | H | L3 |
| Look back | C | R3 |
| Left / right blinker | Z / X | D-pad left / right |
| Start / end shop break | B | D-pad up |
| Reset car | R (hold 1 s) | Back/View (hold) |
| Pause | Esc / P | Start |
| Draft card select | 1 / 2 / 3, or ←/→ + Enter | D-pad + A |

- Keyboard steering is **digital → analog smoothed**: ramp at about 6/s, return to center at about 10/s. Steering ramps faster when reversing direction.
- `GamepadDevice` (M10): poll `navigator.getGamepads()`, apply a dead zone of 0.15 with a radial curve, rumble via `vibrationActuator` on crashes. In M1, create the class as a stub that returns an empty state so the architecture is in place.
- UI screens must be fully navigable with the `ui*` actions (not mouse-only), so gamepad support works automatically.

---

## 5. Vehicle: arcade handling (GTA V-like)

### 5.1 Approach
Use a **custom raycast-wheel controller** on a Rapier dynamic rigid body. It is fully tunable and gives arcade behavior. Rapier's `DynamicRayCastVehicleController` may be used as a base **only if** it meets the feel targets in 5.3.

Chassis: box collider of about 1.9 × 1.4 × 4.4 m, mass 1200 kg, **center of mass lowered** by about 0.4 m, angular damping around 2.

Per wheel (4 wheels), each physics step:
1. **Suspension:** raycast down from the wheel mount (rest length 0.5 m). Spring force `k·compression − c·compressionVelocity`, applied at the mount point.
2. **Longitudinal:** apply engine force at the driven wheels (RWD or AWD, depending on the cab). The force follows a curve that fades out near top speed. Apply brake force against velocity. Below about 1 m/s with the brake held, switch to reverse (top speed 12 m/s).
3. **Lateral grip:** compute the lateral velocity at the contact point. Apply an impulse cancelling `grip × lateralVel` (grip 0..1 per step). With the **handbrake**, cut rear grip to about 35%. The rear slides out and the player drifts.
4. **Steering:** the max steer angle depends on speed, from 35° at 0 km/h down to 8° at top speed. Steering eases toward the target angle.

Arcade assists (all tunable):
- **Downforce** proportional to v², which keeps the car planted at high speed.
- **Anti-roll torque** and a strong **self-righting torque** when roll exceeds 50°. If the car stays upside down for more than 2 s, auto-reset it (with a safety penalty).
- **Air control:** while airborne, small pitch and yaw torque from steer/throttle. Gravity × 1.6 while airborne for snappy jumps.
- **Drift assist:** while drifting, add a small yaw stabilization so drifts are controllable and long (Crazy Taxi / GTA feel). Throttle during a drift keeps it going.
- **Collision response:** clamp the angular impulse from traffic hits so the car rarely spins out from small taps.

### 5.2 Base stats (starting cab: "Yellow Classic")
| Stat | Value |
|---|---|
| Top speed | 45 m/s (≈160 km/h) |
| 0–100 km/h | ~3.5 s |
| Braking 100→0 | ~2.5 s |
| Grip | 0.85 |
| Handbrake rear grip | 0.35 |
| Boost (when owned) | +40% engine force, top speed +15% |

These stats go through `StatSystem`, so powers can modify them.

### 5.3 Feel acceptance criteria (M1)
- Car never feels "floaty". It lands from a 3 m ramp without bouncing more than once.
- A 90° turn at 60 km/h without braking works with steering only.
- Handbrake at 80 km/h + steer produces a controllable drift lasting 2 s or more, with recovery by counter-steering or releasing.
- Car doesn't flip on curbs or in normal cornering. It only flips in big crashes or bad landings.
- From any normal speed, a 180° handbrake turn is possible.
- Hitting a traffic car at 100 km/h is dramatic (the traffic car goes flying) but the player keeps control.

### 5.4 Visual feedback
Body roll and pitch on the visual mesh (exaggerated, not physical), wheel spin and steer, brake lights, tire smoke while slipping, skid marks (pooled decal ribbons), sparks on wall scrapes, FOV kick and speed lines while boosting.

### 5.5 Camera (`ChaseCamera`)
- Spring-damped follow behind and above the car (about 6.5 m back, 2.5 m up). Looks a little ahead of the car along its velocity.
- FOV goes from 65° to 80° with speed. Small shake on impacts and landings.
- Raycast from the car to the camera and pull the camera in to avoid clipping into buildings.
- Smoothly swing behind the velocity direction while reversing (> 2 s). Look-back key flips the camera instantly.

---

## 6. World: city + surroundings

### 6.1 Layout (static map, the same every run)
The map stays the same in every run so players learn routes and shortcuts, as in Crazy Taxi. Runs vary through passengers, powers and difficulty.

- **Total area:** about 2.4 × 2.4 km. **City core:** about 1.2 × 1.2 km in the center.
- **Grid basis:** blocks of about 90 m with 14 m roads (2 lanes per direction on avenues, 1 per direction on streets). Break the grid on purpose with a diagonal river, a park, curved coastal roads and a few diagonal boulevards, so it doesn't feel like a spreadsheet.

| District | Location | Character | Gameplay features |
|---|---|---|---|
| **Downtown** | center | 40–150 m towers, plazas, wide avenues | Dense traffic, landmark towers for orientation, underground parking ramp shortcut |
| **Residential** | west & north | 2–3 floor houses, trees, narrow streets, cul-de-sacs | Pedestrians, low speed limits, back alleys as shortcuts |
| **Industrial / Docks** | east, on the coast | Warehouses, containers, cranes, rail line | Jump ramps (container stacks, loading docks), open lots for drifting |
| **Park & River** | diagonal through the city | River with 4 bridges, central park with paths | Off-road shortcuts through the park, one raised drawbridge jump |
| **Outskirts** | outside the ring highway | Gentle hills (heightmap), country roads, gas station, farm, quarry, lookout hill, small airfield | Long high-value fares, big jumps in the quarry, high-speed highway |

- A **ring highway** circles the city core with 6 on/off ramps and one overpass (the only multi-level road piece, to keep complexity down).
- **Map edge:** ocean on the east and south, mountains on the north and west, plus invisible walls. Fog hides the edge.
- **Landmarks** (named destinations with distinctive simple models, also used for orientation): Raxi Tower, Central Station, City Hospital, Stadium, Shopping Mall, Harbor Bar, University, City Hall, Lighthouse, Hilltop Lookout, Airfield, Farm Market, Quarry, Beach Club, Police HQ, Cinema. Generic addresses fill the rest.

### 6.2 Data and generation
- `mapData.ts`: **hand-authored** road graph (nodes with positions, edges with lane counts, road type and speed limit), district polygons, landmark positions and footprints, ramp placements.
- `CityBuilder.ts`: generates buildings per block **deterministically with a fixed map seed**. Footprints are subdivided lots. Heights come from district rules. Window textures come from a canvas-generated atlas, plus simple rooftop clutter.
- Roads: generated meshes from the graph (asphalt strips, lane markings via texture, intersection patches, sidewalks raised 15 cm with a beveled curb collider so cars can mount them).
- Outskirts terrain: low-res heightmap mesh (about 128×128) with roads carved and flattened. Use a Rapier heightfield collider.
- Colliders: one cuboid per building (or a compound for L-shapes), trimesh only for roads and ramps. Breakable props (lamps, hydrants, fences, cones, newspaper stands) are light dynamic bodies that wake on hit, are pooled, and reset when far away.

### 6.3 Rendering approach (2012 look)
- Low-poly geometry, **vertex colors + small textures**, flat/Lambert or simple Phong materials, one directional sun with a shadow map (2048, follows the player, about 150 m range), hemisphere ambient light, **distance fog**.
- **Merge static geometry per 200 m chunk** (`BufferGeometryUtils.mergeGeometries`) to keep draw calls low. Use frustum culling per chunk. Use `InstancedMesh` for trees, lamps, props and traffic car bodies where possible.
- Cheap extras on High quality only: FXAA, vignette.
- **Lighting:** fixed bright daytime lighting for the whole shift (no day-night cycle). Sky, sun angle and fog color are constant.

### 6.4 Art direction
Bright, saturated, slightly cartoony (Crazy Taxi meets Kenney-style low poly). Yellow cab as the hero color. Districts get distinct palettes: Downtown cool blues and greys, Residential warm pastels, Docks rust and orange, Outskirts greens and ochre. CC0 assets (e.g. Kenney City / Car kits, glTF) **may** be added later through a `ModelLibrary` abstraction, but the MVP must work fully with procedural geometry.

---

## 7. Traffic & pedestrians

### 7.1 Traffic
- Pool of **30–40 cars** (density scales with difficulty tier). Spawn 120–250 m from the player, off-screen, on lanes. Despawn when more than 300 m away.
- Each car follows lane splines from the road graph, keeps a target speed equal to the speed limit, and brakes for the car ahead (forward raycast). Cars stop at **traffic lights** (simple 4-phase timers at major intersections) and pick random turns at intersections.
- Cars are **kinematic** while driving normally. When hit by the player above a small impulse, they switch to **dynamic** ("knocked"), tumble physically, and despawn after 10 s out of view.
- They react to the horn (and the "Loud Horn" power) by swerving to the side.
- Vehicle types (visual only plus a mass variation): sedan, hatchback, van, bus (heavy), truck (heavy), police car (cosmetic in the MVP).

### 7.2 Pedestrians
- Simple low-poly people (about 150 triangles each, instanced/pooled) walking along sidewalks near the player (max about 60).
- **Pedestrians can be run over, and they explode.** Their AI still tries to **dive out of the way** when a car approaches fast, but dives are not guaranteed (crowded sidewalks, high speed, off-road driving), so hitting one is avoidable but possible.
- **Explosion (cartoon style, no gore):** when the player car overlaps a pedestrian (at any speed) the pedestrian bursts into a low-poly fireball with a confetti/star burst, a loud boom and a camera shake. Effects on the player:
  - **Car damage:** −12% car condition (see 8.6), multiplied by `stat(car.damageTaken)`.
  - **Knockback:** upward kick of about 2 m/s and −15% forward speed (never a flip on its own).
  - **Safety:** penalty 0.50 (see 9.5), breaks the style combo, passenger shouts.
  - **Chain reaction:** pedestrians within 3 m explode 0.3 s later, each doing full damage, so running into a crowd is very costly.
- Explosions only hurt the player's car (no area damage to traffic). Pedestrians respawn elsewhere after 20 s.
- Ghost Cab passes through pedestrians without triggering explosions. Traffic cars never trigger explosions.
- Waiting passengers are special pedestrians with a marker above them (see 8.2). Hitting one makes them explode too: that fare is lost and the normal explosion damage applies.

---

## 8. Core gameplay loop

### 8.1 Shift flow
1. A shift starts with a 3-2-1 countdown. Timer starts at **90 s**, score at 0, no powers, starting cab.
2. Passengers wait around the city. The player drives to one and stops in their pickup ring.
3. **Pickup →** the timer gets a pickup bonus, the destination is shown, and the ride starts.
4. Drive to the destination following the **nav arrow**. Speed, style and safety are tracked live.
5. **Delivery →** the passenger rates the ride, you earn **cash** (added to both your spendable **wallet** and your **score**) and a **delivery time bonus**.
6. Every **3rd delivery →** **Power Draft** (pause, choose 1 of 3).
7. The timer counts down the whole time (even while carrying a passenger). At 0 → **Shift Over**.
8. When no passenger is on board, the player may start a **shop break** to freeze the timer and visit a garage (see 8.5).

### 8.2 Passengers
- Always keep **6–10 waiting passengers** within about 300 m of the player, at sidewalk spawn points from the road graph. Waiting passengers expire after 60 s and respawn elsewhere.
- **Marker color shows trip length** (like Crazy Taxi): 🟢 short (< 500 m), 🟡 medium (500–1200 m), 🔴 long (> 1200 m, often to the outskirts). This lets the player choose between risk and reward.
- **Passenger types** set what they care about through rating weights `(speed, style, safety)`, shown as icons on the marker and fare panel:

| Type | Weights (spd/sty/saf) | Notes | Spawn weight |
|---|---|---|---|
| Regular | 0.4 / 0.3 / 0.3 | baseline | 40% |
| Businessman | 0.7 / 0.1 / 0.2 | tight par time, good tips | 15% |
| Thrill-seeker | 0.3 / 0.6 / 0.1 | loves drifts & jumps | 15% |
| Grandma | 0.05 / 0.0 / 0.95 | **rule-abiding fare**, see 8.2a | 10% |
| Tourist | 0.1 / 0.4 / 0.5 | wants a scenic, fun but safe ride, light rule strictness (0.3) | 12% |
| Celebrity (rare) | 0.35 / 0.35 / 0.3 | 3× cash, appears from tier 2 | 3% |
| Late Groom (rare) | 1.0 / 0 / 0 | very tight par, huge time bonus | 5% |

- **Patience:** each fare has a hard limit of `2.5 × parTime`. If it runs out, the passenger leaves (no delivery bonus, does **not** count toward the 3-delivery draft counter, small cash penalty).
### 8.2a Grandma: the "drive by the book" fare
Grandma rewards **driving legally and calmly**. Going fast gets you nothing, and rule-breaking is punished harshly.
- **Lots of time:** `parTime × 2.5`, patience `× 4`, and the pickup time bonus `× 1.5`. At normal city speed limits the delivery should net about **+10–15 s** (a 600 m trip).
- **Speed is irrelevant:** speed rating weight is only 0.05. The time bonus uses `timeQ = safetyRating` (rules and accidents), not the speed rating. Driving faster than the limit is itself a violation.
- **Perfect Drive:** zero violations and zero accidents → delivery time bonus `× 1.5` and tip `× 2`, with a "PERFECT DRIVE" stamp.
- **Big penalties** (applied to the safety rating, see 9.5 for the full table, all values `× 1` for Grandma and scaled by each passenger's `ruleStrictness`):
  - running a red light: **0.35**
  - changing lane without a blinker: **0.20**
  - any accident (traffic / wall hit): collision penalties `× 2.5`
  - pedestrian explosion: ends Perfect Drive and applies `× 2.5` as well
- The fare panel for Grandma shows a rules checklist (lights, blinkers, speed, accidents) next to the three bars, and Grandma's speech bubbles react to each violation ("You didn't signal!").
- Each passenger type has `ruleStrictness` (0..1) that scales rule penalties: Grandma 1.0, Tourist 0.3, all others 0.

- Passengers react in speech bubbles ("WOO!", "Slow down!", "I'm late!") as feedback. Use gibberish voice blips, no voice acting.

### 8.3 Pickup / drop-off
- Pickup ring: radius 6 m. The player must be inside with speed **< 3 m/s for 0.4 s** (the "Quick Hands" power raises the speed threshold).
- Drop-off zone: radius 8 m at the destination, same stopping rule. A tall light beam marks the destination, visible from far away.
- Passenger boarding and exiting is a 0.5 s animation (the passenger slides into the car) with no control lock beyond the stop requirement.

### 8.4 Navigation
- **Big 3D arrow** floating above the car (Crazy Taxi style). It points along the **shortest route** (A* on the road graph) toward the next waypoint, not straight at the target. Recompute the route every 0.5 s, or when the player leaves it by more than 30 m.
- **Minimap** in the bottom-left: a canvas 2D render of the road graph rotated with the player, showing the route line, passengers (colored dots) and the destination.
- With no fare: the arrow points to the nearest waiting passenger (toggleable). In Break mode it points to the nearest garage.

### 8.5 Shop break and garages
**Starting a break:** press `shopBreak` (B) while **no passenger is on board** (also unavailable during a draft or the last 5 s of the shift). Starting a break:
- **Freezes the shift timer** and everything tied to it (ability cooldowns, event timers, combo window, patience).
- **All waiting passengers disappear** (fade out). No new ones spawn during the break. Traffic and pedestrians keep running, so the player can drive around freely.
- Shows a "BREAK" banner. Safety and rule penalties are not tracked, and crashes cost no time, but **car damage still applies** (pedestrian explosions included).
- The nav arrow, minimap and light beams point to the nearest **Raxi Garage**.

**Garages:** 4 locations (Downtown, Docks, Residential, Outskirts), each with a tall beam, minimap icon and a drivable bay. Stopping inside the zone (speed < 3 m/s for 0.4 s) opens the **Shop screen** (world paused). Leaving the screen returns to free roam in Break mode.

**Ending a break:** press `shopBreak` again (or choose **Back to work** in the shop). A 1 s countdown runs, the timer resumes, and waiting passengers respawn around the player. A break can be started again at any time without a cost, but the stock does not change (see 8.7), so nothing can be exploited by repeated visits.

### 8.6 Car condition (damage)
- `CarCondition` is 0–100% and starts at 100% each shift.
- Damage sources (all `× stat(car.damageTaken)`): **pedestrian explosion −12%**, traffic or wall hit −2% to −15% by impulse, hard landing −3%, flip/reset −10%.
- Performance penalty below 50%: `perfMult = lerp(0.55, 1.0, condition / 50)` applied to top speed and acceleration. Visual feedback: light smoke below 60%, dark smoke below 30%, sputtering engine sound, and a condition bar on the HUD.
- Condition never reaches "game over": at 0% the car just stays at 55% performance. The only way to restore it is **Repair** in a garage.

### 8.7 Shop contents
The shop stock is **generated from the run seed and the delivery counter and regenerated after every completed delivery** (no regeneration for abandoned or expired fares). Visiting the same garage twice between deliveries shows identical stock. All garages share the same stock.

| Item | Details |
|---|---|
| **Power offers (3)** | Random powers using draft rarity weights (no cursed ones), synergy weighting, never a maxed-out one. Price by rarity: Common **80**, Uncommon **150**, Rare **300**, Legendary **550** (±15% seeded variation, `× (1 + 0.05 · tier)`). Buying fills an owned stack or an active slot (replace dialog if both are full). |
| **Black market (0–1)** | 40% chance of one extra Legendary or Rare at +25% price. |
| **Repair** (always) | `1.0 × missing condition %` cash. Buttons: Repair 25%, Repair to full. |
| **Cleanse** (only if a cursed power is owned) | Removes the **downside** of one cursed power and keeps the upside. Price **200** (+50 per tier). One entry per owned cursed power. |
| **Reroll stock** | 40 cash, +40 for each use until the next delivery. |

- All prices go through `Pricing.ts` and `stat(shop.priceMult)` / `stat(shop.repairMult)`. All numbers live in `balance.ts`.
- The shop shows wallet, car condition, owned powers and a tooltip comparing before/after for stats.
- Shop purchases are tracked on the Shift Over screen (cash spent, items bought).

---

## 9. Timer, scoring and ratings (all values in `balance.ts`)

Definitions: `L` = route length in metres (A* on the road graph from pickup to destination, computed once at pickup). `tier = floor(totalDeliveries / 3)`. `decay = 0.95 ^ tier`.

### 9.1 Pickup time bonus
```
pickupBonus = (4 + 0.02 · L) · decay · stat(timer.pickupMult)      // 600 m ≈ 16 s
```

### 9.2 Par time and live ratings (each 0..1)
```
vPar   = 15 m/s + 0.75 · tier                       // expected average speed
parTime = 5 + L / vPar
speedRating  = clamp((1.5·parTime − tActual) / parTime, 0, 1)   // 1 at ≤0.5×par, 0 at ≥1.5×par
styleRating  = clamp(stylePoints / (0.4 · L), 0, 1)
safetyRating = clamp(1 − Σpenalties · stat(safety.penaltyMult), 0, 1)
quality Q    = wSpeed·speedRating + wStyle·styleRating + wSafety·safetyRating
grade: S ≥ 0.90, A ≥ 0.75, B ≥ 0.55, C ≥ 0.35, else D
```
The fare panel shows all three as live bars, so the player knows what to do (e.g. carrying Grandma: the safety bar visibly drops on every bump).

### 9.3 Delivery rewards
```
deliveryTimeBonus = 0.025 · L · (0.4 + 1.2·Q) · decay · stat(timer.deliveryMult)   // 600 m, Q=.9 ≈ 22 s
baseFare = 5 + 0.02 · L
tip      = baseFare · Q · (grade == S ? 1.5 : 1.0)
cash     = (baseFare + tip) · comboMult · typeMult · stat(score.cashMult)
score   += cash         // score = total cash earned in the shift (never decreases)
wallet  += cash         // spendable money for the shop (decreases when buying)
```
Grandma modifiers: tip uses `Q` as defined above (safety-dominated), `timeBonus` uses `timeQ = safetyRating` instead of `Q`, and Perfect Drive applies the multipliers from 8.2a.

**Delivery combo:** if the next passenger is picked up within 8 s of a delivery, `comboMult` goes up by +0.25 (max ×3). It resets otherwise.

### 9.4 Style points (`StyleTracker`)
| Event | Points |
|---|---|
| Drift (slip angle > 15°, speed > 10 m/s) | 12 / s × speed factor |
| Airtime (> 0.3 s) | 25 / s + clean landing bonus 20 |
| Near miss (traffic within 1.2 m at > 15 m/s relative) | 15 |
| Two wheels / big jump / 360 spin in air | 40 / 50 / 80 |
| Oncoming lane driving | 4 / s |
| Smashing a breakable prop | 3 |

Consecutive style events within 2 s chain a **style combo** (×1.1 per link, max ×3). A collision breaks it. Show popups ("DRIFT +36", "NEAR MISS x4").

### 9.5 Safety penalties (`SafetyTracker`)
| Event | Penalty |
|---|---|
| Hit traffic car | 0.05 + impulse-scaled up to 0.25 |
| Hit wall/building | 0.03 – 0.20 by impulse |
| Pedestrian explosion (hit a pedestrian) | 0.50 |
| Pedestrian close scare (swerve dive, < 1 m) | 0.10 |
| Hard landing (> 2 m drop) | 0.05 |
| Flip / reset | 0.40 |
| Going over 1.6× speed limit in Residential | 0.02 / s |

**Traffic rule violations (`RulesTracker`)** use the same safety rating, scaled by the passenger's `ruleStrictness` (Grandma 1.0, Tourist 0.3, others 0):

| Violation | How it is detected | Penalty × strictness |
|---|---|---|
| Running a red light | Crossing the stop line of a signal while it is red (and not already inside the junction when it turned) | 0.35 |
| Lane change without blinker | Car center crosses a lane boundary on the road graph and the matching blinker (`indicatorLeft/Right`) has not been on for at least 0.8 s before the crossing | 0.20 |
| Driving in the oncoming lane | Over 1 s in an opposing-direction lane | 0.15 + 0.05 / s |
| Speeding | Over 1.15× the road speed limit for more than 1 s | 0.05 / s |

Accidents for strict passengers: collision and explosion penalties are multiplied by `1 + 1.5 · ruleStrictness` (so ×2.5 for Grandma).

Blinker behavior: toggles with Z/X, auto-cancels after the lane change or turn is completed, or after 6 s. Blinkers are visible on the car, play a ticking sound and show on the HUD. Turns at intersections do not require a blinker, but taking a turn **with** a blinker is a small style bonus (+5).

Style and safety pull against each other **on purpose**. The passenger type decides which one pays.

### 9.6 Difficulty scaling (`Difficulty.ts`)
Per tier: `decay` lowers time bonuses (this guarantees a run eventually ends), `vPar` rises, traffic density goes up 10%, more long-trip passengers, rare passengers unlock from tier 2, and "events" start at tier 3 (Rush Hour: double traffic for 60 s; Rain: grip −15%, style ×1.3; Road Works: blocked roads). Each power taken effectively raises the player's power level to compensate.

### 9.7 Target balance (tune through playtesting)
- Novice: shift lasts 4–6 min, 1–2 drafts.
- Skilled: 10–15 min, 5–8 drafts.
- Exceptional build: 20+ min. Hard cap through decay. No infinite runs.
- `?debug` shows a live balance readout: net time gained per fare and average fare cycle.

### 9.8 Shift Over screen
Final score, high score (localStorage, top 10 with date and seed), deliveries, grade distribution (S/A/B/C/D counts), best combo, longest drift, max airtime, distance driven, powers taken (icons), cash spent and items bought, pedestrians exploded, rule violations, time survived. Buttons: **New Shift**, **Main Menu**.

---

## 10. Powers (roguelike drafting)

### 10.1 Data model
```ts
type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'cursed';
type Tag = 'speed' | 'style' | 'safety' | 'time' | 'cash' | 'chaos' | 'handling';

interface PowerDef {
  id: string;
  name: string;
  description: string;          // with {value} placeholders scaled by stacks
  rarity: Rarity;
  tags: Tag[];
  maxStacks: number;            // 1 = unique
  icon: string;                 // emoji or atlas key for MVP
  minTier?: number;             // can't appear before this tier
  statMods?: StatMod[];         // { stat: StatKey, add?: number, mul?: number } per stack
  curse?: {                     // cursed powers only: the DOWNSIDE, kept separate from the upside
    description: string;
    statMods?: StatMod[];
    hooks?: PowerDef['hooks'];
  };                            // a garage 'Cleanse' disables `curse` and keeps the rest
  hooks?: Partial<{ [E in keyof GameEvents]: (ctx: PowerCtx, ev: GameEvents[E], stacks: number) => void }>;
  active?: {                    // occupies an ability slot (max 2)
    cooldown: number; duration: number;
    onActivate(ctx: PowerCtx): void;
    onTick?(ctx: PowerCtx, dt: number): void;
    onEnd?(ctx: PowerCtx): void;
  };
}
```
- `StatSystem`: `final = (base + Σadd) × Π(1 + mul)`. Recompute when powers change. Every system reads stats from here (vehicle, timer, scoring, spawner, draft).
- `PowerCtx` exposes a safe API: `addTime(s)`, `addCash(n)` (wallet + score), `repairCar(pct)`, `addStyle(n)`, `showPopup(text)`, `pushTrafficAround(radius, force)`, `setGhost(bool)`, `setTimeScale(x)`, `vehicle`, `shift`, `rng`.
- `StatKey` (initial set): `car.topSpeed, car.accel, car.grip, car.handbrakeGrip, car.steer, car.mass, car.boostForce, timer.pickupMult, timer.deliveryMult, timer.drainRate, score.cashMult, score.tipMult, style.mult, safety.penaltyMult, passenger.patienceMult, pickup.maxSpeed, pickup.radius, draft.choices, draft.rerolls, ability.cooldownMult, traffic.density, car.damageTaken, shop.priceMult, shop.repairMult`.

### 10.2 Draft rules (`Draft.ts`)
- Triggered after deliveries 3, 6, 9… The game is paused and the HUD hidden. Show 3 cards with rarity frames, tags, a description and the current stack count if already owned.
- Rarity weights by tier: Common 60 / Uncommon 28 / Rare 10 / Legendary 2. Shift +3% from Common toward higher rarities per tier.
- **Synergy weighting:** cards sharing a tag with owned powers get ×1.5 weight. Never offer two copies of the same card in one draft or a maxed-out card.
- **Guarantee:** the first draft of a shift always includes at least one **active** ability.
- Options: **Reroll** (1 free per shift, more from powers) and **Skip** (+10 s timer instead).
- Cursed cards appear as an occasional 4th "Devil's Deal" card from tier 2: high power with a real downside.
- Max 2 active ability slots. If a third active is chosen, the player picks which one to replace.

### 10.3 Initial power pool (#1–32 in M6, #33–34 in M7 with the shop)

**Common**
| # | Name | Effect | Tags |
|---|---|---|---|
| 1 | Turbocharger | +8% top speed & accel (stack 3) | speed |
| 2 | Sticky Tires | +12% grip (stack 3) | handling |
| 3 | Generous Meter | +12% pickup time bonus (stack 3) | time |
| 4 | Smooth Operator | Safety penalties −20% (stack 3) | safety |
| 5 | Show-off | Style points +20% (stack 3) | style |
| 6 | Air Freshener | Passenger patience +25% (stack 2) | safety |
| 7 | Coffee Thermos | +8 s now, +1 s on every delivery (stack 3) | time |
| 8 | Tip Jar | Tips +25% (stack 3) | cash |
| 9 | Quick Hands | Pick up/drop off at up to 8 m/s ("rolling pickups") (unique) | time |
| 10 | Loud Horn | Horn makes traffic ahead swerve aside strongly (unique) | safety, chaos |

**Uncommon**
| # | Name | Effect | Tags |
|---|---|---|---|
| 11 | Nitro Tank *(active)* | 3 s boost, 12 s cooldown | speed |
| 12 | Drift King | Drifting cuts ability cooldowns 2× and gives +0.25 s timer per drift second | style, time |
| 13 | Hydraulics *(active)* | Car hops 4 m up (jump anywhere), 6 s cooldown | style |
| 14 | Bulldozer Bumper | +60% mass. Traffic flies away and hits don't slow you. Traffic hits give −50% safety penalty | chaos |
| 15 | Frequent Flyer | +1 s timer per second of airtime | style, time |
| 16 | Chain Reaction | Delivery combo window 8 → 15 s, combo max ×4 | cash |
| 17 | Rush Hour Hero | Near misses give +0.5 s timer and double style | style, time |
| 18 | Lucky Charm | Drafts show 4 cards (unique) | — |
| 19 | Roll Cage | Never flips. Auto-righting is instant and free. −30% damage taken | safety |
| 33 | Blast Shield | Pedestrian explosion damage −75% (unique) | safety, chaos |
| 34 | Mechanic's Discount | Shop prices −15%, repairs −25% (stack 2) | cash |
| 20 | Local Knowledge | Nav arrow and route include off-road shortcuts (park paths, alleys) | speed |

**Rare**
| # | Name | Effect | Tags |
|---|---|---|---|
| 21 | Double Booking | Carry 2 passengers at once (2 destinations, both ratings tracked) | cash, time |
| 22 | Time Bank | Seconds delivered under par are added to the timer at 50% | time, speed |
| 23 | Ghost Cab *(active)* | 4 s pass through traffic, props & pedestrians (no damage, no explosions), 25 s cooldown | safety, chaos |
| 24 | Shockwave *(active)* | Blasts all traffic within 25 m away, 18 s cooldown, style +30 per car | chaos, style |
| 25 | Second Shift | First time the timer hits 0, restore 20 s (unique, consumed) | time |
| 26 | Stunt Show | Each jump gives ×1.5 style for 5 s (stacks multiplicatively up to ×3) | style |

**Legendary**
| # | Name | Effect | Tags |
|---|---|---|---|
| 27 | Flux Capacitor *(active)* | 4 s bullet time: world at 40%, timer drains at 40%, 30 s cooldown | time |
| 28 | Celebrity Chauffeur | Celebrities spawn 5× more often and always pay ×4 | cash |
| 29 | Midas Meter | Every 3rd delivery pays triple cash and triple time bonus | cash, time |

**Cursed (Devil's Deal)**
| # | Name | Upside | Downside |
|---|---|---|---|
| 30 | Glass Cannon Engine | +25% top speed & accel | Every crash costs 2 s of timer and +50% damage taken |
| 31 | Daredevil License | Style ×2, style weight +0.3 for all passengers | Safety rating is always 0 |
| 32 | Lone Wolf | Time bonuses +30% | No minimap for the rest of the shift |

### 10.4 Extensibility
Adding a power = adding one `PowerDef` object to a file in `src/powers/powers/`. The registry auto-collects it. Cursed powers must define upside and `curse` separately so that Cleanse works. Add a `?debug` cheat command `give <powerId>` for testing.

---

## 11. UI / HUD

**HUD layout (1080p reference, scales with viewport):**
- **Top center:** shift timer (huge, flashes red with ticking audio under 10 s). Floating "+16 s" on bonuses.
- **Top right:** score, wallet (spendable cash) and combo multiplier. Draft progress "●●○ next power".
- **Under the speedometer:** car condition bar (flashes under 30%), blinker indicators.
- **Break mode:** frozen timer with a "BREAK" banner, garage arrow and a "B: back to work" hint.
- **Top left:** current fare panel: passenger portrait/emoji, type, destination name, distance remaining, three live rating bars (speed/style/safety) with weight icons, patience bar.
- **Above car (3D):** nav arrow. Destination beam in world.
- **Center:** style popups and combo counter, grade stamp on delivery ("S!").
- **Bottom left:** minimap. **Bottom right:** speedometer (km/h) + ability slots with cooldown sweeps and key hints (Q/E/Shift).

**Screens:** Main Menu (New Shift, How to Play, Settings, High Scores), Pause (Resume, Restart, Settings, Quit), Draft, Shop, Shift Over, Settings (master/music/sfx volume, graphics preset, resolution scale, camera shake toggle, speed units, show controls). Key rebinding comes in M10. Every screen can be navigated with the keyboard via the `ui*` actions.

**Style:** bold arcade fonts (one free web font, e.g. "Bungee" or "Russo One", bundled locally), yellow/black taxi palette, punchy CSS animations.

---

## 12. Audio
- **Engine:** synthesized or looped sample with pitch and gain driven by RPM (a fake gearbox with 5 gears gives the rise-and-drop pitch). Separate layer for boost.
- **SFX:** pedestrian explosion boom + confetti pop, blinker tick, shop purchase, repair wrench, engine sputter when damaged, tire screech (volume = slip amount), impacts (3 intensities), horn, landing thump, near-miss whoosh, pickup chime, delivery cash register, grade stamp, timer tick, draft card flip, UI clicks.
- **Music:** 2–3 upbeat CC0 loops (punk/funk vibe like Crazy Taxi). Intensity layer when the timer is under 15 s.
- Sources: CC0 only (Kenney, OpenGameArt, freesound CC0). Keep credits in `CREDITS.md`.

---

## 13. Persistence
`localStorage` key `raxi.v1`: `{ settings, highScores[10], stats: { shifts, totalDeliveries, bestScore }, bindings }`. Version the schema and handle migration and corrupt data safely.

---

## 14. Debug & testing
- `?debug` flag: lil-gui tuning panel (vehicle params live, balance constants), FPS / draw calls / triangles (`renderer.info`), Rapier debug render toggle, road graph overlay, cheats (`+time`, `+cash`, `set condition`, `start break`, `rule overlay`, `give power`, `spawn passenger type`, `teleport to landmark`, `set tier`), fixed seed input.
- **Unit tests (Vitest):** `Scoring` (grades, bonuses, edge cases), `StatSystem` (add/mul stacking), `Draft` (no duplicates, guarantees, weighting, seeded determinism), `RoadGraph` (A* correctness, route length), `ShiftTimer`, `RulesTracker`, `CarCondition`, `Pricing`/`ShopStock` (seeded determinism, regeneration after delivery), `Wallet` (never negative), `Rng` determinism, `PowerManager` hook dispatch.
- **Smoke test (optional, Playwright):** load the page, start a shift, simulate throttle for 3 s, assert the car moved and the timer decreased, with no console errors.
- Run `npm run build` and the tests at the end of each milestone. No TypeScript errors allowed.

---

## 15. Milestones (implement in order)

| # | Milestone | Scope | Acceptance criteria |
|---|---|---|---|
| **M0** | Setup | Vite + TS + Three + Rapier + ESLint/Prettier + Vitest. Loop, EventBus, Rng, InputManager (keyboard + gamepad stub), debug flag. | `npm run dev` shows a lit test scene. `npm test` passes. `npm run build` succeeds. |
| **M1** | Driving sandbox | Flat ground, ramps, walls, cones. ArcadeVehicle, VehicleVisual, ChaseCamera, tire smoke/skids, debug tuning panel. | All feel criteria in §5.3. 60 FPS. |
| **M2** | City | mapData road graph, CityBuilder, all 5 districts, ring highway, river + bridges, outskirts terrain, landmarks, props, chunk merging, fog, quality presets. | Drive around the whole map without falling through or getting stuck. Draw calls and frame time within budget. Load under 5 s. |
| **M3** | Core loop (first playable) | Shift state machine, timer, passenger spawner (Regular type only), pickup/drop-off, A* routing, nav arrow, minimap, base scoring (speed only), Wallet, HUD timer/score/wallet, Shift Over screen, main menu, pause, high scores. | Full shift playable start→end. Timer bonuses follow the formulas. High score persists. |
| **M4** | Traffic & pedestrians | Traffic pool, lane following, traffic lights, knocked state, horn reaction. Pedestrians with dive-away AI and explosion on impact (damage hook into `CarCondition`). Breakable props. | 35 traffic cars at 60 FPS. No traffic pile-ups that block intersections forever (add a stuck timeout → despawn). |
| **M5** | Ratings | StyleTracker, SafetyTracker, RulesTracker (red lights, blinkers with Z/X, speeding, wrong lane), all passenger types incl. the Grandma rule-abiding fare (8.2a), weights, patience, grades, combos, popups, speech bubbles, full fare panel. | Each passenger type is clearly rewarded for different driving. A slow, legal Grandma ride nets more time and cash than a fast, sloppy one. Values visible in the debug readout. |
| **M6** | Powers & roguelike | StatSystem, PowerManager, all 32 powers, Draft screen, reroll/skip, active slots, difficulty tiers, events (Rush Hour, Rain, Road Works). | Every power works and is covered by a debug `give` test. Drafts are deterministic per seed. Runs end within the target balance (§9.7). |
| **M7** | Shop & garage | CarCondition and damage sources, BreakMode (timer freeze, passengers fade out), 4 garages with zones/beams/minimap icons, Shop screen (power offers, black market, repair, cleanse, reroll), seeded stock regenerated per delivery, `curse` split for cursed powers, Blast Shield and Mechanic's Discount. | Break cannot start with a passenger on board. Timer is provably frozen in Break (unit test). Stock identical on repeat visits and changes after each delivery. Repair, cleanse and purchases work with the wallet. Pedestrian explosion damage can be repaired. |
| **M8** | Polish | Audio (engine, sfx, music), particles, camera shake, menu animations, How to Play, settings, CREDITS.md. | Feels like a finished arcade game. No console errors. Settings persist. |
| **M9** | Packaging | Production build (static, relative paths) deployable to itch.io / GitHub Pages. Tauri v2 config producing a Windows `.exe` (fullscreen toggle, F11). | `npm run build` → playable `dist/`. `npm run tauri build` → working `Raxi.exe`. |
| **M10** | Later / optional | Gamepad support (implement `GamepadDevice`, rumble, button prompts swap), key rebinding UI, meta progression (unlock cabs: Minivan = safety, Muscle Cab = speed, Tuk-tuk = handling, plus unlockable powers in the pool), daily seed challenge. | — |

---

## 16. Out of scope for MVP
Multiplayer, online leaderboards, realistic damage models, story mode, open-world missions beyond fares, mobile/touch controls.

## 17. Open questions for the product owner (defaults assumed if unanswered)
1. **Meta progression between shifts?** Default: none in the MVP ("fresh slate" each shift). Unlockable cabs and powers in M10.
2. **Pedestrian explosions:** pedestrians can be hit and explode in a cartoon-style burst (confetti, fireball, no gore), damaging the car and giving a big safety penalty. The tone should stay light-hearted. Confirm this fits the intended age rating.
3. **Score = total cash earned.** The wallet is separate: spending in garages does not reduce the score.
4. **Shop break has no cost** by default (it only freezes the clock and removes passengers). If it feels too safe in playtests, add a cooldown or require visiting a garage to finish the break.
