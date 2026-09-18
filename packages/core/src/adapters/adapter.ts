// ponytail: simple Map-based registry for animation backends
import type { IAnimationAdapter, AdapterPlugin, AdapterCapability } from '../types';

export class AdapterRegistry {
  private adapters = new Map<string, AdapterPlugin>();

  register(plugin: AdapterPlugin): void {
    this.adapters.set(plugin.name, plugin);
  }

  get(name: string): IAnimationAdapter | undefined {
    return this.adapters.get(name)?.adapter;
  }

  findByCapability(capability: AdapterCapability): IAnimationAdapter | undefined {
    let best: AdapterPlugin | undefined;
    for (const plugin of this.adapters.values()) {
      if (plugin.capabilities.includes(capability)) {
        if (!best || (plugin.priority || 0) > (best.priority || 0)) best = plugin;
      }
    }
    return best?.adapter;
  }
}

export const adapterRegistry = new AdapterRegistry();
