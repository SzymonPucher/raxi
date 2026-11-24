import { RestrictedAuthState } from '../auth/RestrictedAuth';
import { CarCondition } from '../gameplay/CarCondition';
import { ShiftSummary } from '../gameplay/Shift';
import { Wallet } from '../gameplay/Wallet';
import { InputState } from '../input/Actions';
import { DraftOffer } from '../powers/Draft';
import { PowerManager } from '../powers/PowerManager';
import { PowerDef } from '../powers/PowerTypes';
import { GameSettings, HighScoreEntry, PersistentStats } from '../save/Storage';
import { Shop } from '../shop/Shop';
import { MapId } from '../world/MapRegistry';
import { HUD } from './hud/HUD';
import {
  ScreenCallbacks,
  renderDraftScreen,
  renderHighScores,
  renderHowToPlay,
  renderMainMenu,
  renderPauseMenu,
  renderSettings,
  renderShiftOver,
  renderShopScreen,
} from './screens/Screens';

export type ActiveScreen =
  | 'none'
  | 'main'
  | 'pause'
  | 'howToPlay'
  | 'highScores'
  | 'settings'
  | 'draft'
  | 'shop'
  | 'shiftOver';

/**
 * Coordinates HUD + full keyboard-navigable overlay screens (§11).
 */
export class UIManager {
  public readonly hud: HUD;
  public activeScreen: ActiveScreen = 'none';
  private readonly screenOverlay: HTMLDivElement;
  private focusables: HTMLElement[] = [];
  private focusIdx = 0;

  constructor(
    root: HTMLElement,
    private readonly callbacks: ScreenCallbacks
  ) {
    this.hud = new HUD(root);
    this.screenOverlay = document.createElement('div');
    this.screenOverlay.className = 'screen-overlay';
    this.screenOverlay.style.display = 'none';
    root.appendChild(this.screenOverlay);
  }

  hideScreen(): void {
    this.activeScreen = 'none';
    this.screenOverlay.style.display = 'none';
    this.screenOverlay.classList.remove('menu-backdrop');
    this.screenOverlay.innerHTML = '';
    this.focusables = [];
    this.focusIdx = 0;
  }

  private mountScreen(name: ActiveScreen, focusables: HTMLElement[], initialFocusIdx = 0): void {
    this.activeScreen = name;
    this.screenOverlay.style.display = 'flex';
    this.screenOverlay.classList.toggle('menu-backdrop', name === 'main');
    this.focusables = focusables.filter((el) => !(el as HTMLButtonElement).disabled);
    this.focusIdx =
      this.focusables.length > 0
        ? Math.max(0, Math.min(this.focusables.length - 1, initialFocusIdx))
        : 0;
    this.applyFocusVisual();
  }

  showMainMenu(stats: PersistentStats, selectedMap: MapId, focusMapId?: MapId): void {
    this.hud.setVisible(false);
    const focusables = renderMainMenu(this.screenOverlay, stats, selectedMap, this.callbacks);
    let initialIdx = focusables.findIndex((el) => el.dataset.act === 'new');
    if (focusMapId) {
      const cardIdx = focusables.findIndex((el) => el.dataset.mapId === focusMapId);
      if (cardIdx >= 0) initialIdx = cardIdx;
    }
    this.mountScreen('main', focusables, initialIdx >= 0 ? initialIdx : 0);
  }

  showPause(): void {
    this.mountScreen('pause', renderPauseMenu(this.screenOverlay, this.callbacks));
  }

  showHowToPlay(): void {
    this.mountScreen('howToPlay', renderHowToPlay(this.screenOverlay, this.callbacks));
  }

  showHighScores(scores: readonly HighScoreEntry[]): void {
    this.mountScreen('highScores', renderHighScores(this.screenOverlay, scores, this.callbacks));
  }

  showSettings(settings: GameSettings, authState: RestrictedAuthState): void {
    this.mountScreen(
      'settings',
      renderSettings(this.screenOverlay, settings, authState, this.callbacks)
    );
  }

  showDraft(
    offer: DraftOffer,
    powerManager: PowerManager,
    rerollsRemaining: number,
    pendingReplacePower: PowerDef | null
  ): void {
    this.hud.setVisible(false);
    this.mountScreen(
      'draft',
      renderDraftScreen(
        this.screenOverlay,
        offer,
        powerManager,
        rerollsRemaining,
        pendingReplacePower,
        this.callbacks
      )
    );
  }

  showShop(params: {
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
  }): void {
    this.hud.setVisible(false);
    this.mountScreen('shop', renderShopScreen(this.screenOverlay, params, this.callbacks));
  }

  showShiftOver(
    summary: ShiftSummary,
    isNewBest: boolean,
    highScores: readonly HighScoreEntry[],
    activeMapId: MapId
  ): void {
    this.hud.setVisible(false);
    this.mountScreen(
      'shiftOver',
      renderShiftOver(this.screenOverlay, summary, isNewBest, highScores, activeMapId, this.callbacks)
    );
  }

  /** Keyboard & Gamepad UI navigation via InputState `ui*` actions (§4, §11). */
  handleMenuInput(input: InputState): void {
    if (this.activeScreen === 'none') return;

    // Draft card hotkeys 1..4
    if (this.activeScreen === 'draft') {
      const cards = Array.from(this.screenOverlay.querySelectorAll<HTMLElement>('.power-card'));
      if (input.slot1 && cards[0]) { cards[0].click(); return; }
      if (input.slot2 && cards[1]) { cards[1].click(); return; }
      if (input.slot3 && cards[2]) { cards[2].click(); return; }
      if (input.slot4 && cards[3]) { cards[3].click(); return; }
    }

    if (input.uiBack) {
      if (this.activeScreen === 'pause') this.callbacks.onResume();
      else if (this.activeScreen === 'settings' || this.activeScreen === 'howToPlay' || this.activeScreen === 'highScores') {
        this.callbacks.onCloseSubscreen();
      } else if (this.activeScreen === 'shop') {
        this.callbacks.onShopLeaveToBreak();
      }
      return;
    }

    if (this.focusables.length === 0) return;

    if (input.uiDown || input.uiRight) {
      this.focusIdx = (this.focusIdx + 1) % this.focusables.length;
      this.applyFocusVisual();
    } else if (input.uiUp || input.uiLeft) {
      this.focusIdx = (this.focusIdx - 1 + this.focusables.length) % this.focusables.length;
      this.applyFocusVisual();
    } else if (input.uiConfirm) {
      this.focusables[this.focusIdx]?.click();
    }
  }

  private applyFocusVisual(): void {
    this.focusables.forEach((el, idx) => {
      el.classList.toggle('focused', idx === this.focusIdx);
    });
  }
}
