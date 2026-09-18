// ponytail: minimal typed pub/sub. Dropped unused onAny/offAny/once/clear.
import type { AnimationEvent } from './types';

export type EventHandler<T = any> = (data: T) => void;

export class EventBus<Events extends Record<string, any>> {
  private listeners = new Map<keyof Events, Set<EventHandler>>();

  on<K extends keyof Events>(event: K, callback: EventHandler<Events[K]>): void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(callback);
  }

  off<K extends keyof Events>(event: K, callback: EventHandler<Events[K]>): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }
}

export type AnimationEventMap = {
  start: AnimationEvent;
  update: AnimationEvent;
  complete: AnimationEvent;
  cancel: AnimationEvent;
  pause: AnimationEvent;
  resume: AnimationEvent;
};

export const animationEvents = new EventBus<AnimationEventMap>();
