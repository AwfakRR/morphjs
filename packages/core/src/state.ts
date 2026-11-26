import type { MorphControls, MorphTargets } from './types';
import { onControlsCancel } from './utils/controls';
import { resolveTargets } from './utils/targets';

export class StateManager {
  private animations: Map<string, {
    controls: MorphControls;
    targets: MorphTargets;
    createdAt: number;
    stopWatchingCancel: () => void;
  }> = new Map();
  private idCounter: number = 0;

  /** Register an animation and get a unique ID */
  register(controls: MorphControls, targets: MorphTargets): string {
    const id = `anim_${++this.idCounter}`;
    const stopWatchingCancel = onControlsCancel(controls, () => this.unregister(id));
    this.animations.set(id, { controls, targets, createdAt: Date.now(), stopWatchingCancel });

    // Auto-unregister when finished
    controls.finished.then(() => {
      this.unregister(id);
    }).catch(() => {
      this.unregister(id);
    });

    return id;
  }
  
  /** Unregister an animation by ID */
  unregister(id: string): void {
    this.animations.get(id)?.stopWatchingCancel();
    this.animations.delete(id);
  }
  
  /** Get all running animations */
  getRunning(): Array<{ id: string; controls: MorphControls; targets: MorphTargets }> {
    return Array.from(this.animations.entries()).map(([id, data]) => ({
      id,
      controls: data.controls,
      targets: data.targets
    }));
  }
  
  /** Pause all animations */
  pauseAll(): void {
    this.animations.forEach(({ controls }) => controls.pause());
  }
  
  /** Resume all paused animations */
  resumeAll(): void {
    this.animations.forEach(({ controls }) => controls.play());
  }
  
  /** Cancel all animations */
  cancelAll(): void {
    this.animations.forEach(({ controls }, id) => {
      controls.cancel();
      this.unregister(id);
    });
  }
  
  /** Cancel animations on specific targets */
  cancelFor(targets: MorphTargets): void {
    const targetElements = resolveTargets(targets);
    const idsToRemove: string[] = [];

    this.animations.forEach(({ controls, targets: animTargets }, id) => {
      if (animTargets === targets) {
        controls.cancel();
        idsToRemove.push(id);
        return;
      }

      if (targetElements.length > 0) {
        const animElements = resolveTargets(animTargets);
        const hasOverlap = animElements.some(el => targetElements.includes(el));
        if (hasOverlap) {
          controls.cancel();
          idsToRemove.push(id);
        }
      }
    });
    
    idsToRemove.forEach(id => this.unregister(id));
  }
  
  /** Get count of active animations */
  get count(): number {
    return this.animations.size;
  }
  
  /** Clear completed/cancelled animations from tracking */
  prune(): void {
    const toRemove: string[] = [];
    this.animations.forEach(({ controls }, id) => {
      const state = controls.playState;
      if (state === 'finished' || state === 'idle') {
        toRemove.push(id);
      }
    });
    toRemove.forEach(id => this.unregister(id));
  }
}

export const stateManager = new StateManager();
