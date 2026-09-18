import type { App } from 'vue';
import { vMorph } from './directive.js';
import { MorphTransition } from './MorphTransition.js';

export { useMorph } from './useMorph.js';
export { useMorphSpring } from './useMorphSpring.js';
export { vMorph } from './directive.js';
export { MorphTransition } from './MorphTransition.js';

/**
 * Vue plugin for MorphJS.
 */
export const MorphPlugin = {
  install(app: App) {
    app.directive('morph', vMorph);
    app.component('MorphTransition', MorphTransition);
  }
};

export default MorphPlugin;
