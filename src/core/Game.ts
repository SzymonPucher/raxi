import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { ChaseCamera } from '../camera/ChaseCamera';
import { BALANCE } from './config/balance';
import { GRAPHICS_PRESETS } from './config/graphics';
import { EventBus, GameState } from './EventBus';
import { Loop } from './Loop';
import { Rng } from './Rng';
import { DebugPanel } from '../debug/DebugPanel';
import { EffectsManager } from '../fx/EffectsManager';
import {
  ActiveFare,
  addFareStyleFraction,
  createActiveFare,
  evaluateFareRewards,
} from '../gameplay/Fare';
import { PassengerTypeId } from '../gameplay/Passenger';
import { PassengerSpawner } from '../gameplay/PassengerSpawner';
import {
  computePickupBonus,
  computeSpeedStyleFractionPerSec,
  computeStyleTarget,
} from '../gameplay/Scoring';
import { Shift, ShiftSummary } from '../gameplay/Shift';
import { InputManager } from '../input/InputManager';
import { CollisionContactEvent, PhysicsWorld } from '../physics/PhysicsWorld';
import { DraftOffer, generateDraftOffer } from '../powers/Draft';
import { PowerManager } from '../powers/PowerManager';
import { PowerCtx, PowerDef } from '../powers/PowerTypes';
import { StatSystem } from '../powers/StatSystem';
import { GameSettings, Storage } from '../save/Storage';
import { Shop } from '../shop/Shop';
import { PedestriansManager } from '../traffic/Pedestrians';
import { TrafficLights } from '../traffic/TrafficLights';
import { TrafficManager } from '../traffic/TrafficManager';
import { UIManager } from '../ui/UIManager';
import { ArcadeVehicle } from '../vehicle/ArcadeVehicle';
import { VehicleStats } from '../vehicle/VehicleStats';
import { VehicleVisual } from '../vehicle/VehicleVisual';
import { CityBuildResult, buildCity } from '../world/CityBuilder';
import { MapDefinition } from '../world/mapData';
import { MapId, createMapById } from '../world/MapRegistry';

function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh | THREE.LineSegments | THREE.Points;
    if (mesh.geometry) {
      geometries.add(mesh.geometry);
    }
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) materials.add(m);
    } else if (mat) {
      materials.add(mat);
    }
  });

  for (const m of materials) {
    for (const val of Object.values(m)) {
      if (val && typeof val === 'object' && 'isTexture' in val && (val as THREE.Texture).isTexture) {
        textures.add(val as THREE.Texture);
      }
    }
    m.dispose();
  }
  for (const tex of textures) tex.dispose();
  for (const geo of geometries) geo.dispose();
}

/**
 * Top-level Raxi game engine & state machine (§3.1–3.2).
 */
export class Game {
  public state: GameState = 'Boot';
  public readonly events = new EventBus();
  public readonly storage = new Storage();
  public readonly stats = new StatSystem();
  public readonly powerManager = new PowerManager(this.stats);
  public readonly shift = new Shift();
  public readonly spawner = new PassengerSpawner();
  public readonly shop = new Shop();
  public readonly audio = new AudioManager();

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly fog: THREE.Fog;

  public activeMapId: MapId = 'raxi_city';

  private physics!: PhysicsWorld;
  private map!: MapDefinition;
  private city!: CityBuildResult;
  private readonly input: InputManager;
  private readonly vehicleStats: VehicleStats;
  public vehicle!: ArcadeVehicle;
  private vehicleVisual!: VehicleVisual;
  private chaseCam!: ChaseCamera;
  private readonly fx: EffectsManager;
  private lights!: TrafficLights;
  private traffic!: TrafficManager;
  private peds!: PedestriansManager;
  private readonly ui: UIManager;
  private debugPanel!: DebugPanel;
  private readonly loop: Loop;
  private worldLoaded = false;

  private rng = new Rng(1);
  private timeSec = 0;
  private stateTimer = 0;
  private lowTimeTickAccum = 0;
  private blinkerTickAccum = 0;
  private nitroActive = false;

  // Draft & shop UI state
  private currentDraftOffer: DraftOffer | null = null;
  private draftCountThisShift = 0;
  private draftRerollsRemaining = 1;
  private currentGarageName = 'Raxi Garage';
  private pendingShopReplaceOfferId: string | null = null;
  private pendingShopReplacePower: PowerDef | null = null;
  private garageStopTimer = 0;
  private garageCooldown = 0;
  private settingsReturnTo: 'main' | 'pause' = 'main';

  // Route caching (§8.4: recompute every 0.5s for GPS minimap)
  private routeWaypoints: Array<{ x: number; y: number; z: number }> = [];
  private routeRecomputeTimer = 0;

  // Stop progress HUD display
  private stopProgress = 0;
  private stopLabel = '';

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    // 1. Renderer & fixed daytime lighting (§6.3)
    const preset = GRAPHICS_PRESETS[this.storage.settings.graphicsPreset];
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: preset.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0x82c8f5);
    this.fog = new THREE.Fog(0x9bd4f8, preset.fogNear, preset.fogFar);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.3, 1100);

    const hemi = new THREE.HemisphereLight(0xd9f2ff, 0x5c6b4d, 0.85);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight(0xfff6dc, 1.35);
    this.sunLight.position.set(120, 190, 90);
    this.sunLight.castShadow = preset.shadows;
    this.sunLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 420;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 2. Persistent Input, Vehicle Stats, FX, and UI Manager
    this.input = new InputManager(this.storage.bindings);
    this.vehicleStats = new VehicleStats(this.stats);
    this.fx = new EffectsManager();
    this.scene.add(this.fx.group);

    this.ui = new UIManager(uiRoot, {
      onNewShift: () => {
        this.audio.unlock();
        this.audio.playClick();
        this.startNewShift();
      },
      onSelectMap: (mapId) => {
        this.selectMap(mapId);
      },
      onResume: () => {
        this.audio.playClick();
        this.setState('Driving');
      },
      onRestartShift: () => {
        this.audio.playClick();
        this.startNewShift();
      },
      onQuitToMenu: () => {
        this.audio.playClick();
        this.returnToMainMenu();
      },
      onOpenSettings: (from) => {
        this.audio.playClick();
        this.settingsReturnTo = from;
        this.ui.showSettings(this.storage.settings);
      },
      onOpenHowToPlay: () => {
        this.audio.playClick();
        this.ui.showHowToPlay();
      },
      onOpenHighScores: () => {
        this.audio.playClick();
        this.ui.showHighScores(this.storage.highScores);
      },
      onCloseSubscreen: () => {
        this.audio.playClick();
        if (this.state === 'Paused' && this.settingsReturnTo === 'pause') {
          this.ui.showPause();
        } else {
          this.ui.showMainMenu(this.storage.stats, this.activeMapId);
        }
      },
      onUpdateSettings: (patch) => {
        this.applySettings(patch);
      },
      onPickDraftPower: (powerId, replaceSlotIndex) => {
        this.handleDraftPick(powerId, replaceSlotIndex);
      },
      onRerollDraft: () => {
        this.handleDraftReroll();
      },
      onSkipDraft: () => {
        this.handleDraftSkip();
      },
      onBuyShopOffer: (offerId, replaceSlotIndex) => {
        this.handleShopBuyOffer(offerId, replaceSlotIndex);
      },
      onBuyRepair: (pct) => {
        this.handleShopRepair(pct);
      },
      onBuyCleanse: (powerId) => {
        this.handleShopCleanse(powerId);
      },
      onBuyShopReroll: () => {
        this.handleShopReroll();
      },
      onShopLeaveToBreak: () => {
        this.audio.playClick();
        this.garageCooldown = 3.0;
        this.setState('Break');
      },
      onShopBackToWork: () => {
        this.audio.playClick();
        this.beginExitBreak();
      },
    });

    // 3. Build initial selected map world, physics, vehicle, traffic, peds, & debug panel
    this.loadMap(this.storage.settings.selectedMap);

    // 4. Apply saved graphics & audio settings
    this.applySettings(this.storage.settings);

    // 8. Wire window events (resize + F11 fullscreen + audio unlock)
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (e.code === 'F11') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    });
    window.addEventListener('pointerdown', () => this.audio.unlock());

    // 9. Expose debug handle on window
    if (typeof window !== 'undefined') {
      (window as unknown as { __RAXI__: Game }).__RAXI__ = this;
    }

    // 10. Start main loop & show Main Menu
    this.loop = new Loop({
      fixedUpdate: (dt, realDt) => this.fixedUpdate(dt, realDt),
      render: (alpha, realDt) => this.renderFrame(alpha, realDt),
    });

    this.returnToMainMenu();
    this.loop.start();
  }

  private getMapSpawn(): { x: number; y: number; z: number; yaw: number } {
    const s = this.map.spawn ?? { x: 0, z: 65, yaw: 0 };
    const groundY = this.map.heightMap.sample(s.x, s.z);
    return { x: s.x, y: groundY + 1.0, z: s.z, yaw: s.yaw };
  }

  public selectMap(mapId: MapId): void {
    this.audio.unlock();
    this.audio.playClick();
    if (this.activeMapId !== mapId) {
      this.storage.updateSettings({ selectedMap: mapId });
      this.loadMap(mapId);
    }
    if (this.state === 'MainMenu') {
      this.ui.showMainMenu(this.storage.stats, this.activeMapId, mapId);
    }
  }

  public loadMap(mapId: MapId): void {
    if (this.worldLoaded) {
      this.scene.remove(this.city.root);
      disposeObject3D(this.city.root);
      for (const tex of Object.values(this.city.textures)) {
        tex.dispose();
      }

      this.scene.remove(this.lights.group);
      disposeObject3D(this.lights.group);

      this.scene.remove(this.traffic.group);
      disposeObject3D(this.traffic.group);

      this.scene.remove(this.peds.group);
      disposeObject3D(this.peds.group);

      this.scene.remove(this.vehicleVisual.root);
      disposeObject3D(this.vehicleVisual.root);

      this.fx.clearSkids();
      this.spawner.reset();
      this.physics.dispose();
    }

    this.activeMapId = mapId;
    this.physics = new PhysicsWorld();
    this.map = createMapById(mapId);
    this.city = buildCity(this.map, this.physics);
    this.scene.add(this.city.root);

    const spawn = this.getMapSpawn();
    this.vehicle = new ArcadeVehicle(
      this.physics,
      this.vehicleStats,
      this.map.heightMap,
      new THREE.Vector3(spawn.x, spawn.y + 0.2, spawn.z),
      spawn.yaw
    );
    this.vehicleVisual = new VehicleVisual(this.vehicle);
    this.scene.add(this.vehicleVisual.root);

    this.chaseCam = new ChaseCamera(this.camera, this.physics);
    this.chaseCam.shakeEnabled = this.storage.settings.cameraShake;
    this.chaseCam.snapToVehicle(this.vehicle);

    this.lights = new TrafficLights(this.map);
    this.scene.add(this.lights.group);

    this.traffic = new TrafficManager(this.map, this.physics, this.lights);
    this.scene.add(this.traffic.group);

    this.peds = new PedestriansManager(this.map);
    this.scene.add(this.peds.group);

    if (this.debugPanel) {
      this.debugPanel.rebuildForMap(this.physics, this.map);
    } else {
      this.debugPanel = new DebugPanel(
        this.scene,
        this.physics,
        this.map,
        this.vehicleStats.config,
        {
          addTime: (s) => this.grantTime(s, 'Debug'),
          addCash: (n) => this.grantCash(n),
          setCondition: (pct) => {
            this.shift.condition.setCondition(pct);
            this.vehicleStats.perfMult = this.shift.condition.performanceMult;
          },
          toggleBreak: () => this.handleBreakToggle(),
          givePower: (id) => {
            const res = this.powerManager.acquire(id, this.makePowerCtx());
            if (res.ok) {
              this.syncVehiclePowerFlags();
              this.ui.hud.showPopup(`GIVEN: ${id.toUpperCase()}`, '#00e5ff');
            }
          },
          spawnPassenger: (type) => this.debugSpawnPassenger(type),
          teleportTo: (x, y, z) => {
            this.vehicle.setPositionAndYaw(x, y, z, 0);
            this.chaseCam.snapToVehicle(this.vehicle);
          },
          setTier: (t) => {
            this.shift.difficulty.tier = t;
            this.ui.hud.showPopup(`TIER SET TO ${t}`, '#ffcc00');
          },
          openDraft: () => this.openPowerDraft(),
          startShiftWithSeed: (seed) => this.startNewShift(seed),
        }
      );
    }

    this.routeWaypoints = [];
    this.routeRecomputeTimer = 0;
    this.worldLoaded = true;
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private applySettings(patch: Partial<GameSettings>): void {
    this.storage.updateSettings(patch);
    const s = this.storage.settings;
    const preset = GRAPHICS_PRESETS[s.graphicsPreset];

    this.audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume);
    this.chaseCam.shakeEnabled = s.cameraShake;
    this.ui.hud.setVignette(preset.vignette);
    this.fx.setMaxParticles(preset.maxParticles);

    const dpr = Math.min(window.devicePixelRatio || 1, 2) * s.resolutionScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = preset.shadows;
    this.sunLight.castShadow = preset.shadows;
    this.fog.near = preset.fogNear;
    this.fog.far = preset.fogFar;

    const r = preset.shadowRange;
    const sc = this.sunLight.shadow.camera;
    sc.left = -r;
    sc.right = r;
    sc.top = r;
    sc.bottom = -r;
    sc.updateProjectionMatrix();
  }

  private setState(next: GameState): void {
    const prev = this.state;
    this.state = next;
    this.events.emit('state:change', { from: prev, to: next });

    const drivingHud =
      next === 'ShiftIntro' ||
      next === 'Driving' ||
      next === 'Break' ||
      next === 'BreakEnding' ||
      next === 'ShiftEnding';

    if (drivingHud) {
      this.ui.hideScreen();
      this.ui.hud.setVisible(true);
      this.input.touch.setVisible(true);
    } else if (next === 'Paused') {
      this.input.touch.setVisible(false);
      this.ui.showPause();
    } else if (next === 'MainMenu') {
      this.input.touch.setVisible(false);
      this.ui.showMainMenu(this.storage.stats, this.activeMapId);
    } else {
      this.input.touch.setVisible(false);
    }

    // Music state
    const musicOn = next === 'Driving' || next === 'Break' || next === 'BreakEnding';
    const intense = next === 'Driving' && this.shift.timer.remaining <= BALANCE.intenseMusicSeconds;
    this.audio.setMusicState(musicOn, intense);
  }

  public returnToMainMenu(): void {
    this.loop.timeScale = 1.0;
    this.nitroActive = false;
    this.vehicle.setGhost(false);
    this.setState('MainMenu');
  }

  public startNewShift(forcedSeed?: number): void {
    const seed = forcedSeed ?? Math.floor(Math.random() * 899999 + 100000);
    this.rng = new Rng(seed);
    this.shift.reset(seed);
    this.powerManager.reset();
    this.shop.reset();
    this.spawner.reset();
    this.traffic.reset();
    this.peds.reset();
    this.lights.reset();
    this.fx.clearSkids();
    this.map.graph.clearAllBlocked();
    this.city.setRoadWorksVisible([]);

    this.loop.timeScale = 1.0;
    this.nitroActive = false;
    this.draftCountThisShift = 0;
    this.draftRerollsRemaining = Math.round(this.stats.get('draft.rerolls'));
    this.currentDraftOffer = null;
    this.pendingShopReplaceOfferId = null;
    this.pendingShopReplacePower = null;
    this.garageStopTimer = 0;
    this.garageCooldown = 0;
    this.routeWaypoints = [];
    this.routeRecomputeTimer = 0;

    this.vehicle.drift.reset();
    this.vehicle.distanceDriven = 0;
    this.vehicle.cancelBlinker();
    this.vehicle.setGhost(false);
    this.vehicleStats.perfMult = 1.0;
    this.vehicleStats.rainGripMult = 1.0;
    this.syncVehiclePowerFlags();

    // Spawn taxi at active map's starting road position
    const spawn = this.getMapSpawn();
    this.vehicle.setPositionAndYaw(spawn.x, spawn.y, spawn.z, spawn.yaw);
    this.chaseCam.snapToVehicle(this.vehicle);

    // Spawn initial batch of waiting passengers around downtown
    this.spawner.update({
      dt: 0,
      playerX: spawn.x,
      playerZ: spawn.z,
      tier: 0,
      map: this.map,
      rng: this.rng,
      celebrityChauffeurOwned: false,
      allowShortcuts: false,
      paused: false,
    });

    this.stateTimer = BALANCE.shiftIntroSeconds;
    this.events.emit('shift:start', { seed });
    this.setState('ShiftIntro');
  }

  private makePowerCtx(): PowerCtx {
    return {
      addTime: (s, reason) => this.grantTime(s, reason ?? ''),
      subtractTime: (s) => {
        this.shift.timer.subtract(s);
        this.ui.hud.showTimeFloat(-s);
      },
      addCash: (n) => this.grantCash(n),
      repairCar: (pct) => {
        const rep = this.shift.condition.repair(pct);
        this.vehicleStats.perfMult = this.shift.condition.performanceMult;
        this.events.emit('car:repaired', { amount: rep, condition: this.shift.condition.condition });
      },
      addStyle: (pts, label) => {
        const mult = this.stats.get('style.mult') * this.shift.difficulty.rainStyleMultiplier;
        const award = this.shift.style.addEvent('power', pts, mult, label ?? 'BONUS');
        for (const f of this.shift.activeFares) f.stylePoints += award.points;
        this.ui.hud.showPopup(award.label, '#00e5ff');
      },
      addStyleRating: (ratingFraction, label) => {
        if (ratingFraction <= 0) return;
        const mult =
          this.stats.get('style.mult') *
          this.shift.difficulty.rainStyleMultiplier *
          this.shift.style.comboMult *
          this.shift.style.activeStuntMult;
        let displayPts = Math.round(BALANCE.styleNearMissPoints * mult);
        if (this.shift.activeFares.length > 0) {
          displayPts = Math.round(
            addFareStyleFraction(this.shift.activeFares[0], ratingFraction * mult)
          );
          for (let i = 1; i < this.shift.activeFares.length; i++) {
            addFareStyleFraction(this.shift.activeFares[i], ratingFraction * mult);
          }
        }
        this.shift.style.addPassivePoints(displayPts);
        if (label) {
          this.ui.hud.showPopup(`${label} +${displayPts}`, '#00e5ff');
        }
      },
      activateStuntBoost: () => this.shift.style.activateStuntBoost(),
      showPopup: (text, color, big) => this.ui.hud.showPopup(text, color, big),
      pushTrafficAround: (radius, force) => {
        const p = this.vehicle.currPosition;
        this.fx.spawnShockwave(p.x, p.y, p.z, radius);
        this.chaseCam.addShake(0.8, 0.35);
        this.audio.playImpact('heavy');
        return this.traffic.pushTrafficAround(p.x, p.z, radius, force);
      },
      setGhost: (enabled) => this.vehicle.setGhost(enabled),
      setTimeScale: (scale) => {
        this.loop.timeScale = scale;
      },
      setNitroActive: (enabled) => {
        this.nitroActive = enabled;
        this.events.emit('vehicle:boost', { active: enabled });
      },
      hopCar: (heightMeters) => {
        this.vehicle.hop(heightMeters);
        this.audio.playLandingThump();
      },
      reduceActiveCooldowns: (seconds) => {
        this.powerManager.reduceAllCooldowns(seconds);
      },
      rng: this.rng,
    };
  }

  private syncVehiclePowerFlags(): void {
    this.vehicle.hasRollCage = this.powerManager.has('roll_cage');
    this.vehicle.hasBulldozer = this.powerManager.has('bulldozer_bumper');
  }

  private grantTime(seconds: number, reason: string): void {
    if (seconds <= 0) return;
    this.shift.timer.add(seconds);
    if (seconds >= 0.4) {
      this.ui.hud.showTimeFloat(seconds);
    }
    this.events.emit('timer:bonus', { seconds, reason });
  }

  private grantCash(amount: number): void {
    const earned = this.shift.wallet.earn(amount);
    this.events.emit('wallet:change', {
      wallet: this.shift.wallet.balance,
      score: this.shift.score,
      delta: earned,
    });
  }

  private fixedUpdate(dt: number, realDt: number): void {
    const input = this.input.update(realDt);
    this.timeSec += realDt;

    // Menu navigation when paused/menu/draft/shop/shiftOver
    if (
      this.state === 'MainMenu' ||
      this.state === 'Paused' ||
      this.state === 'Draft' ||
      this.state === 'Shop' ||
      this.state === 'ShiftOver'
    ) {
      if (this.state === 'Paused' && input.pause) {
        this.setState('Driving');
        return;
      }
      this.ui.handleMenuInput(input);
      return;
    }

    // ShiftIntro (3-2-1): keep suspension active with controls locked so car sits planted
    if (this.state === 'ShiftIntro') {
      this.stateTimer -= realDt;
      this.vehicle.step(dt, input, { allowControl: false, boostActive: false });
      this.physics.step(dt);
      this.vehicle.syncFromBody();
      if (this.stateTimer <= 0) {
        this.vehicle.drift.reset();
        this.audio.playPickupChime();
        this.ui.hud.showPopup('GO!!', '#00e676', true);
        this.setState('Driving');
      }
      return;
    }

    // BreakEnding (1s Back to work countdown)
    if (this.state === 'BreakEnding') {
      this.vehicle.step(dt, input, { allowControl: false, boostActive: false });
      this.physics.step(dt);
      this.vehicle.syncFromBody();
      if (this.shift.breakMode.tickExit(realDt)) {
        this.shift.timer.setFrozen(false);
        this.audio.playPickupChime();
        this.ui.hud.showPopup('BACK TO WORK!', '#00e676', true);
        this.events.emit('break:end', {});
        this.setState('Driving');
      }
      return;
    }

    // ShiftEnding (2s car coasts to stop before Shift Over)
    if (this.state === 'ShiftEnding') {
      this.stateTimer -= realDt;
      this.vehicle.step(dt, input, { allowControl: false, boostActive: false });
      this.physics.step(dt);
      this.vehicle.syncFromBody();
      if (this.stateTimer <= 0) {
        this.finishShift();
      }
      return;
    }

    // Active play states: Driving or Break
    const inBreak = this.state === 'Break';

    if (input.pause) {
      this.setState('Paused');
      return;
    }

    // Toggle Shop Break (B)
    if (input.shopBreak) {
      this.handleBreakToggle();
      if (this.state !== 'Driving' && this.state !== 'Break') return;
    }

    const powerCtx = this.makePowerCtx();

    // Blinkers (Z / X)
    if (input.indicatorLeft) {
      const side = this.vehicle.toggleBlinker('left');
      this.audio.playBlinkerTick();
      this.events.emit('vehicle:blinker', { side });
    }
    if (input.indicatorRight) {
      const side = this.vehicle.toggleBlinker('right');
      this.audio.playBlinkerTick();
      this.events.emit('vehicle:blinker', { side });
    }
    if (this.vehicle.blinker !== 'off') {
      this.blinkerTickAccum += realDt;
      if (this.blinkerTickAccum >= 0.45) {
        this.blinkerTickAccum = 0;
        this.audio.playBlinkerTick();
      }
    }

    // Horn (H)
    if (input.horn) {
      const loud = this.powerManager.has('loud_horn');
      this.audio.playHorn(loud);
      this.traffic.reactToHorn(
        this.vehicle.currPosition.x,
        this.vehicle.currPosition.z,
        this.vehicle.forwardDir.x,
        this.vehicle.forwardDir.z,
        loud
      );
      this.events.emit('vehicle:horn', { loud });
    }

    // Active abilities (Q / E / Shift for Nitro) — frozen in Break mode (§8.5)
    if (!inBreak) {
      if (input.ability1) {
        const res = this.powerManager.tryActivateSlot(0, powerCtx);
        if (res.activated && res.powerId) {
          this.events.emit('power:activated', { powerId: res.powerId, slot: 0, duration: res.duration ?? 0 });
        }
      }
      if (input.ability2) {
        const res = this.powerManager.tryActivateSlot(1, powerCtx);
        if (res.activated && res.powerId) {
          this.events.emit('power:activated', { powerId: res.powerId, slot: 1, duration: res.duration ?? 0 });
        }
      }
      if (input.boost) {
        this.powerManager.tryActivateNitroByBoostKey(powerCtx);
      }
    }

    // 1. Powers tick (realDt so bullet time lasts 4 real seconds; frozen during Break)
    this.powerManager.tick(realDt, powerCtx, inBreak);

    // 2. Vehicle step
    this.vehicleStats.perfMult = this.shift.condition.performanceMult;
    this.vehicleStats.rainGripMult = this.shift.difficulty.rainGripMultiplier;
    const { driftOut, autoReset, manualReset } = this.vehicle.step(dt, input, {
      allowControl: true,
      boostActive: this.nitroActive,
    });

    if (autoReset || manualReset) {
      this.audio.playImpact('medium');
      this.events.emit('vehicle:reset', { manual: manualReset });
      if (!inBreak) {
        if (manualReset) {
          this.shift.timer.subtract(BALANCE.resetTimePenalty);
          this.ui.hud.showTimeFloat(-BALANCE.resetTimePenalty);
        }
        this.applyCarDamage(BALANCE.damageFlipReset, 'flip');
        this.ui.hud.showPopup('CAR RESET!', '#ff9100');
      }
    }

    // 3. Traffic lights & Traffic AI step
    this.lights.update(dt);
    const targetTraffic =
      BALANCE.trafficBaseCount *
      this.shift.difficulty.trafficDensityMultiplier *
      this.stats.get('traffic.density');
    const nearMisses = this.traffic.update(dt, this.vehicle, targetTraffic, this.rng, !inBreak);

    // 4. Physics step + contacts (wake nearby kinematic traffic & clamp catapult spikes)
    this.traffic.preparePlayerCollisions(this.vehicle);
    this.vehicle.capturePreStepVelocity();
    const contacts: CollisionContactEvent[] = [];
    this.physics.step(dt, (ev) => contacts.push(ev));
    this.vehicle.clampPostStepVelocity();
    this.vehicle.syncFromBody();

    // 5. Process contacts (traffic hits, wall hits, breakable props)
    this.processContacts(contacts, inBreak, powerCtx);

    // 6. Pedestrians & explosions (pedestrian explosions still damage car in Break mode §8.5!)
    const pedRes = this.peds.update(
      dt,
      this.vehicle,
      inBreak ? [] : this.spawner.waiting,
      inBreak
        ? []
        : this.shift.activeFares.map((f) => ({
            x: f.destinationX,
            y: f.destinationY,
            z: f.destinationZ,
          })),
      this.rng,
      this.timeSec
    );
    this.processPedestrianImpacts(pedRes, inBreak);

    // 7. Gameplay systems
    if (inBreak) {
      this.updateBreakGarageCheck(realDt);
    } else {
      this.updateDrivingGameplay(dt, realDt, driftOut, nearMisses, powerCtx);
    }

    // 8. Navigation route update
    this.updateNavigation(realDt, inBreak);
  }

  private processContacts(
    contacts: CollisionContactEvent[],
    inBreak: boolean,
    powerCtx: PowerCtx
  ): void {
    const strict = inBreak ? 0 : this.shift.highestStrictness;

    for (const c of contacts) {
      const a = c.tagA;
      const b = c.tagB;
      if (!a || !b) continue;
      if (a.kind !== 'player' && b.kind !== 'player') continue;
      const other = a.kind === 'player' ? b : a;
      const impulse = c.totalForceMagnitude;

      if (other.kind === 'prop') {
        if (this.city.props.markSmashed(other.id)) {
          this.audio.playImpact('light');
          if (!inBreak) {
            const mult = this.stats.get('style.mult') * this.shift.difficulty.rainStyleMultiplier;
            const award = this.shift.style.addEvent('prop', BALANCE.styleBreakPropPoints, mult, 'SMASH');
            for (const f of this.shift.activeFares) f.stylePoints += award.points;
            this.ui.hud.showPopup(award.label, '#ffd600');
          }
        }
        continue;
      }

      if (other.kind === 'traffic' && impulse > 700) {
        const bulldozer = this.powerManager.has('bulldozer_bumper');
        // Knock traffic car dramatically (§5.3, §7.1)
        if (impulse > BALANCE.trafficKnockImpulseThreshold || this.vehicle.speed > 14 || bulldozer) {
          this.traffic.knockCarById(other.id, this.vehicle.velocity, bulldozer);
        }
        const hit = this.shift.safety.recordTrafficHit(impulse, strict, bulldozer);
        if (hit) {
          this.onVehicleCrash('traffic', impulse, hit.penalty, hit.carDamage, inBreak, powerCtx);
        }
      } else if (other.kind === 'building' && impulse > 1200) {
        const hit = this.shift.safety.recordWallHit(impulse, strict);
        if (hit) {
          this.onVehicleCrash('wall', impulse, hit.penalty, hit.carDamage, inBreak, powerCtx);
        }
      }
    }
  }

  private onVehicleCrash(
    kind: 'traffic' | 'wall',
    impulse: number,
    penalty: number,
    carDamage: number,
    inBreak: boolean,
    powerCtx: PowerCtx
  ): void {
    const p = this.vehicle.currPosition;
    this.fx.spawnSparks(p.x, p.y + 0.5, p.z, impulse > 6000 ? 16 : 9);
    const intensity = impulse > 8000 ? 'heavy' : impulse > 3500 ? 'medium' : 'light';
    this.audio.playImpact(intensity);
    this.chaseCam.addShake(intensity === 'heavy' ? 0.9 : intensity === 'medium' ? 0.5 : 0.25, 0.28);
    this.input.gamepad.rumble(180, intensity === 'heavy' ? 0.8 : 0.4, 0.3);

    // Car damage applies in BOTH Driving & Break modes (§8.5)
    this.applyCarDamage(carDamage, kind);

    if (!inBreak) {
      const lostCombo = this.shift.style.breakCombo();
      if (lostCombo > 1) this.events.emit('style:comboBreak', { lostCombo });

      for (const f of this.shift.activeFares) {
        f.safetyPenalties += penalty;
        f.accidents += 1;
      }
      this.speakPassenger('angry');
      const ev = { kind, impulse, penalty };
      this.events.emit('safety:collision', ev);
      this.powerManager.dispatch('safety:collision', ev, powerCtx);
    }
  }

  private processPedestrianImpacts(
    pedRes: ReturnType<PedestriansManager['update']>,
    inBreak: boolean
  ): void {
    const strict = inBreak ? 0 : this.shift.highestStrictness;

    for (const ex of pedRes.explosions) {
      this.fx.spawnPedestrianExplosion(ex.x, ex.y, ex.z);
      this.audio.playPedExplosion();
      this.chaseCam.addShake(1.0, 0.38);
      this.input.gamepad.rumble(260, 0.9, 0.6);

      if (!ex.isChain) {
        this.vehicle.applyExplosionKnockback();
      }
      this.shift.pedestriansExploded += 1;

      // Damage −12% (×0.25 with Blast Shield #33)
      const blastMult = this.powerManager.has('blast_shield') ? 0.25 : 1.0;
      this.applyCarDamage(BALANCE.damagePedExplosion * blastMult, 'pedestrian');

      if (!inBreak) {
        const pen = this.shift.safety.recordPedestrianExplosion(strict);
        for (const f of this.shift.activeFares) {
          f.safetyPenalties += pen;
          f.accidents += 1;
        }
        this.shift.style.breakCombo();
        this.ui.hud.showPopup(
          ex.wasPassenger ? '💥 FARE EXPLODED!' : ex.isChain ? '💥 CHAIN BOOM!' : '💥 PEDESTRIAN BOOM!',
          '#ff3d57'
        );
        this.speakPassenger('angry');
      }
      if (ex.passengerId) {
        this.spawner.removeById(ex.passengerId);
      }
      this.events.emit('ped:exploded', {
        x: ex.x,
        y: ex.y,
        z: ex.z,
        isChain: ex.isChain,
        wasPassenger: ex.wasPassenger,
      });
    }

    // Pedestrian near-miss scares no longer reduce safety score (only collisions count)
  }

  private applyCarDamage(rawPct: number, source: string): void {
    const mult = this.stats.get('car.damageTaken');
    const dmg = this.shift.condition.applyDamage(rawPct, mult);
    this.vehicleStats.perfMult = this.shift.condition.performanceMult;
    this.events.emit('car:damaged', {
      amount: dmg,
      source,
      condition: this.shift.condition.condition,
    });
  }

  private updateDrivingGameplay(
    dt: number,
    realDt: number,
    driftOut: ReturnType<ArcadeVehicle['step']>['driftOut'],
    nearMisses: ReturnType<TrafficManager['update']>,
    powerCtx: PowerCtx
  ): void {
    const styleMult = this.stats.get('style.mult') * this.shift.difficulty.rainStyleMultiplier;

    // 1. Style & Safety & Delivery combo ticks
    this.shift.style.tick(dt);
    this.shift.safety.tick(dt);
    this.shift.tickDeliveryCombo(dt);

    // 2. Drift / Airtime / Landing / Two-Wheels style events
    if (driftOut.isDrifting) {
      const spdFactor = Math.min(2.2, this.vehicle.speed / 15);
      const award = this.shift.style.addContinuous(
        'drift',
        BALANCE.styleDriftPerSec * spdFactor * dt,
        styleMult,
        dt
      );
      if (award) {
        for (const f of this.shift.activeFares) f.stylePoints += award.points;
        this.ui.hud.showPopup(award.label, '#ffab00');
      }
      const ev = { dt, speed: this.vehicle.speed, slipDeg: driftOut.slipDeg };
      this.powerManager.dispatch('style:driftTick', ev, powerCtx);
    }

    if (driftOut.isAirborne) {
      this.shift.style.addContinuous('air', BALANCE.styleAirPerSec * dt, styleMult, dt);
      this.powerManager.dispatch('style:airTick', { dt, height: this.vehicle.currPosition.y }, powerCtx);
    }

    if (driftOut.landed) {
      const l = driftOut.landed;
      this.audio.playLandingThump();
      this.chaseCam.addShake(Math.min(0.65, l.dropHeight * 0.14), 0.22);

      if (l.clean) {
        const award = this.shift.style.addEvent(
          'landing',
          BALANCE.styleCleanLandingBonus,
          styleMult,
          `AIRTIME ${l.airtime.toFixed(1)}s`
        );
        for (const f of this.shift.activeFares) f.stylePoints += award.points;
        this.ui.hud.showPopup(award.label, '#ffd600');
      }
      if (l.bigJump) {
        const award = this.shift.style.addEvent('bigJump', BALANCE.styleBigJumpPoints, styleMult, 'BIG JUMP');
        for (const f of this.shift.activeFares) f.stylePoints += award.points;
        this.ui.hud.showPopup(award.label, '#00e5ff');
        this.speakPassenger('happy');
      }
      if (l.spun360) {
        const award = this.shift.style.addEvent('spin360', BALANCE.styleSpin360Points, styleMult, '360 SPIN');
        for (const f of this.shift.activeFares) f.stylePoints += award.points;
        this.ui.hud.showPopup(award.label, '#ff4081');
      }
      if (l.dropHeight > BALANCE.safetyHardLandingDropMeters && !l.clean) {
        this.applyCarDamage(BALANCE.damageHardLanding, 'landing');
      }

      const ev = { airtime: l.airtime, clean: l.clean, dropHeight: l.dropHeight };
      this.events.emit('style:jumpLand', ev);
      this.powerManager.dispatch('style:jumpLand', ev, powerCtx);
    }

    if (driftOut.twoWheelAwarded) {
      const award = this.shift.style.addEvent('twoWheels', BALANCE.styleTwoWheelsPoints, styleMult, 'TWO WHEELS');
      for (const f of this.shift.activeFares) f.stylePoints += award.points;
      this.ui.hud.showPopup(award.label, '#ffea00');
    }

    // 3. Near misses (+5% style rating per near miss)
    for (const nm of nearMisses) {
      this.audio.playNearMiss();
      const baseRefPoints =
        this.shift.activeFares.length > 0
          ? Math.round(
              BALANCE.styleNearMissRatingBonus *
                computeStyleTarget(this.shift.activeFares[0].routeLength)
            )
          : BALANCE.styleNearMissPoints;
      const award = this.shift.style.addEvent('nearMiss', baseRefPoints, styleMult, 'NEAR MISS');
      const nearMissMult = styleMult * this.shift.style.comboMult * this.shift.style.activeStuntMult;
      for (const f of this.shift.activeFares) {
        addFareStyleFraction(f, BALANCE.styleNearMissRatingBonus * nearMissMult);
      }
      this.ui.hud.showPopup(award.label, '#00e5ff');
      this.events.emit('style:nearMiss', nm);
      this.powerManager.dispatch('style:nearMiss', nm, powerCtx);
    }

    // 3b. Speed-based style (>= 100 km/h: (0.25 * (v_kmh - 100) + 1)% per 5 s)
    const speedStyleFraction = computeSpeedStyleFractionPerSec(this.vehicle.speed) * dt * styleMult;
    if (speedStyleFraction > 0) {
      if (this.shift.activeFares.length > 0) {
        const pts0 = addFareStyleFraction(this.shift.activeFares[0], speedStyleFraction);
        for (let i = 1; i < this.shift.activeFares.length; i++) {
          addFareStyleFraction(this.shift.activeFares[i], speedStyleFraction);
        }
        this.shift.style.addPassivePoints(pts0);
      } else {
        this.shift.style.addPassivePoints(speedStyleFraction * computeStyleTarget(600));
      }
    }

    // 4. Road projection: Oncoming style, Residential speeding, Traffic Rules (Grandma/Tourist)
    const proj = this.map.graph.projectPoint(
      this.vehicle.currPosition.x,
      this.vehicle.currPosition.z,
      this.vehicle.forwardDir.x,
      this.vehicle.forwardDir.z
    );

    if (proj && proj.isOncoming && this.vehicle.speed > 10) {
      const award = this.shift.style.addContinuous(
        'oncoming',
        BALANCE.styleOncomingPerSec * dt,
        styleMult,
        dt
      );
      if (award) {
        for (const f of this.shift.activeFares) f.stylePoints += award.points;
        this.ui.hud.showPopup(award.label, '#ffab00');
      }
    }

    // RulesTracker (§9.5 & §8.2a)
    const upcomingRed = proj
      ? this.lights.isRedForDirection(
          proj.aheadNode.id,
          this.vehicle.forwardDir.x,
          this.vehicle.forwardDir.z
        )
      : false;
    const ruleRes = this.shift.rules.update({
      dt,
      speed: this.vehicle.speed,
      projection: proj,
      blinker: this.vehicle.blinker,
      blinkerOnTime: this.vehicle.blinkerOnTime,
      upcomingLightRed: upcomingRed,
      ruleStrictness: this.shift.highestStrictness,
    });

    if (ruleRes.shouldCancelBlinker) {
      this.vehicle.cancelBlinker();
    }
    if (ruleRes.blinkerTurnStyleBonus) {
      const award = this.shift.style.addEvent(
        'blinkerTurn',
        BALANCE.styleBlinkerTurnBonus,
        styleMult,
        'SIGNAL TURN'
      );
      for (const f of this.shift.activeFares) f.stylePoints += award.points;
      this.ui.hud.showPopup(award.label, '#00e676');
    }
    for (const v of ruleRes.violations) {
      for (const f of this.shift.activeFares) {
        if (v.label) f.ruleViolations += 1;
      }
      if (v.label) {
        this.ui.hud.showPopup(`⚠️ ${v.label}`, '#ff3d57');
        this.speakPassenger('ruleBreak');
        this.events.emit('rule:violation', v);
      }
    }

    // 5. Waiting passenger spawner
    this.spawner.update({
      dt,
      playerX: this.vehicle.currPosition.x,
      playerZ: this.vehicle.currPosition.z,
      tier: this.shift.tier,
      map: this.map,
      rng: this.rng,
      celebrityChauffeurOwned: this.powerManager.has('celebrity_chauffeur'),
      allowShortcuts: this.powerManager.has('local_knowledge'),
      paused: false,
    });

    // 6. Pickup & Drop-off checks (§8.3)
    this.stopProgress = 0;
    this.stopLabel = '';
    const maxStopSpd = this.stats.get('pickup.maxSpeed');
    const maxFares = this.powerManager.has('double_booking') ? 2 : 1;

    // Check pickups if cab has room
    if (this.shift.activeFares.length < maxFares) {
      const pickupRad = this.stats.get('pickup.radius');
      for (const wp of this.spawner.waiting) {
        const dist = Math.hypot(wp.x - this.vehicle.currPosition.x, wp.z - this.vehicle.currPosition.z);
        if (dist <= pickupRad && this.vehicle.speed <= maxStopSpd) {
          wp.stopHoldTimer += realDt;
          this.stopProgress = Math.min(1, wp.stopHoldTimer / BALANCE.stopHoldDuration);
          this.stopLabel = `PICKING UP ${wp.type.emoji} ${wp.type.name.toUpperCase()}...`;
          if (wp.stopHoldTimer >= BALANCE.stopHoldDuration) {
            this.pickupPassenger(wp.id, powerCtx);
            break;
          }
        } else {
          wp.stopHoldTimer = 0;
        }
      }
    }

    // Check active fares (patience + drop-off)
    for (let i = this.shift.activeFares.length - 1; i >= 0; i--) {
      const fare = this.shift.activeFares[i];
      fare.elapsed += dt;

      // Check patience expiry (§8.2)
      if (fare.elapsed >= fare.patienceMax) {
        this.shift.activeFares.splice(i, 1);
        this.shift.wallet.deductPenalty(BALANCE.abandonCashPenalty);
        this.audio.playImpact('light');
        this.ui.hud.showPopup('PASSENGER BAILED!', '#ff3d57', true);
        this.events.emit('fare:expired', { fareId: fare.id, passengerType: fare.passenger.id });
        continue;
      }

      const dist = Math.hypot(
        fare.destinationX - this.vehicle.currPosition.x,
        fare.destinationZ - this.vehicle.currPosition.z
      );
      if (dist <= BALANCE.dropoffRadius && this.vehicle.speed <= maxStopSpd) {
        fare.stopHoldTimer += realDt;
        this.stopProgress = Math.min(1, fare.stopHoldTimer / BALANCE.stopHoldDuration);
        this.stopLabel = `DROPPING OFF AT ${fare.destinationName.toUpperCase()}...`;
        if (fare.stopHoldTimer >= BALANCE.stopHoldDuration) {
          this.deliverFare(i, powerCtx);
          if (this.state !== 'Driving') return; // Draft opened!
        }
      } else {
        fare.stopHoldTimer = 0;
      }
    }

    // 7. Difficulty dynamic events (tier 3+: Rush Hour, Rain, Road Works §9.6)
    const roadWorksCandidates = this.map.graph.edges
      .filter((e) => e.roadType === 'street' && !e.isShortcut)
      .map((e) => e.id);
    const evChange = this.shift.difficulty.tick(dt, this.rng, roadWorksCandidates);
    if (evChange.started) {
      const ev = evChange.started;
      if (ev.kind === 'roadWorks') {
        for (const id of ev.blockedEdgeIds) this.map.graph.setEdgeBlocked(id, true);
        this.city.setRoadWorksVisible(ev.blockedEdgeIds);
      }
      this.ui.hud.showPopup(`EVENT: ${ev.kind.toUpperCase()}!`, '#ff9100', true);
      this.events.emit('event:start', { kind: ev.kind, duration: ev.duration });
    }
    if (evChange.ended) {
      if (evChange.ended.kind === 'roadWorks') {
        this.map.graph.clearAllBlocked();
        this.city.setRoadWorksVisible([]);
      }
      this.events.emit('event:end', { kind: evChange.ended.kind });
    }

    // 8. Shift Timer tick (§8.1, §9) — scaled by timeScale (Flux Capacitor bullet time!)
    const hitZero = this.shift.timer.tick(dt, this.stats.get('timer.drainRate'));

    // Intense music & low timer warning tick
    this.audio.setMusicState(true, this.shift.timer.remaining <= BALANCE.intenseMusicSeconds);
    if (this.shift.timer.remaining <= BALANCE.lowTimeWarningSeconds && this.shift.timer.remaining > 0) {
      this.lowTimeTickAccum += realDt;
      if (this.lowTimeTickAccum >= 1.0) {
        this.lowTimeTickAccum = 0;
        this.audio.playTimerTick();
      }
    }

    if (hitZero) {
      // Second Shift (#25) check!
      const restored = this.powerManager.tryTriggerSecondShift();
      if (restored > 0) {
        this.grantTime(restored, 'Second Shift');
        this.audio.playPickupChime();
        this.ui.hud.showPopup('⏳ SECOND SHIFT +20s!', '#00e5ff', true);
        this.events.emit('timer:zero', { prevented: true });
      } else {
        this.events.emit('timer:zero', { prevented: false });
        this.loop.timeScale = 1.0;
        this.stateTimer = BALANCE.shiftEndingSeconds;
        this.ui.hud.showPopup("TIME'S UP!", '#ff3d57', true);
        this.setState('ShiftEnding');
      }
    }
  }

  private pickupPassenger(waitingId: string, powerCtx: PowerCtx): void {
    const idx = this.spawner.waiting.findIndex((w) => w.id === waitingId);
    if (idx < 0) return;
    const wp = this.spawner.waiting[idx];
    this.spawner.waiting.splice(idx, 1);

    const fare = createActiveFare({
      id: wp.id,
      passenger: wp.type,
      destinationName: wp.destName,
      destinationX: wp.destX,
      destinationY: wp.destY,
      destinationZ: wp.destZ,
      tripCategory: wp.tripCategory,
      routeLength: wp.routeLength,
      tier: this.shift.tier,
      patienceStatMult: this.stats.get('passenger.patienceMult'),
    });

    if (this.shift.activeFares.length === 0) {
      this.shift.rules.resetFare();
      this.shift.safety.resetFare();
      this.shift.style.resetFare();
    }
    this.shift.activeFares.push(fare);
    this.shift.onPickupStarted(this.powerManager.has('chain_reaction'));

    const pickupBonus = computePickupBonus(
      fare.routeLength,
      this.shift.tier,
      this.stats.get('timer.pickupMult'),
      fare.passenger.pickupBonusMult
    );
    this.grantTime(pickupBonus, 'Pickup');
    this.audio.playPickupChime();

    const line = this.rng.pick(fare.passenger.lines.pickup);
    this.ui.hud.showSpeech(`${fare.passenger.emoji} ${line}`);
    this.audio.playSpeechBlip('neutral');
    this.routeRecomputeTimer = 0;

    const ev = {
      fareId: fare.id,
      passengerType: fare.passenger.id,
      destinationName: fare.destinationName,
      routeLength: fare.routeLength,
      pickupBonus,
    };
    this.events.emit('fare:pickup', ev);
    this.powerManager.dispatch('fare:pickup', ev, powerCtx);
  }

  private deliverFare(fareIndex: number, powerCtx: PowerCtx): void {
    const fare = this.shift.activeFares.splice(fareIndex, 1)[0];
    if (!fare) return;

    const { ratings, rewards, perfectDrive, midasTriple } = evaluateFareRewards({
      fare,
      tier: this.shift.tier,
      deliveriesCompleted: this.shift.deliveries,
      deliveryComboMult: this.shift.deliveryComboMult,
      safetyPenaltyStatMult: this.stats.get('safety.penaltyMult'),
      deliveryTimeStatMult: this.stats.get('timer.deliveryMult'),
      cashStatMult: this.stats.get('score.cashMult'),
      tipStatMult: this.stats.get('score.tipMult'),
      daredevilCurseActive: this.powerManager.isCurseActive('daredevil_license'),
      extraStyleWeight: this.powerManager.has('daredevil_license') ? 0.3 : 0,
      celebrityChauffeurOwned: this.powerManager.has('celebrity_chauffeur'),
      midasMeterOwned: this.powerManager.has('midas_meter'),
    });

    this.grantCash(rewards.cash);
    this.grantTime(rewards.deliveryTimeBonus, 'Delivery');
    this.audio.playDeliveryCashRegister();
    this.audio.playGradeStamp(ratings.grade);

    const isGrandmaPerfect = fare.passenger.id === 'grandma' && perfectDrive;
    const stampText = isGrandmaPerfect
      ? `GRADE ${ratings.grade}! PERFECT DRIVE! +$${rewards.cash}`
      : midasTriple
        ? `👑 MIDAS ×3! GRADE ${ratings.grade}! +$${rewards.cash}`
        : `GRADE ${ratings.grade}! +$${rewards.cash}`;
    this.ui.hud.showPopup(
      stampText,
      ratings.grade === 'S' ? '#ffd600' : ratings.grade === 'A' ? '#00e676' : '#ffffff',
      true
    );

    const triggerDraft = this.shift.onDeliveryCompleted(
      ratings.grade,
      rewards.deliveryTimeBonus,
      this.powerManager.has('chain_reaction')
    );

    const ev = {
      fareId: fare.id,
      passengerType: fare.passenger.id,
      destinationName: fare.destinationName,
      grade: ratings.grade,
      quality: ratings.quality,
      cash: rewards.cash,
      tip: rewards.tip,
      timeBonus: rewards.deliveryTimeBonus,
      parTime: fare.parTime,
      actualTime: fare.elapsed,
      deliveryNumber: this.shift.deliveries,
      perfectDrive,
    };
    this.events.emit('fare:delivered', ev);
    this.powerManager.dispatch('fare:delivered', ev, powerCtx);

    this.routeRecomputeTimer = 0;

    if (triggerDraft) {
      this.openPowerDraft();
    }
  }

  private speakPassenger(kind: 'happy' | 'angry' | 'ruleBreak' | 'panic'): void {
    const fare = this.shift.activeFares[0];
    if (!fare) return;
    const lines = fare.passenger.lines[kind];
    if (!lines || lines.length === 0) return;
    const text = this.rng.pick(lines);
    this.ui.hud.showSpeech(`${fare.passenger.emoji} ${text}`);
    this.audio.playSpeechBlip(kind === 'ruleBreak' ? 'angry' : kind);
  }

  // --- Power Draft (§10.2) ---
  private openPowerDraft(): void {
    this.draftCountThisShift += 1;
    this.currentDraftOffer = generateDraftOffer({
      rng: this.rng.fork(`draft:${this.draftCountThisShift}:0`),
      powerManager: this.powerManager,
      tier: this.shift.tier,
      draftNumber: this.draftCountThisShift,
    });
    this.audio.playDraftCardFlip();
    this.events.emit('draft:open', {
      tier: this.shift.tier,
      deliveryNumber: this.shift.deliveries,
    });
    this.setState('Draft');
    this.ui.showDraft(
      this.currentDraftOffer,
      this.powerManager,
      this.draftRerollsRemaining,
      null
    );
  }

  private handleDraftPick(powerId: string, replaceSlotIndex?: number): void {
    if (!this.currentDraftOffer) return;
    if (replaceSlotIndex === -1) {
      // Cancelled slot replacement dialog
      this.ui.showDraft(this.currentDraftOffer, this.powerManager, this.draftRerollsRemaining, null);
      return;
    }

    const def = this.powerManager.registry.get(powerId);
    if (!def) return;

    if (replaceSlotIndex === undefined && this.powerManager.needsActiveSlotReplacement(powerId)) {
      this.ui.showDraft(this.currentDraftOffer, this.powerManager, this.draftRerollsRemaining, def);
      return;
    }

    const res = this.powerManager.acquire(powerId, this.makePowerCtx(), replaceSlotIndex);
    if (res.ok) {
      this.audio.playShopPurchase();
      this.syncVehiclePowerFlags();
      this.events.emit('draft:pick', { powerId, stacks: res.stacks });
      this.ui.hud.showPopup(`${def.icon} ${def.name.toUpperCase()}!`, '#ffcc00');
      this.currentDraftOffer = null;
      this.setState('Driving');
    }
  }

  private handleDraftReroll(): void {
    if (!this.currentDraftOffer || this.draftRerollsRemaining <= 0) return;
    this.draftRerollsRemaining -= 1;
    this.audio.playDraftCardFlip();
    this.currentDraftOffer = generateDraftOffer({
      rng: this.rng.fork(`draft:${this.draftCountThisShift}:r${this.draftRerollsRemaining}`),
      powerManager: this.powerManager,
      tier: this.shift.tier,
      draftNumber: this.draftCountThisShift,
    });
    this.ui.showDraft(this.currentDraftOffer, this.powerManager, this.draftRerollsRemaining, null);
  }

  private handleDraftSkip(): void {
    this.audio.playClick();
    this.grantTime(BALANCE.draftSkipTimeBonus, 'Draft Skip');
    this.events.emit('draft:skip', { timeBonus: BALANCE.draftSkipTimeBonus });
    this.currentDraftOffer = null;
    this.setState('Driving');
  }

  // --- Break Mode & Garage Shop (§8.5, §8.7) ---
  private handleBreakToggle(): void {
    if (this.state === 'Break') {
      this.beginExitBreak();
      return;
    }
    if (this.state !== 'Driving') return;

    const check = this.shift.breakMode.canStart({
      hasActivePassenger: this.shift.activeFares.length > 0,
      inDraft: false,
      timeRemaining: this.shift.timer.remaining,
    });
    if (!check.allowed) {
      this.ui.hud.showPopup(check.reason ?? 'CANNOT START BREAK', '#ff9100');
      return;
    }

    this.shift.breakMode.start();
    this.shift.timer.setFrozen(true);
    this.spawner.clearAll(); // All waiting passengers disappear (§8.5)
    this.garageCooldown = 0;
    this.routeRecomputeTimer = 0;
    this.audio.playClick();
    this.ui.hud.showPopup('BREAK MODE — TIMER FROZEN', '#00e5ff');
    this.events.emit('break:start', {});
    this.setState('Break');
  }

  private beginExitBreak(): void {
    this.shift.breakMode.beginExit();
    this.setState('BreakEnding');
  }

  private updateBreakGarageCheck(realDt: number): void {
    this.stopProgress = 0;
    this.stopLabel = '';
    if (this.garageCooldown > 0) {
      this.garageCooldown -= realDt;
      return;
    }

    const px = this.vehicle.currPosition.x;
    const pz = this.vehicle.currPosition.z;
    for (const g of this.map.garages) {
      const dist = Math.hypot(g.x - px, g.z - pz);
      if (dist <= BALANCE.garageRadius && this.vehicle.speed <= BALANCE.stopSpeedThreshold) {
        this.garageStopTimer += realDt;
        this.stopProgress = Math.min(1, this.garageStopTimer / BALANCE.stopHoldDuration);
        this.stopLabel = `ENTERING ${g.name.toUpperCase()}...`;
        if (this.garageStopTimer >= BALANCE.stopHoldDuration) {
          this.garageStopTimer = 0;
          this.openShop(g.name);
        }
        return;
      }
    }
    this.garageStopTimer = 0;
  }

  private openShop(garageName: string): void {
    this.currentGarageName = garageName;
    this.pendingShopReplaceOfferId = null;
    this.pendingShopReplacePower = null;
    this.audio.playPickupChime();
    this.events.emit('shop:open', { garageName });
    this.setState('Shop');
    this.refreshShopScreen();
  }

  private refreshShopScreen(): void {
    this.ui.showShop({
      garageName: this.currentGarageName,
      shop: this.shop,
      runSeed: this.shift.seed,
      deliveryCount: this.shift.deliveries,
      tier: this.shift.tier,
      wallet: this.shift.wallet,
      condition: this.shift.condition,
      powerManager: this.powerManager,
      pendingReplaceOfferId: this.pendingShopReplaceOfferId,
      pendingReplacePower: this.pendingShopReplacePower,
    });
  }

  private handleShopBuyOffer(offerId: string, replaceSlotIndex?: number): void {
    if (replaceSlotIndex === -1) {
      this.pendingShopReplaceOfferId = null;
      this.pendingShopReplacePower = null;
      this.refreshShopScreen();
      return;
    }
    const stock = this.shop.getStock({
      runSeed: this.shift.seed,
      deliveryCount: this.shift.deliveries,
      tier: this.shift.tier,
      powerManager: this.powerManager,
    });
    const offer = stock.offers.find((o) => o.offerId === offerId);
    if (!offer) return;

    if (
      replaceSlotIndex === undefined &&
      this.powerManager.needsActiveSlotReplacement(offer.power.id)
    ) {
      this.pendingShopReplaceOfferId = offerId;
      this.pendingShopReplacePower = offer.power;
      this.refreshShopScreen();
      return;
    }

    const res = this.shop.buyOffer({
      offerId,
      wallet: this.shift.wallet,
      powerManager: this.powerManager,
      ctx: this.makePowerCtx(),
      replaceSlotIndex,
    });
    if (res.ok) {
      this.shift.itemsBought += 1;
      this.syncVehiclePowerFlags();
      this.audio.playShopPurchase();
      this.events.emit('shop:purchase', { kind: 'power', cost: res.cost, label: res.label ?? '' });
    }
    this.pendingShopReplaceOfferId = null;
    this.pendingShopReplacePower = null;
    this.refreshShopScreen();
  }

  private handleShopRepair(pct: number): void {
    const res = this.shop.buyRepair({
      amountPct: pct,
      condition: this.shift.condition,
      wallet: this.shift.wallet,
      powerManager: this.powerManager,
    });
    if (res.ok) {
      this.shift.itemsBought += 1;
      this.vehicleStats.perfMult = this.shift.condition.performanceMult;
      this.audio.playRepairWrench();
      this.events.emit('shop:purchase', { kind: 'repair', cost: res.cost, label: res.label ?? '' });
      this.refreshShopScreen();
    }
  }

  private handleShopCleanse(powerId: string): void {
    const res = this.shop.buyCleanse({
      powerId,
      tier: this.shift.tier,
      wallet: this.shift.wallet,
      powerManager: this.powerManager,
    });
    if (res.ok) {
      this.shift.itemsBought += 1;
      this.audio.playShopPurchase();
      this.events.emit('shop:purchase', { kind: 'cleanse', cost: res.cost, label: res.label ?? '' });
      this.refreshShopScreen();
    }
  }

  private handleShopReroll(): void {
    const res = this.shop.buyReroll({
      runSeed: this.shift.seed,
      deliveryCount: this.shift.deliveries,
      tier: this.shift.tier,
      wallet: this.shift.wallet,
      powerManager: this.powerManager,
    });
    if (res.ok) {
      this.audio.playDraftCardFlip();
      this.events.emit('shop:purchase', { kind: 'reroll', cost: res.cost, label: res.label ?? '' });
      this.refreshShopScreen();
    }
  }

  // --- Navigation (§8.4 GPS route for minimap) ---
  private updateNavigation(realDt: number, inBreak: boolean): void {
    this.routeRecomputeTimer -= realDt;
    const px = this.vehicle.currPosition.x;
    const pz = this.vehicle.currPosition.z;

    let goalX: number | null = null;
    let goalZ: number | null = null;

    if (inBreak) {
      let bestD = Infinity;
      for (const g of this.map.garages) {
        const d = Math.hypot(g.x - px, g.z - pz);
        if (d < bestD) {
          bestD = d;
          goalX = g.x;
          goalZ = g.z;
        }
      }
    } else if (this.shift.activeFares.length > 0) {
      let bestFare: ActiveFare = this.shift.activeFares[0];
      let bestD = Math.hypot(bestFare.destinationX - px, bestFare.destinationZ - pz);
      for (let i = 1; i < this.shift.activeFares.length; i++) {
        const f = this.shift.activeFares[i];
        const d = Math.hypot(f.destinationX - px, f.destinationZ - pz);
        if (d < bestD) {
          bestD = d;
          bestFare = f;
        }
      }
      goalX = bestFare.destinationX;
      goalZ = bestFare.destinationZ;
    } else if (this.storage.settings.navPointNearestPassenger && this.spawner.waiting.length > 0) {
      let bestD = Infinity;
      for (const wp of this.spawner.waiting) {
        const d = Math.hypot(wp.x - px, wp.z - pz);
        if (d < bestD) {
          bestD = d;
          goalX = wp.x;
          goalZ = wp.z;
        }
      }
    }

    if (goalX === null || goalZ === null) {
      this.routeWaypoints = [];
      return;
    }

    if (this.routeRecomputeTimer <= 0) {
      this.routeRecomputeTimer = 0.5;
      const route = this.map.graph.findRouteBetweenPoints(px, pz, goalX, goalZ, {
        allowShortcuts: this.powerManager.has('local_knowledge'),
      });
      this.routeWaypoints = route.waypoints;
    }
  }

  private finishShift(): void {
    const summary: ShiftSummary = {
      seed: this.shift.seed,
      score: this.shift.score,
      walletRemaining: this.shift.wallet.balance,
      cashSpent: this.shift.wallet.totalSpent,
      itemsBought: this.shift.itemsBought,
      deliveries: this.shift.deliveries,
      grades: { ...this.shift.grades },
      bestStyleCombo: this.shift.style.bestCombo,
      bestDeliveryCombo: this.shift.bestDeliveryCombo,
      longestDrift: this.vehicle.drift.longestDrift,
      maxAirtime: this.vehicle.drift.maxAirtime,
      distanceDriven: this.vehicle.distanceDriven,
      pedestriansExploded: this.shift.pedestriansExploded,
      ruleViolations: this.shift.rules.totalViolations,
      timeSurvived: this.shift.timer.elapsed,
      powersTaken: this.powerManager.getOwnedList().map((o) => ({
        id: o.def.id,
        name: o.def.name,
        icon: o.def.icon,
        stacks: o.stacks,
      })),
    };

    const { isNewBest } = this.storage.recordShift({
      score: summary.score,
      deliveries: summary.deliveries,
      seed: summary.seed,
      timeSurvived: summary.timeSurvived,
      mapId: this.activeMapId,
    });

    this.events.emit('shift:end', {
      score: summary.score,
      deliveries: summary.deliveries,
      seed: summary.seed,
    });

    this.setState('ShiftOver');
    this.ui.showShiftOver(summary, isNewBest, this.storage.highScores, this.activeMapId);
  }

  private debugSpawnPassenger(type: PassengerTypeId): void {
    const wp = this.spawner.spawnForcedType(
      type,
      this.vehicle.currPosition.x,
      this.vehicle.currPosition.z,
      this.shift.tier,
      this.map,
      this.rng,
      this.powerManager.has('local_knowledge')
    );
    if (wp) {
      this.ui.hud.showPopup(`SPAWNED ${wp.type.emoji} ${wp.type.name.toUpperCase()}`, '#00e676');
    }
  }

  private renderFrame(alpha: number, realDt: number): void {
    const preset = GRAPHICS_PRESETS[this.storage.settings.graphicsPreset];
    const inWorld =
      this.state === 'Driving' ||
      this.state === 'Break' ||
      this.state === 'ShiftIntro' ||
      this.state === 'BreakEnding' ||
      this.state === 'ShiftEnding';

    // Update vehicle visual
    this.vehicleVisual.update(inWorld ? alpha : 1, realDt);

    // Camera
    let lightFocusX = this.vehicle.currPosition.x;
    let lightFocusY = this.vehicle.currPosition.y;
    let lightFocusZ = this.vehicle.currPosition.z;

    if (this.state === 'MainMenu') {
      const ang = this.timeSec * 0.14;
      if (this.activeMapId === 'mikolow') {
        // Scenic slow orbit framing Mikołów's Rynek & Bazylika św. Wojciecha
        const rynek = this.map.landmarks.find(
          (l) => l.style === 'townhall' || l.id.includes('rynek')
        );
        const cx = rynek ? rynek.x : 0;
        const cz = rynek ? rynek.z : 0;
        const cy = this.map.heightMap.sample(cx, cz);
        this.camera.position.set(cx + Math.sin(ang) * 145, cy + 56, cz + Math.cos(ang) * 145);
        this.camera.lookAt(cx, cy + 16, cz);
        lightFocusX = cx;
        lightFocusY = cy;
        lightFocusZ = cz;
      } else {
        // Scenic slow orbit around downtown Raxi Tower on title screen!
        this.camera.position.set(Math.sin(ang) * 140 + 25, 65, Math.cos(ang) * 140 + 45);
        this.camera.lookAt(20, 28, 45);
      }
    } else {
      const inp = this.input.state;
      this.chaseCam.update(
        this.vehicle,
        inWorld ? alpha : 1,
        realDt,
        inp.lookBack,
        inp.cameraLeft,
        inp.cameraRight,
        inp.throttle > 0.1 || inp.brake > 0.1
      );
    }

    // Shadow map follows player (§6.3) or scenic focal point on Main Menu
    const vp = this.vehicle.currPosition;
    this.sunLight.position.set(lightFocusX + 110, lightFocusY + 185, lightFocusZ + 80);
    this.sunLight.target.position.set(lightFocusX, lightFocusY, lightFocusZ);
    this.sunLight.target.updateMatrixWorld();

    // Spatial chunk culling
    this.city.updateVisibility(
      this.camera.position.x,
      this.camera.position.z,
      preset.drawDistance,
      preset.shadows ? preset.shadowRange : 0
    );

    // Props, FX, Garage beams animation
    if (inWorld) {
      this.city.props.update(realDt, vp.x, vp.z);
      this.fx.update(realDt, this.vehicle, this.shift.condition.condition);
    }
    for (const beam of this.city.garageBeams) {
      beam.visible = this.state === 'Break' || this.state === 'Driving' || this.state === 'MainMenu';
      beam.rotation.y = this.timeSec * 0.8;
    }

    // Audio engine update
    let maxSlip = 0;
    for (let i = 0; i < this.vehicle.wheels.length; i++) {
      const s = this.vehicle.wheels[i].slipAmount;
      if (s > maxSlip) maxSlip = s;
    }
    this.audio.update(realDt, {
      speed: this.vehicle.speed,
      throttle: this.input.state.throttle,
      slip: maxSlip,
      boosting: this.vehicle.isBoosting,
      condition: this.shift.condition.condition,
      active: this.state === 'Driving' || this.state === 'Break',
    });

    // HUD update
    if (inWorld) {
      let countdownText: string | null = null;
      if (this.state === 'ShiftIntro') {
        countdownText = String(Math.max(1, Math.ceil(this.stateTimer)));
      } else if (this.state === 'BreakEnding') {
        countdownText = 'BACK TO WORK!';
      }

      this.ui.hud.update(
        {
          shift: this.shift,
          powerManager: this.powerManager,
          speedMs: this.vehicle.speed,
          blinker: this.vehicle.blinker,
          blinkerLit: Math.sin(this.timeSec * 14) > 0,
          boosting: this.vehicle.isBoosting,
          inBreakMode: this.state === 'Break' || this.state === 'BreakEnding',
          countdownText,
          stopProgress: this.stopProgress,
          stopLabel: this.stopLabel,
          activeEvent: this.shift.difficulty.activeEvent,
          rulesChecklist: this.shift.rules.checklist,
          settings: this.storage.settings,
          map: this.map,
          playerX: vp.x,
          playerZ: vp.z,
          playerYaw: this.vehicle.getYaw(),
          routeWaypoints: this.routeWaypoints,
          waitingPassengers: this.spawner.waiting,
        },
        realDt
      );
    }

    // Render 3D scene
    this.renderer.render(this.scene, this.camera);

    // Update debug panel
    this.debugPanel.update(
      this.loop.fps,
      this.renderer,
      this.shift.getDebugBalanceReadout()
    );
  }
}
