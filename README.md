# RAXI — Roguelike Arcade Taxi

**Raxi** is a roguelike arcade taxi game combining Crazy Taxi / GTA V arcade handling, a 2012-era low-poly 3D city, and Slay-the-Spire-style power drafting.

## Features
- **Custom Arcade Raycast Vehicle Physics** (`@dimforge/rapier3d-compat` + Three.js): responsive cornering, handbrake drifting, jumps, air control, downforce, and dramatic traffic knockouts.
- **Static 2.4 × 2.4 km City & Outskirts**: 5 districts (Downtown, Residential, Industrial/Docks, Park & River with 4 bridges, Outskirts heightmap), ring highway with overpass, 16 landmarks, 6 jump ramps, and 4 Raxi Garages.
- **7 Passenger Types**: Regular, Businessman, Thrill-Seeker, **Grandma** (rule-abiding fare with red lights, Z/X blinkers, speed limits, and Perfect Drive bonuses), Tourist, Celebrity, and Late Groom.
- **34 Roguelike Powers**: Stat upgrades, triggers, 5 active abilities (Nitro Tank, Hydraulics, Ghost Cab, Shockwave, Flux Capacitor bullet time), and 3 Devil's Deal cursed powers whose downsides can be cleansed at garages.
- **Shop Break & Car Condition**: Freeze the shift clock when empty (`B`), drive into any of 4 Raxi Garages to repair damage (including cartoon pedestrian explosions), cleanse curses, or buy seeded stock powers.
- **Procedural Web Audio Engine**: 5-gear RPM engine synth, tire screech, damage sputter, upbeat arcade music with low-timer intensity layer, and full SFX.

## Controls
| Action | Key |
|---|---|
| Drive / Reverse | `W` `S` / `↑` `↓` |
| Steer | `A` `D` / `←` `→` |
| Handbrake (Drift) | `Space` |
| Nitro Boost | `Shift` |
| Active Powers 1 / 2 | `Q` / `E` |
| Left / Right Blinker | `Z` / `X` |
| Horn | `H` |
| Shop Break | `B` |
| Look Back | `C` |
| Reset Car | Hold `R` (1 s) |
| Pause | `Esc` / `P` |
| Fullscreen | `F11` |

## Development & Scripts
```bash
npm install
npm run dev        # Dev server (append ?debug for lil-gui tuning & cheats)
npm test           # Vitest unit test suite
npm run lint       # ESLint check
npm run build      # Production static build -> dist/ (deployable to itch.io / GitHub Pages)
```

### Restricted Settings (Google Sign-In)
The **Restricted** section inside Settings uses Google Identity Services. The default OAuth 2.0 Web Client ID can be overridden via `VITE_GOOGLE_CLIENT_ID` (in `.env.local` or GitHub Actions `vars.VITE_GOOGLE_CLIENT_ID`). Make sure your Google Cloud OAuth client includes your app origins under **Authorized JavaScript origins** (e.g. `https://szymonpucher.github.io` and `http://localhost:5173`).

## Windows `.exe` Packaging (Tauri v2)
Tauri v2 config is provided in `src-tauri/`. With Rust + Cargo installed:
```bash
npm install -D @tauri-apps/cli
npx tauri build
```
