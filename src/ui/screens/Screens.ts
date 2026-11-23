import { BALANCE } from '../../core/config/balance';
import { ShiftSummary } from '../../gameplay/Shift';
import { DraftOffer } from '../../powers/Draft';
import { PowerManager } from '../../powers/PowerManager';
import { PowerDef } from '../../powers/PowerTypes';
import { GameSettings, HighScoreEntry, PersistentStats } from '../../save/Storage';
import { Shop } from '../../shop/Shop';
import { CarCondition } from '../../gameplay/CarCondition';
import { Wallet } from '../../gameplay/Wallet';

export interface ScreenCallbacks {
  onNewShift(): void;
  onResume(): void;
  onRestartShift(): void;
  onQuitToMenu(): void;
  onOpenSettings(from: 'main' | 'pause'): void;
  onOpenHowToPlay(): void;
  onOpenHighScores(): void;
  onCloseSubscreen(): void;
  onUpdateSettings(patch: Partial<GameSettings>): void;
  onPickDraftPower(powerId: string, replaceSlotIndex?: number): void;
  onRerollDraft(): void;
  onSkipDraft(): void;
  onBuyShopOffer(offerId: string, replaceSlotIndex?: number): void;
  onBuyRepair(pct: number): void;
  onBuyCleanse(powerId: string): void;
  onBuyShopReroll(): void;
  onShopLeaveToBreak(): void;
  onShopBackToWork(): void;
}

function formatStatPreview(power: PowerDef, pm: PowerManager): string {
  if (!power.statMods || power.statMods.length === 0) return '';
  const preview = pm.stats.previewWith(power.statMods);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(preview)) {
    if (!v) continue;
    const shortKey = k.split('.')[1] ?? k;
    parts.push(`${shortKey}: ${v.before.toFixed(2)} → ${v.after.toFixed(2)}`);
  }
  return parts.length > 0 ? `<div class="stat-preview">${parts.join(' • ')}</div>` : '';
}

export function renderMainMenu(
  container: HTMLElement,
  stats: PersistentStats,
  cb: ScreenCallbacks
): HTMLElement[] {
  container.innerHTML = `
    <div class="screen-panel narrow">
      <h1 class="raxi-logo">RAXI</h1>
      <div class="raxi-checker"></div>
      <p class="screen-subtitle">Roguelike Arcade Taxi • Pick up, drift, draft powers, survive the shift!</p>
      <div class="btn-stack">
        <button class="raxi-btn primary" data-act="new">🚖 NEW SHIFT</button>
        <button class="raxi-btn" data-act="how">📖 HOW TO PLAY</button>
        <button class="raxi-btn" data-act="scores">🏆 HIGH SCORES</button>
        <button class="raxi-btn" data-act="settings">⚙️ SETTINGS</button>
      </div>
      <div class="screen-subtitle" style="margin-top:18px;font-size:12px">
        Best Score: <b>$${stats.bestScore.toLocaleString()}</b> • Shifts: ${stats.shifts} • Deliveries: ${stats.totalDeliveries}
      </div>
    </div>
  `;
  const btns = Array.from(container.querySelectorAll<HTMLElement>('button'));
  btns[0].onclick = () => cb.onNewShift();
  btns[1].onclick = () => cb.onOpenHowToPlay();
  btns[2].onclick = () => cb.onOpenHighScores();
  btns[3].onclick = () => cb.onOpenSettings('main');
  return btns;
}

export function renderPauseMenu(container: HTMLElement, cb: ScreenCallbacks): HTMLElement[] {
  container.innerHTML = `
    <div class="screen-panel narrow">
      <h2 style="font-family:var(--font-display);font-size:40px;color:var(--taxi-yellow);margin:0">PAUSED</h2>
      <div class="raxi-checker"></div>
      <div class="btn-stack">
        <button class="raxi-btn primary">▶ RESUME</button>
        <button class="raxi-btn">🔄 RESTART SHIFT</button>
        <button class="raxi-btn">⚙️ SETTINGS</button>
        <button class="raxi-btn danger">🚪 MAIN MENU</button>
      </div>
    </div>
  `;
  const btns = Array.from(container.querySelectorAll<HTMLElement>('button'));
  btns[0].onclick = () => cb.onResume();
  btns[1].onclick = () => cb.onRestartShift();
  btns[2].onclick = () => cb.onOpenSettings('pause');
  btns[3].onclick = () => cb.onQuitToMenu();
  return btns;
}

export function renderHowToPlay(container: HTMLElement, cb: ScreenCallbacks): HTMLElement[] {
  container.innerHTML = `
    <div class="screen-panel">
      <h2 style="font-family:var(--font-display);font-size:34px;color:var(--taxi-yellow);margin:0">HOW TO PLAY</h2>
      <div class="raxi-checker"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;font-size:13px;line-height:1.55">
        <div>
          <h3 style="color:var(--taxi-yellow);margin:0 0 6px">🚖 THE SHIFT</h3>
          <p>You start with <b>90 seconds</b>. Stop inside a colored ring (🟢 Short, 🟡 Medium, 🔴 Long) to pick up a passenger, then race to the glowing green beam!</p>
          <p>Every <b>3 deliveries</b> triggers a <b>Power Draft</b> (pick 1 of 3 roguelike powers). When the shift timer hits 0, your run ends.</p>
          <h3 style="color:var(--taxi-yellow);margin:12px 0 6px">👵 PASSENGER TYPES</h3>
          <p>Each passenger values Speed, Style, and Safety differently! <b>Grandma</b> wants you to obey red lights, use <b>Z/X blinkers</b> before lane changes, and respect speed limits — a clean Grandma trip pays massive time & tips!</p>
          <p>Watch out for <b>pedestrians</b>: hitting them triggers a cartoon explosion (−12% car condition & big safety hit!).</p>
        </div>
        <div>
          <h3 style="color:var(--taxi-yellow);margin:0 0 6px">🔧 GARAGE BREAKS</h3>
          <p>With no passenger on board, press <b>B</b> to enter <b>Break Mode</b>: the shift timer freezes! Follow the cyan GPS route to any of the 4 <b>Raxi Garages</b> to spend your wallet on powers, repairs, or cleansing curses.</p>
          <h3 style="color:var(--taxi-yellow);margin:12px 0 6px">⌨️ CONTROLS</h3>
          <table class="raxi-table">
            <tr><td><b>W / S / A / D</b> or Arrows</td><td>Drive & Steer</td></tr>
            <tr><td><b>Space</b></td><td>Handbrake (Drift!)</td></tr>
            <tr><td><b>Q / E / Shift</b></td><td>Active Powers / Nitro</td></tr>
            <tr><td><b>Z / X</b></td><td>Left / Right Blinker</td></tr>
            <tr><td><b>H / C</b></td><td>Horn / Look Back</td></tr>
            <tr><td><b>B / Hold R / Esc</b></td><td>Shop Break / Reset / Pause</td></tr>
          </table>
        </div>
      </div>
      <div class="btn-row"><button class="raxi-btn primary">BACK</button></div>
    </div>
  `;
  const btns = Array.from(container.querySelectorAll<HTMLElement>('button'));
  btns[0].onclick = () => cb.onCloseSubscreen();
  return btns;
}

export function renderHighScores(
  container: HTMLElement,
  scores: readonly HighScoreEntry[],
  cb: ScreenCallbacks
): HTMLElement[] {
  const rows =
    scores.length === 0
      ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No completed shifts yet — hit the road!</td></tr>`
      : scores
          .map(
            (s, i) =>
              `<tr><td>#${i + 1}</td><td style="color:var(--taxi-yellow);font-weight:800">$${s.score.toLocaleString()}</td><td>${s.deliveries}</td><td>${s.timeSurvived}s</td><td><code>${s.seed}</code> (${s.date})</td></tr>`
          )
          .join('');
  container.innerHTML = `
    <div class="screen-panel">
      <h2 style="font-family:var(--font-display);font-size:34px;color:var(--taxi-yellow);margin:0">🏆 HIGH SCORES</h2>
      <div class="raxi-checker"></div>
      <table class="raxi-table">
        <thead><tr><th>Rank</th><th>Score</th><th>Deliveries</th><th>Time</th><th>Seed / Date</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="btn-row"><button class="raxi-btn primary">BACK</button></div>
    </div>
  `;
  const btns = Array.from(container.querySelectorAll<HTMLElement>('button'));
  btns[0].onclick = () => cb.onCloseSubscreen();
  return btns;
}

export function renderSettings(
  container: HTMLElement,
  settings: GameSettings,
  cb: ScreenCallbacks
): HTMLElement[] {
  container.innerHTML = `
    <div class="screen-panel narrow" style="text-align:left;max-width:560px">
      <h2 style="font-family:var(--font-display);font-size:34px;color:var(--taxi-yellow);margin:0;text-align:center">⚙️ SETTINGS</h2>
      <div class="raxi-checker"></div>
      <div class="settings-row">
        <label>Master Volume (<span id="v-master">${Math.round(settings.masterVolume * 100)}%</span>)</label>
        <input id="s-master" type="range" min="0" max="100" value="${Math.round(settings.masterVolume * 100)}" />
      </div>
      <div class="settings-row">
        <label>Music Volume (<span id="v-music">${Math.round(settings.musicVolume * 100)}%</span>)</label>
        <input id="s-music" type="range" min="0" max="100" value="${Math.round(settings.musicVolume * 100)}" />
      </div>
      <div class="settings-row">
        <label>SFX Volume (<span id="v-sfx">${Math.round(settings.sfxVolume * 100)}%</span>)</label>
        <input id="s-sfx" type="range" min="0" max="100" value="${Math.round(settings.sfxVolume * 100)}" />
      </div>
      <div class="settings-row">
        <label>Graphics Preset</label>
        <select id="s-gfx">
          <option value="low" ${settings.graphicsPreset === 'low' ? 'selected' : ''}>Low (No Shadows, 0.75×)</option>
          <option value="medium" ${settings.graphicsPreset === 'medium' ? 'selected' : ''}>Medium (Balanced)</option>
          <option value="high" ${settings.graphicsPreset === 'high' ? 'selected' : ''}>High (2048 Shadows + Vignette)</option>
        </select>
      </div>
      <div class="settings-row">
        <label>Resolution Scale (<span id="v-res">${Math.round(settings.resolutionScale * 100)}%</span>)</label>
        <input id="s-res" type="range" min="50" max="100" step="5" value="${Math.round(settings.resolutionScale * 100)}" />
      </div>
      <div class="settings-row">
        <label>Camera Shake</label>
        <button class="raxi-btn" id="s-shake" style="padding:6px 14px;font-size:14px">${settings.cameraShake ? 'ON' : 'OFF'}</button>
      </div>
      <div class="settings-row">
        <label>Speed Units</label>
        <button class="raxi-btn" id="s-units" style="padding:6px 14px;font-size:14px">${settings.speedUnits.toUpperCase()}</button>
      </div>
      <div class="settings-row">
        <label>Show Controls Hint</label>
        <button class="raxi-btn" id="s-ctrl" style="padding:6px 14px;font-size:14px">${settings.showControls ? 'ON' : 'OFF'}</button>
      </div>
      <div class="btn-row"><button class="raxi-btn primary" id="s-back">DONE</button></div>
    </div>
  `;

  const bindRange = (id: string, lbl: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'resolutionScale') => {
    const inp = container.querySelector<HTMLInputElement>(id)!;
    const sp = container.querySelector<HTMLSpanElement>(lbl)!;
    inp.oninput = () => {
      const v = Number(inp.value) / 100;
      sp.textContent = `${inp.value}%`;
      cb.onUpdateSettings({ [key]: v } as Partial<GameSettings>);
    };
  };
  bindRange('#s-master', '#v-master', 'masterVolume');
  bindRange('#s-music', '#v-music', 'musicVolume');
  bindRange('#s-sfx', '#v-sfx', 'sfxVolume');
  bindRange('#s-res', '#v-res', 'resolutionScale');

  const gfxSel = container.querySelector<HTMLSelectElement>('#s-gfx')!;
  gfxSel.onchange = () => {
    const val = gfxSel.value as GameSettings['graphicsPreset'];
    cb.onUpdateSettings({ graphicsPreset: val, resolutionScale: val === 'low' ? 0.75 : 1.0 });
  };

  const shakeBtn = container.querySelector<HTMLButtonElement>('#s-shake')!;
  shakeBtn.onclick = () => {
    const next = !settings.cameraShake;
    shakeBtn.textContent = next ? 'ON' : 'OFF';
    cb.onUpdateSettings({ cameraShake: next });
  };

  const unitsBtn = container.querySelector<HTMLButtonElement>('#s-units')!;
  unitsBtn.onclick = () => {
    const next = settings.speedUnits === 'kmh' ? 'mph' : 'kmh';
    unitsBtn.textContent = next.toUpperCase();
    cb.onUpdateSettings({ speedUnits: next });
  };

  const ctrlBtn = container.querySelector<HTMLButtonElement>('#s-ctrl')!;
  ctrlBtn.onclick = () => {
    const next = !settings.showControls;
    ctrlBtn.textContent = next ? 'ON' : 'OFF';
    cb.onUpdateSettings({ showControls: next });
  };

  const backBtn = container.querySelector<HTMLButtonElement>('#s-back')!;
  backBtn.onclick = () => cb.onCloseSubscreen();

  return [shakeBtn, unitsBtn, ctrlBtn, backBtn];
}

export function renderDraftScreen(
  container: HTMLElement,
  offer: DraftOffer,
  powerManager: PowerManager,
  rerollsRemaining: number,
  pendingReplacePower: PowerDef | null,
  cb: ScreenCallbacks
): HTMLElement[] {
  if (pendingReplacePower) {
    const slot0 = powerManager.activeSlots[0];
    const slot1 = powerManager.activeSlots[1];
    container.innerHTML = `
      <div class="screen-panel narrow">
        <h2 style="font-family:var(--font-display);font-size:30px;color:var(--taxi-yellow);margin:0">REPLACE ACTIVE SLOT</h2>
        <div class="raxi-checker"></div>
        <p class="screen-subtitle">Both active slots are full! Pick which ability to replace with <b>${pendingReplacePower.icon} ${pendingReplacePower.name}</b>:</p>
        <div class="btn-stack">
          <button class="raxi-btn">Replace Slot Q: ${slot0?.def.icon ?? ''} ${slot0?.def.name ?? 'Empty'}</button>
          <button class="raxi-btn">Replace Slot E: ${slot1?.def.icon ?? ''} ${slot1?.def.name ?? 'Empty'}</button>
          <button class="raxi-btn danger">Cancel</button>
        </div>
      </div>
    `;
    const btns = Array.from(container.querySelectorAll<HTMLElement>('button'));
    btns[0].onclick = () => cb.onPickDraftPower(pendingReplacePower.id, 0);
    btns[1].onclick = () => cb.onPickDraftPower(pendingReplacePower.id, 1);
    btns[2].onclick = () => cb.onPickDraftPower('', -1);
    return btns;
  }

  const allCards: PowerDef[] = [...offer.cards];
  if (offer.curseCard) allCards.push(offer.curseCard);

  const cardsHtml = allCards
    .map((p, idx) => {
      const ownedStacks = powerManager.getStacks(p.id);
      const stackTxt =
        p.maxStacks > 1 ? `Stack ${ownedStacks}/${p.maxStacks}` : p.active ? 'ACTIVE ABILITY' : 'UNIQUE';
      const tagsHtml = p.tags.map((t) => `<span class="tag-pill">${t}</span>`).join('');
      const curseHtml = p.curse ? `<div class="power-card-curse">${p.curse.description}</div>` : '';
      const preview = formatStatPreview(p, powerManager);

      return `
        <button class="power-card rarity-${p.rarity}" data-power-id="${p.id}">
          <span class="power-card-key">${idx + 1}</span>
          <div class="power-card-icon">${p.icon}</div>
          <div class="power-card-rarity">${p.rarity === 'cursed' ? "😈 DEVIL'S DEAL" : p.rarity} • ${stackTxt}</div>
          <div class="power-card-name">${p.name}</div>
          <div class="power-card-desc">${p.description}</div>
          ${curseHtml}
          ${preview}
          <div class="power-card-tags">${tagsHtml}</div>
        </button>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="screen-panel">
      <h2 style="font-family:var(--font-display);font-size:36px;color:var(--taxi-yellow);margin:0;text-align:center">⚡ POWER DRAFT #${offer.draftNumber}</h2>
      <div class="raxi-checker"></div>
      <p class="screen-subtitle" style="text-align:center">Choose 1 power (Keys 1–${allCards.length} or ←/→ + Enter)</p>
      <div class="draft-grid">${cardsHtml}</div>
      <div class="btn-row">
        <button class="raxi-btn" id="draft-reroll" ${rerollsRemaining <= 0 ? 'disabled' : ''}>🎲 REROLL (${rerollsRemaining} left)</button>
        <button class="raxi-btn" id="draft-skip">⏭️ SKIP (+${BALANCE.draftSkipTimeBonus}s TIME)</button>
      </div>
    </div>
  `;

  const cardEls = Array.from(container.querySelectorAll<HTMLElement>('.power-card'));
  cardEls.forEach((el) => {
    el.onclick = () => cb.onPickDraftPower(el.dataset.powerId!);
  });
  const rerollBtn = container.querySelector<HTMLButtonElement>('#draft-reroll')!;
  rerollBtn.onclick = () => cb.onRerollDraft();
  const skipBtn = container.querySelector<HTMLButtonElement>('#draft-skip')!;
  skipBtn.onclick = () => cb.onSkipDraft();

  return [...cardEls, rerollBtn, skipBtn];
}

export function renderShopScreen(
  container: HTMLElement,
  params: {
    garageName: string;
    shop: Shop;
    runSeed: number;
    deliveryCount: number;
    tier: number;
    wallet: Wallet;
    condition: CarCondition;
    powerManager: PowerManager;
    pendingReplaceOfferId: string | null;
    pendingReplacePower: PowerDef | null;
  },
  cb: ScreenCallbacks
): HTMLElement[] {
  const { shop, wallet, condition, powerManager } = params;

  if (params.pendingReplaceOfferId && params.pendingReplacePower) {
    const slot0 = powerManager.activeSlots[0];
    const slot1 = powerManager.activeSlots[1];
    container.innerHTML = `
      <div class="screen-panel narrow">
        <h2 style="font-family:var(--font-display);font-size:30px;color:var(--taxi-yellow);margin:0">REPLACE ACTIVE SLOT</h2>
        <div class="raxi-checker"></div>
        <p class="screen-subtitle">Replace which slot with <b>${params.pendingReplacePower.icon} ${params.pendingReplacePower.name}</b>?</p>
        <div class="btn-stack">
          <button class="raxi-btn">Replace Q: ${slot0?.def.icon ?? ''} ${slot0?.def.name ?? ''}</button>
          <button class="raxi-btn">Replace E: ${slot1?.def.icon ?? ''} ${slot1?.def.name ?? ''}</button>
          <button class="raxi-btn danger">Cancel</button>
        </div>
      </div>
    `;
    const btns = Array.from(container.querySelectorAll<HTMLElement>('button'));
    btns[0].onclick = () => cb.onBuyShopOffer(params.pendingReplaceOfferId!, 0);
    btns[1].onclick = () => cb.onBuyShopOffer(params.pendingReplaceOfferId!, 1);
    btns[2].onclick = () => cb.onBuyShopOffer('', -1);
    return btns;
  }

  const stock = shop.getStock({
    runSeed: params.runSeed,
    deliveryCount: params.deliveryCount,
    tier: params.tier,
    powerManager,
  });

  const rep25Cost = shop.getRepairCost(condition, 25, powerManager);
  const repFullCost = shop.getRepairCost(condition, 100, powerManager);
  const rerollCost = shop.getRerollCost(powerManager);
  const cursedOwned = powerManager.getOwnedCursedUncleansed();
  const cleanseCost = shop.getCleanseCost(params.tier, powerManager);

  const offersHtml = stock.offers
    .map((o) => {
      const disabled = o.purchased || !wallet.canAfford(o.price) || powerManager.isMaxed(o.power.id);
      const preview = formatStatPreview(o.power, powerManager);
      const bmBadge = o.isBlackMarket ? '🕶️ BLACK MARKET • ' : '';
      return `
        <button class="power-card rarity-${o.power.rarity}" data-offer="${o.offerId}" ${disabled ? 'disabled' : ''}>
          <div class="power-card-icon">${o.power.icon}</div>
          <div class="power-card-rarity">${bmBadge}${o.power.rarity}</div>
          <div class="power-card-name">${o.power.name}</div>
          <div class="power-card-desc">${o.power.description}</div>
          ${preview}
          <div style="font-family:var(--font-display);font-size:20px;color:${o.purchased ? '#888' : '#00e676'};margin-top:4px">
            ${o.purchased ? 'SOLD' : `$${o.price}`}
          </div>
        </button>
      `;
    })
    .join('');

  const cleanseHtml = cursedOwned
    .map(
      (c) =>
        `<button class="raxi-btn danger" data-cleanse="${c.def.id}" ${!wallet.canAfford(cleanseCost) ? 'disabled' : ''}>✨ CLEANSE ${c.def.name} ($${cleanseCost})</button>`
    )
    .join('');

  const ownedIcons = powerManager
    .getOwnedList()
    .map((o) => `${o.def.icon} ${o.def.name}${o.stacks > 1 ? ` ×${o.stacks}` : ''}${o.cleansed ? ' (Cleansed)' : ''}`)
    .join(' • ');

  container.innerHTML = `
    <div class="screen-panel">
      <div class="shop-header">
        <div>
          <h2 style="font-family:var(--font-display);font-size:32px;color:var(--taxi-yellow);margin:0">🔧 ${params.garageName}</h2>
          <div style="font-size:12px;color:var(--text-muted)">Stock refreshes after each completed delivery</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:var(--font-display);font-size:28px;color:var(--accent-green)">WALLET: $${wallet.balance}</div>
          <div style="font-size:13px;color:${condition.condition < 50 ? '#ff5252' : '#cfd8dc'}">CAR CONDITION: <b>${Math.round(condition.condition)}%</b></div>
        </div>
      </div>
      <div class="raxi-checker"></div>

      <div class="shop-section-title">POWER OFFERS</div>
      <div class="draft-grid">${offersHtml}</div>

      <div class="shop-section-title">GARAGE SERVICES</div>
      <div class="shop-services">
        <button class="raxi-btn" id="shop-rep-25" ${condition.missing < 0.5 || !wallet.canAfford(rep25Cost) ? 'disabled' : ''}>🔧 REPAIR +25% ($${rep25Cost})</button>
        <button class="raxi-btn" id="shop-rep-full" ${condition.missing < 0.5 || !wallet.canAfford(repFullCost) ? 'disabled' : ''}>🛠️ REPAIR FULL ($${repFullCost})</button>
        <button class="raxi-btn" id="shop-reroll" ${!wallet.canAfford(rerollCost) ? 'disabled' : ''}>🎲 REROLL STOCK ($${rerollCost})</button>
        ${cleanseHtml}
      </div>

      ${ownedIcons ? `<div style="margin-top:14px;font-size:12px;color:var(--text-muted)"><b>Owned:</b> ${ownedIcons}</div>` : ''}

      <div class="btn-row">
        <button class="raxi-btn" id="shop-leave">🚗 LEAVE GARAGE (STAY IN BREAK)</button>
        <button class="raxi-btn primary" id="shop-work">🚖 BACK TO WORK (1s)</button>
      </div>
    </div>
  `;

  const focusables: HTMLElement[] = [];
  container.querySelectorAll<HTMLElement>('[data-offer]').forEach((el) => {
    el.onclick = () => cb.onBuyShopOffer(el.dataset.offer!);
    focusables.push(el);
  });

  const rep25 = container.querySelector<HTMLButtonElement>('#shop-rep-25')!;
  rep25.onclick = () => cb.onBuyRepair(25);
  const repFull = container.querySelector<HTMLButtonElement>('#shop-rep-full')!;
  repFull.onclick = () => cb.onBuyRepair(100);
  const reroll = container.querySelector<HTMLButtonElement>('#shop-reroll')!;
  reroll.onclick = () => cb.onBuyShopReroll();
  focusables.push(rep25, repFull, reroll);

  container.querySelectorAll<HTMLElement>('[data-cleanse]').forEach((el) => {
    el.onclick = () => cb.onBuyCleanse(el.dataset.cleanse!);
    focusables.push(el);
  });

  const leaveBtn = container.querySelector<HTMLButtonElement>('#shop-leave')!;
  leaveBtn.onclick = () => cb.onShopLeaveToBreak();
  const workBtn = container.querySelector<HTMLButtonElement>('#shop-work')!;
  workBtn.onclick = () => cb.onShopBackToWork();
  focusables.push(leaveBtn, workBtn);

  return focusables;
}

export function renderShiftOver(
  container: HTMLElement,
  summary: ShiftSummary,
  isNewBest: boolean,
  highScores: readonly HighScoreEntry[],
  cb: ScreenCallbacks
): HTMLElement[] {
  const powersHtml =
    summary.powersTaken.length > 0
      ? summary.powersTaken
          .map((p) => `<span class="tag-pill" style="font-size:12px">${p.icon} ${p.name}${p.stacks > 1 ? ` ×${p.stacks}` : ''}</span>`)
          .join(' ')
      : '<span style="color:var(--text-muted)">None</span>';

  const top5 = highScores
    .slice(0, 5)
    .map(
      (h, i) =>
        `<tr><td>#${i + 1}</td><td style="color:var(--taxi-yellow);font-weight:800">$${h.score.toLocaleString()}</td><td>${h.deliveries}</td><td><code>${h.seed}</code></td></tr>`
    )
    .join('');

  container.innerHTML = `
    <div class="screen-panel">
      <div style="text-align:center">
        <h2 style="font-family:var(--font-display);font-size:46px;color:var(--taxi-yellow);margin:0">SHIFT OVER!</h2>
        ${isNewBest ? '<div style="color:#00e676;font-weight:900;font-size:16px;margin-top:4px">🏆 NEW HIGH SCORE!</div>' : ''}
        <div style="font-family:var(--font-display);font-size:56px;color:#fff;margin:6px 0">$${summary.score.toLocaleString()}</div>
        <div style="font-size:12px;color:var(--text-muted)">Run Seed: <code>${summary.seed}</code> • Time Survived: ${Math.round(summary.timeSurvived)}s</div>
      </div>
      <div class="raxi-checker"></div>

      <div class="stats-grid">
        <div class="stat-box"><div class="stat-box-val">${summary.deliveries}</div><div class="stat-box-label">Deliveries</div></div>
        <div class="stat-box"><div class="stat-box-val">${summary.grades.S}/${summary.grades.A}/${summary.grades.B}/${summary.grades.C}/${summary.grades.D}</div><div class="stat-box-label">Grades S/A/B/C/D</div></div>
        <div class="stat-box"><div class="stat-box-val">×${summary.bestDeliveryCombo.toFixed(2)}</div><div class="stat-box-label">Best Delivery Combo</div></div>
        <div class="stat-box"><div class="stat-box-val">${summary.longestDrift.toFixed(1)}s</div><div class="stat-box-label">Longest Drift</div></div>
        <div class="stat-box"><div class="stat-box-val">${summary.maxAirtime.toFixed(1)}s</div><div class="stat-box-label">Max Airtime</div></div>
        <div class="stat-box"><div class="stat-box-val">${(summary.distanceDriven / 1000).toFixed(2)} km</div><div class="stat-box-label">Distance Driven</div></div>
        <div class="stat-box"><div class="stat-box-val">$${summary.cashSpent} (${summary.itemsBought})</div><div class="stat-box-label">Shop Spent (Items)</div></div>
        <div class="stat-box"><div class="stat-box-val">${summary.pedestriansExploded} / ${summary.ruleViolations}</div><div class="stat-box-label">Peds Boom / Rule Hits</div></div>
      </div>

      <div style="margin:10px 0;font-size:13px"><b>Powers Taken:</b> ${powersHtml}</div>

      <table class="raxi-table">
        <thead><tr><th>Top Shifts</th><th>Score</th><th>Deliveries</th><th>Seed</th></tr></thead>
        <tbody>${top5}</tbody>
      </table>

      <div class="btn-row">
        <button class="raxi-btn primary">🚖 NEW SHIFT</button>
        <button class="raxi-btn">🏠 MAIN MENU</button>
      </div>
    </div>
  `;

  const btns = Array.from(container.querySelectorAll<HTMLElement>('button'));
  btns[0].onclick = () => cb.onNewShift();
  btns[1].onclick = () => cb.onQuitToMenu();
  return btns;
}
