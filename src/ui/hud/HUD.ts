import { BALANCE } from '../../core/config/balance';
import { ActiveDifficultyEvent } from '../../gameplay/Difficulty';
import { ActiveFare, evaluateFareRewards, getFarePatienceFraction } from '../../gameplay/Fare';
import { RulesChecklist } from '../../gameplay/RulesTracker';
import { Shift } from '../../gameplay/Shift';
import { WaitingPassenger } from '../../gameplay/PassengerSpawner';
import { PowerManager } from '../../powers/PowerManager';
import { GameSettings } from '../../save/Storage';
import { BlinkerSide } from '../../vehicle/ArcadeVehicle';
import { MapDefinition } from '../../world/mapData';
import { Minimap } from './Minimap';

export interface HUDUpdateData {
  shift: Shift;
  powerManager: PowerManager;
  speedMs: number;
  blinker: BlinkerSide;
  blinkerLit: boolean;
  boosting: boolean;
  inBreakMode: boolean;
  countdownText: string | null;
  stopProgress: number; // 0..1 when stopping inside pickup/dropoff/garage
  stopLabel: string;
  activeEvent: ActiveDifficultyEvent | null;
  rulesChecklist: RulesChecklist;
  settings: GameSettings;
  map: MapDefinition;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  routeWaypoints: Array<{ x: number; z: number }>;
  waitingPassengers: WaitingPassenger[];
}

export interface LocationLabel {
  street: string | null;
  landmark: string | null;
}

const DISTRICT_LABELS: Record<string, string> = {
  downtown: 'Downtown',
  residential: 'Residential',
  docks: 'Industrial / Docks',
  park: 'Park',
  outskirts: 'Outskirts',
};

/**
 * Resolves the current street name and nearest landmark (if within proximity)
 * at the player's world position and heading.
 */
export function getLocationLabel(
  map: MapDefinition,
  x: number,
  z: number,
  yaw: number
): LocationLabel {
  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);
  const proj = map.graph.projectPoint(x, z, fwdX, fwdZ, 26);

  let street: string | null = null;
  if (proj) {
    street = proj.edge.name?.trim() || DISTRICT_LABELS[proj.fromNode.district] || null;
  }

  let landmark: string | null = null;
  let bestDist = Infinity;
  for (const lm of map.landmarks) {
    const reach = Math.max(58, Math.max(lm.footprintW, lm.footprintD) * 0.75 + 28);
    const dCenter = Math.hypot(x - lm.x, z - lm.z);
    const dCurb = Math.hypot(x - lm.curbX, z - lm.curbZ);
    const d = Math.min(dCenter, dCurb + 12);
    if (d <= reach && d < bestDist) {
      bestDist = d;
      landmark = lm.name;
    }
  }

  return { street, landmark };
}

export class HUD {
  public readonly root: HTMLDivElement;
  public readonly minimap: Minimap;

  private readonly vignetteEl: HTMLDivElement;
  private readonly speedlinesEl: HTMLDivElement;
  private readonly rainEl: HTMLDivElement;

  private readonly timerBox: HTMLDivElement;
  private readonly timerLabel: HTMLDivElement;
  private readonly timerValue: HTMLDivElement;
  private readonly liveFareBox: HTMLDivElement;
  private readonly liveFareValue: HTMLDivElement;
  private readonly liveFareSub: HTMLDivElement;
  private readonly timeFloatBox: HTMLDivElement;
  private readonly eventBanner: HTMLDivElement;

  private readonly scoreVal: HTMLSpanElement;
  private readonly walletVal: HTMLSpanElement;
  private readonly comboBadge: HTMLDivElement;
  private readonly draftProgressEl: HTMLDivElement;
  private readonly ownedPowersEl: HTMLDivElement;

  private readonly fareContainer: HTMLDivElement;
  private readonly speechEl: HTMLDivElement;
  private speechTimer = 0;

  private readonly countdownEl: HTMLDivElement;
  private readonly popupContainer: HTMLDivElement;
  private readonly stopBarEl: HTMLDivElement;

  private readonly controlsHintEl: HTMLDivElement;
  private readonly locationPillEl: HTMLDivElement;
  private readonly locationLandmarkEl: HTMLDivElement;
  private readonly locationStreetEl: HTMLDivElement;
  private lastLocKey = '';
  private lastDraftDone = -1;
  private lastPowersHtml = '';
  private lastFareHtml = '';
  private lastLiveFareKey = '';
  private lastAbilitiesHtml = '';
  private lastStopHtml = '';
  private lastScoreVal = -1;
  private lastWalletVal = -1;
  private lastCondVal = -1;
  private readonly abilitiesRow: HTMLDivElement;
  private readonly speedNumEl: HTMLSpanElement;
  private readonly speedUnitEl: HTMLSpanElement;
  private readonly blinkLeftEl: HTMLSpanElement;
  private readonly blinkRightEl: HTMLSpanElement;
  private readonly condWrapEl: HTMLDivElement;
  private readonly condTextEl: HTMLSpanElement;
  private readonly condBarEl: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.vignetteEl = document.createElement('div');
    this.vignetteEl.className = 'fx-vignette';
    this.speedlinesEl = document.createElement('div');
    this.speedlinesEl.className = 'fx-speedlines';
    this.rainEl = document.createElement('div');
    this.rainEl.className = 'fx-rain';
    parent.append(this.vignetteEl, this.speedlinesEl, this.rainEl);

    this.root = document.createElement('div');
    this.root.className = 'hud-layer';
    parent.appendChild(this.root);

    // Top Center
    const topCenter = document.createElement('div');
    topCenter.className = 'hud-top-center';
    const topCenterRow = document.createElement('div');
    topCenterRow.className = 'hud-top-center-row';

    this.timerBox = document.createElement('div');
    this.timerBox.className = 'hud-timer-box';
    this.timerLabel = document.createElement('div');
    this.timerLabel.className = 'hud-timer-label';
    this.timerLabel.textContent = 'SHIFT TIME';
    this.timerValue = document.createElement('div');
    this.timerValue.className = 'hud-timer-value';
    this.timerValue.textContent = '90.0';
    this.timerBox.append(this.timerLabel, this.timerValue);

    this.liveFareBox = document.createElement('div');
    this.liveFareBox.className = 'hud-live-fare-box';
    this.liveFareBox.style.display = 'none';
    const liveFareLabel = document.createElement('div');
    liveFareLabel.className = 'hud-live-fare-label';
    liveFareLabel.textContent = 'FARE CASH';
    this.liveFareValue = document.createElement('div');
    this.liveFareValue.className = 'hud-live-fare-value';
    this.liveFareValue.textContent = '$0';
    this.liveFareSub = document.createElement('div');
    this.liveFareSub.className = 'hud-live-fare-sub';
    this.liveFareSub.textContent = 'GRADE S';
    this.liveFareBox.append(liveFareLabel, this.liveFareValue, this.liveFareSub);

    topCenterRow.append(this.timerBox, this.liveFareBox);

    this.timeFloatBox = document.createElement('div');
    this.timeFloatBox.className = 'hud-time-float-container';

    this.eventBanner = document.createElement('div');
    this.eventBanner.className = 'hud-banner hud-banner-event';
    this.eventBanner.style.display = 'none';

    topCenter.append(topCenterRow, this.eventBanner, this.timeFloatBox);
    this.root.appendChild(topCenter);

    // Top Right
    const topRight = document.createElement('div');
    topRight.className = 'hud-top-right';
    const scoreCard = document.createElement('div');
    scoreCard.className = 'hud-score-card';
    scoreCard.innerHTML = `
      <div class="hud-score-row"><span class="hud-score-label">SCORE</span><span class="hud-score-val" id="hud-score">$0</span></div>
      <div class="hud-score-row"><span class="hud-score-label">WALLET</span><span class="hud-wallet-val" id="hud-wallet">$0</span></div>
      <div class="hud-combo-badge" id="hud-combo" style="display:none">COMBO ×1.0</div>
      <div class="hud-draft-progress" id="hud-draft-prog"></div>
    `;
    this.scoreVal = scoreCard.querySelector('#hud-score')!;
    this.walletVal = scoreCard.querySelector('#hud-wallet')!;
    this.comboBadge = scoreCard.querySelector('#hud-combo')!;
    this.draftProgressEl = scoreCard.querySelector('#hud-draft-prog')!;
    this.ownedPowersEl = document.createElement('div');
    this.ownedPowersEl.className = 'hud-owned-powers';
    topRight.append(scoreCard, this.ownedPowersEl);
    this.root.appendChild(topRight);

    // Top Left (Fare Panel + Speech)
    const topLeft = document.createElement('div');
    topLeft.className = 'hud-top-left';
    this.fareContainer = document.createElement('div');
    this.speechEl = document.createElement('div');
    this.speechEl.className = 'hud-speech-bubble';
    this.speechEl.style.display = 'none';
    topLeft.append(this.fareContainer, this.speechEl);
    this.root.appendChild(topLeft);

    // Center
    const center = document.createElement('div');
    center.className = 'hud-center';
    this.countdownEl = document.createElement('div');
    this.countdownEl.className = 'hud-countdown';
    this.countdownEl.style.display = 'none';
    this.popupContainer = document.createElement('div');
    this.stopBarEl = document.createElement('div');
    this.stopBarEl.className = 'hud-stop-bar';
    this.stopBarEl.style.display = 'none';
    center.append(this.countdownEl, this.popupContainer, this.stopBarEl);
    this.root.appendChild(center);

    // Bottom Left
    const bottomLeft = document.createElement('div');
    bottomLeft.className = 'hud-bottom-left';
    const minimapCol = document.createElement('div');
    minimapCol.className = 'hud-minimap-col';

    this.locationPillEl = document.createElement('div');
    this.locationPillEl.className = 'hud-location-pill';
    this.locationPillEl.style.display = 'none';
    this.locationLandmarkEl = document.createElement('div');
    this.locationLandmarkEl.className = 'hud-location-landmark';
    this.locationStreetEl = document.createElement('div');
    this.locationStreetEl.className = 'hud-location-street';
    this.locationPillEl.append(this.locationLandmarkEl, this.locationStreetEl);

    this.minimap = new Minimap();
    minimapCol.append(this.locationPillEl, this.minimap.canvas);

    this.controlsHintEl = document.createElement('div');
    this.controlsHintEl.className = 'hud-controls-hint';
    this.controlsHintEl.innerHTML = `
      <kbd>WASD</kbd> Drive &nbsp;<kbd>Space</kbd> Drift &nbsp;<kbd>Shift</kbd> Nitro<br/>
      <kbd>Q</kbd>/<kbd>E</kbd> Powers &nbsp;<kbd>Z</kbd>/<kbd>X</kbd> Blinkers &nbsp;<kbd>H</kbd> Horn<br/>
      <kbd>T</kbd> 180° Turn (&lt;10 km/h) &nbsp;<kbd>B</kbd> Shop Break &nbsp;<kbd>C</kbd> Look Back &nbsp;<kbd>R</kbd> Reset &nbsp;<kbd>P</kbd> Pause
    `;
    bottomLeft.append(minimapCol, this.controlsHintEl);
    this.root.appendChild(bottomLeft);

    // Bottom Right
    const bottomRight = document.createElement('div');
    bottomRight.className = 'hud-bottom-right';
    this.abilitiesRow = document.createElement('div');
    this.abilitiesRow.className = 'hud-abilities-row';

    const speedo = document.createElement('div');
    speedo.className = 'hud-speedo-card';
    speedo.innerHTML = `
      <div class="hud-speedo-top">
        <div><span class="hud-speedo-num" id="hud-spd">0</span> <span class="hud-speedo-unit" id="hud-spd-unit">KM/H</span></div>
        <div class="hud-blinkers"><span id="blk-l">◀</span><span id="blk-r">▶</span></div>
      </div>
      <div class="hud-cond-wrap" id="hud-cond-wrap">
        <div class="hud-cond-label"><span>CAR CONDITION</span><span id="hud-cond-txt">100%</span></div>
        <div class="hud-bar-track"><div class="hud-bar-fill" id="hud-cond-bar" style="width:100%;background:#00e676"></div></div>
      </div>
    `;
    this.speedNumEl = speedo.querySelector('#hud-spd')!;
    this.speedUnitEl = speedo.querySelector('#hud-spd-unit')!;
    this.blinkLeftEl = speedo.querySelector('#blk-l')!;
    this.blinkRightEl = speedo.querySelector('#blk-r')!;
    this.condWrapEl = speedo.querySelector('#hud-cond-wrap')!;
    this.condTextEl = speedo.querySelector('#hud-cond-txt')!;
    this.condBarEl = speedo.querySelector('#hud-cond-bar')!;

    bottomRight.append(this.abilitiesRow, speedo);
    this.root.appendChild(bottomRight);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('visible', visible);
  }

  setVignette(on: boolean): void {
    this.vignetteEl.classList.toggle('on', on);
  }

  showTimeFloat(seconds: number): void {
    if (Math.abs(seconds) < 0.2) return;
    const el = document.createElement('div');
    el.className = 'hud-time-float';
    el.style.color = seconds >= 0 ? '#00e676' : '#ff3d57';
    el.textContent = `${seconds >= 0 ? '+' : ''}${seconds.toFixed(1)}s`;
    this.timeFloatBox.appendChild(el);
    setTimeout(() => el.remove(), 1250);
  }

  showPopup(text: string, color = '#ffcc00', big = false): void {
    const el = document.createElement('div');
    el.className = `hud-popup-item${big ? ' big' : ''}`;
    el.style.color = color;
    el.textContent = text;
    this.popupContainer.appendChild(el);
    if (this.popupContainer.children.length > 5) {
      this.popupContainer.firstChild?.remove();
    }
    setTimeout(() => el.remove(), 1450);
  }

  showSpeech(text: string): void {
    this.speechEl.textContent = `"${text}"`;
    this.speechEl.style.display = 'block';
    this.speechTimer = 3.2;
  }

  update(data: HUDUpdateData, dt: number): void {
    const { shift, powerManager, settings } = data;

    // Speedlines & Rain overlays
    this.speedlinesEl.classList.toggle('on', data.boosting || data.speedMs > 38);
    this.rainEl.classList.toggle('on', data.activeEvent?.kind === 'rain');

    // Timer
    const rem = shift.timer.remaining;
    this.timerValue.textContent = rem.toFixed(1);
    this.timerBox.classList.toggle('low', !data.inBreakMode && rem <= BALANCE.lowTimeWarningSeconds);
    this.timerBox.classList.toggle('frozen', data.inBreakMode);
    this.timerLabel.textContent = data.inBreakMode ? 'FROZEN (BREAK)' : `TIER ${shift.tier} • SHIFT TIME`;

    // Banners
    if (data.activeEvent) {
      const names = {
        rushHour: '🚗 RUSH HOUR (2× TRAFFIC)',
        rain: '🌧️ RAINSTORM (−15% GRIP, +30% STYLE)',
        roadWorks: '🚧 ROAD WORKS (DETOURS ACTIVE)',
      };
      this.eventBanner.textContent = `${names[data.activeEvent.kind]} • ${Math.ceil(data.activeEvent.remaining)}s`;
      this.eventBanner.style.display = 'block';
    } else {
      this.eventBanner.style.display = 'none';
    }

    // Score & Wallet & Combo & Draft Dots
    if (shift.score !== this.lastScoreVal) {
      this.lastScoreVal = shift.score;
      this.scoreVal.textContent = `$${shift.score.toLocaleString()}`;
    }
    if (shift.wallet.balance !== this.lastWalletVal) {
      this.lastWalletVal = shift.wallet.balance;
      this.walletVal.textContent = `$${shift.wallet.balance.toLocaleString()}`;
    }
    if (shift.deliveryComboMult > 1.01) {
      this.comboBadge.style.display = 'inline-block';
      this.comboBadge.textContent = `DELIVERY COMBO ×${shift.deliveryComboMult.toFixed(2)}`;
    } else if (shift.style.comboCount > 1) {
      this.comboBadge.style.display = 'inline-block';
      this.comboBadge.textContent = `STYLE COMBO ×${shift.style.comboMult.toFixed(1)}`;
    } else {
      this.comboBadge.style.display = 'none';
    }

    const doneInCycle = shift.deliveries % BALANCE.deliveriesPerDraft;
    if (doneInCycle !== this.lastDraftDone) {
      this.lastDraftDone = doneInCycle;
      let dotsHtml = '';
      for (let i = 0; i < BALANCE.deliveriesPerDraft; i++) {
        dotsHtml += `<span class="draft-dot${i < doneInCycle ? ' filled' : ''}"></span>`;
      }
      this.draftProgressEl.innerHTML = `${dotsHtml} <span>next power</span>`;
    }

    // Owned powers icons
    const owned = powerManager.getOwnedList();
    const powersHtml = owned
      .map(
        (o) =>
          `<span class="hud-power-chip" title="${o.def.name}">${o.def.icon}${o.stacks > 1 ? `×${o.stacks}` : ''}</span>`
      )
      .join('');
    if (powersHtml !== this.lastPowersHtml) {
      this.lastPowersHtml = powersHtml;
      this.ownedPowersEl.innerHTML = powersHtml;
    }

    // Fare panel(s)
    this.renderFarePanels(shift.activeFares, data, powerManager);

    // Speech timeout
    if (this.speechTimer > 0) {
      this.speechTimer -= dt;
      if (this.speechTimer <= 0) this.speechEl.style.display = 'none';
    }

    // Countdown
    if (data.countdownText) {
      this.countdownEl.style.display = 'block';
      this.countdownEl.textContent = data.countdownText;
    } else {
      this.countdownEl.style.display = 'none';
    }

    // Stop progress bar (pickup / dropoff / garage)
    if (data.stopProgress > 0.01) {
      this.stopBarEl.style.display = 'block';
      const pct = Math.min(100, Math.round(data.stopProgress * 100));
      const stopHtml = `<div>${data.stopLabel}</div><div class="hud-bar-track" style="margin-top:4px"><div class="hud-bar-fill" style="width:${pct}%;background:#00e676"></div></div>`;
      if (stopHtml !== this.lastStopHtml) {
        this.lastStopHtml = stopHtml;
        this.stopBarEl.innerHTML = stopHtml;
      }
    } else {
      this.stopBarEl.style.display = 'none';
    }

    // Speedo
    const speedDisplay =
      settings.speedUnits === 'mph'
        ? Math.round(data.speedMs * 2.23694)
        : Math.round(data.speedMs * 3.6);
    this.speedNumEl.textContent = String(speedDisplay);
    this.speedUnitEl.textContent = settings.speedUnits === 'mph' ? 'MPH' : 'KM/H';

    this.blinkLeftEl.classList.toggle('lit', data.blinker === 'left' && data.blinkerLit);
    this.blinkRightEl.classList.toggle('lit', data.blinker === 'right' && data.blinkerLit);

    // Car condition
    const cond = Math.round(shift.condition.condition);
    if (cond !== this.lastCondVal) {
      this.lastCondVal = cond;
      this.condTextEl.textContent = `${cond}%`;
      this.condBarEl.style.width = `${cond}%`;
      this.condBarEl.style.background =
        cond < 30 ? '#ff3d57' : cond < 60 ? '#ffab00' : '#00e676';
      this.condWrapEl.classList.toggle('critical', cond < 30);
    }

    // Active ability slots
    this.renderAbilitySlots(powerManager);

    // Controls hint
    this.controlsHintEl.style.display = settings.showControls ? 'block' : 'none';

    // Street & Landmark indicator
    const loc = getLocationLabel(data.map, data.playerX, data.playerZ, data.playerYaw);
    const locKey = `${loc.landmark ?? ''}|${loc.street ?? ''}`;
    if (locKey !== this.lastLocKey) {
      this.lastLocKey = locKey;
      if (!loc.landmark && !loc.street) {
        this.locationPillEl.style.display = 'none';
      } else {
        this.locationPillEl.style.display = 'flex';
        if (loc.landmark) {
          this.locationLandmarkEl.textContent = `📍 ${loc.landmark}`;
          this.locationLandmarkEl.style.display = 'block';
        } else {
          this.locationLandmarkEl.style.display = 'none';
        }
        if (loc.street) {
          this.locationStreetEl.textContent = loc.street;
          this.locationStreetEl.style.display = 'block';
        } else {
          this.locationStreetEl.style.display = 'none';
        }
      }
    }

    // Minimap
    this.minimap.render({
      map: data.map,
      playerX: data.playerX,
      playerZ: data.playerZ,
      playerYaw: data.playerYaw,
      routeWaypoints: data.routeWaypoints,
      waitingPassengers: data.waitingPassengers,
      destinations: shift.activeFares.map((f) => ({ x: f.destinationX, z: f.destinationZ })),
      inBreakMode: data.inBreakMode,
      hiddenByCurse: powerManager.isCurseActive('lone_wolf'),
    });
  }

  private renderFarePanels(
    fares: ActiveFare[],
    data: HUDUpdateData,
    pm: PowerManager
  ): void {
    let html: string;
    let liveFareKey = 'hidden';

    if (fares.length === 0) {
      html = data.inBreakMode
        ? `<div class="hud-fare-card"><div class="hud-fare-dest">🔧 GARAGE BREAK</div><div class="hud-fare-sub">Follow the cyan GPS route to any Raxi Garage, or press B to resume shift.</div></div>`
        : `<div class="hud-fare-card"><div class="hud-fare-dest">🚖 LOOKING FOR FARE</div><div class="hud-fare-sub">Stop in a colored ring: 🟢 Short • 🟡 Med • 🔴 Long<br/>Press <b>B</b> anytime (empty cab) for Garage Break.</div></div>`;
    } else {
      const safetyPenaltyStatMult = pm.stats.get('safety.penaltyMult');
      const deliveryTimeStatMult = pm.stats.get('timer.deliveryMult');
      const cashStatMult = pm.stats.get('score.cashMult');
      const tipStatMult = pm.stats.get('score.tipMult');
      const daredevilCurseActive = pm.isCurseActive('daredevil_license');
      const extraStyleWeight = pm.has('daredevil_license') ? 0.3 : 0;
      const celebrityChauffeurOwned = pm.has('celebrity_chauffeur');
      const midasMeterOwned = pm.has('midas_meter');

      let totalLiveCash = 0;
      let totalLiveTime = 0;
      const previews = fares.map((fare, idx) => {
        const preview = evaluateFareRewards({
          fare,
          tier: data.shift.tier,
          deliveriesCompleted: data.shift.deliveries,
          deliveryComboMult: data.shift.deliveryComboMult,
          safetyPenaltyStatMult,
          deliveryTimeStatMult,
          cashStatMult,
          tipStatMult,
          daredevilCurseActive,
          extraStyleWeight,
          celebrityChauffeurOwned,
          midasMeterOwned,
          deliveryOrderOffset: idx,
        });
        totalLiveCash += preview.rewards.cash;
        totalLiveTime += preview.rewards.deliveryTimeBonus;
        return { fare, preview };
      });

      if (!data.inBreakMode) {
        const cashStr = `$${totalLiveCash.toLocaleString()}`;
        const subStr =
          previews.length > 1
            ? `${previews.length} FARES • +${totalLiveTime.toFixed(1)}s`
            : `${previews[0].preview.midasTriple ? '👑 ×3 • ' : ''}GRADE ${previews[0].preview.ratings.grade} • +${totalLiveTime.toFixed(1)}s`;
        liveFareKey = `${cashStr}|${subStr}`;
        if (liveFareKey !== this.lastLiveFareKey) {
          this.liveFareBox.style.display = 'flex';
          this.liveFareValue.textContent = cashStr;
          this.liveFareSub.textContent = subStr;
        }
      }

      html = previews
        .map(({ fare, preview }) => {
          const { ratings, rewards } = preview;
          const dist = Math.round(Math.hypot(fare.destinationX - data.playerX, fare.destinationZ - data.playerZ));
          const pat = Math.round(getFarePatienceFraction(fare) * 100);
          const w = fare.passenger.weights;
          const isGrandma = fare.passenger.id === 'grandma';

          const rulesHtml = isGrandma
            ? `<div class="hud-rules-checklist">
              <span class="${data.rulesChecklist.redLights === 0 ? 'rule-ok' : 'rule-fail'}">🚦 Lights ${data.rulesChecklist.redLights === 0 ? '✓' : `✗${data.rulesChecklist.redLights}`}</span>
              <span class="${fare.accidents === 0 ? 'rule-ok' : 'rule-fail'}">🛡️ Safe ${fare.accidents === 0 ? '✓' : `✗${fare.accidents}`}</span>
            </div>`
            : '';

          return `
          <div class="hud-fare-card">
            <div class="hud-fare-header">
              <div class="hud-fare-emoji">${fare.passenger.emoji}</div>
              <div style="min-width:0;flex:1">
                <div class="hud-fare-dest">${fare.destinationName} (${dist} m)</div>
                <div class="hud-fare-sub">${fare.passenger.name} • ${fare.passenger.tagline}</div>
              </div>
              <div class="hud-fare-payout">$${rewards.cash.toLocaleString()}</div>
            </div>
            <div class="hud-bar-row">
              <span>⚡ SPD ${Math.round(w.speed * 100)}%</span>
              <div class="hud-bar-track"><div class="hud-bar-fill" style="width:${Math.round(ratings.speedRating * 100)}%;background:#29b6f6"></div></div>
              <span>${Math.round(ratings.speedRating * 100)}%</span>
            </div>
            <div class="hud-bar-row">
              <span>🔥 STY ${Math.round(w.style * 100)}%</span>
              <div class="hud-bar-track"><div class="hud-bar-fill" style="width:${Math.round(ratings.styleRating * 100)}%;background:#ffab00"></div></div>
              <span>${Math.round(ratings.styleRating * 100)}%</span>
            </div>
            <div class="hud-bar-row">
              <span>🛡️ SAF ${Math.round(w.safety * 100)}%</span>
              <div class="hud-bar-track"><div class="hud-bar-fill" style="width:${Math.round(ratings.safetyRating * 100)}%;background:#00e676"></div></div>
              <span>${Math.round(ratings.safetyRating * 100)}%</span>
            </div>
            <div class="hud-bar-row">
              <span>⌛ PAT</span>
              <div class="hud-bar-track"><div class="hud-bar-fill" style="width:${pat}%;background:${pat < 25 ? '#ff3d57' : '#cfd8dc'}"></div></div>
              <span>${ratings.grade}</span>
            </div>
            ${rulesHtml}
          </div>
        `;
        })
        .join('');
    }

    if (liveFareKey === 'hidden' && this.lastLiveFareKey !== 'hidden') {
      this.liveFareBox.style.display = 'none';
    }
    this.lastLiveFareKey = liveFareKey;

    if (html !== this.lastFareHtml) {
      this.lastFareHtml = html;
      this.fareContainer.innerHTML = html;
    }
  }

  private renderAbilitySlots(pm: PowerManager): void {
    const keys = ['Q', 'E'];
    const html = pm.activeSlots
      .map((slot, idx) => {
        if (!slot) {
          return `<div class="hud-ability-slot"><span class="hud-ability-key">${keys[idx]}</span><span class="hud-ability-icon" style="opacity:0.25">—</span><span class="hud-ability-name">Empty</span></div>`;
        }
        const totalCd = Math.max(0.1, (slot.def.active?.cooldown ?? 1) * pm.stats.get('ability.cooldownMult'));
        const cdFrac = slot.isActive ? 0 : Math.min(1, slot.cooldownRemaining / totalCd);
        const cls = slot.isActive ? 'active' : slot.cooldownRemaining <= 0 ? 'ready' : '';
        const keyLabel = slot.powerId === 'nitro_tank' ? `${keys[idx]}/SHFT` : keys[idx];
        const statusTxt = slot.isActive
          ? `${slot.activeRemaining.toFixed(1)}s`
          : slot.cooldownRemaining > 0
            ? `${Math.ceil(slot.cooldownRemaining)}s`
            : slot.def.name;
        return `
          <div class="hud-ability-slot ${cls}">
            <div class="hud-ability-cd-fill" style="height:${Math.round(cdFrac * 100)}%"></div>
            <span class="hud-ability-key">${keyLabel}</span>
            <span class="hud-ability-icon">${slot.def.icon}</span>
            <span class="hud-ability-name">${statusTxt}</span>
          </div>
        `;
      })
      .join('');
    if (html !== this.lastAbilitiesHtml) {
      this.lastAbilitiesHtml = html;
      this.abilitiesRow.innerHTML = html;
    }
  }
}
