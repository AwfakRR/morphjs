export type MorphTarget = string | Element | NodeList | Element[];
export type MorphTargets = MorphTarget | MorphTarget[];

export type EasingValue = string | ((t: number) => number) | [number, number, number, number];

export interface MorphAnimationOptions {
  duration?: number;
  delay?: number;
  ease?: EasingValue;
  repeat?: number;
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  autoplay?: boolean;
  engine?: 'motion' | 'anime' | 'gsap' | string;
  adapter?: string;
  onStart?: () => void;
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
  onCancel?: () => void;
}

export interface MorphSpringOptions {
  stiffness?: number;
  damping?: number;
  mass?: number;
  velocity?: number;
  restDelta?: number;
  restSpeed?: number;
}

export interface MorphStaggerOptions {
  each?: number;
  from?: number | 'first' | 'center' | 'last' | 'random';
  grid?: [number, number] | [number, number, number];
  jitter?: number;
  seed?: number;
  start?: number | string;
  ease?: EasingValue;
}

export interface TimelineOptions extends MorphAnimationOptions {
  defaults?: MorphAnimationOptions;
  engine?: 'anime' | 'gsap';
}

export interface MorphControls {
  play(): void;
  pause(): void;
  reverse(): void;
  cancel(): void;
  finish(): void;
  restart(): void;
  seek?(time: number): void;
  readonly duration?: number;
  readonly progress: number;
  readonly currentTime: number;
  readonly playState: 'running' | 'paused' | 'finished' | 'idle' | 'cancelled';
  readonly finished: Promise<void>;
  then(onFulfilled?: () => void, onRejected?: (reason: any) => void): Promise<void>;
  commitStyles(): void;
}

export interface MorphTimeline extends MorphControls {
  add(targets: MorphTargets, properties: Record<string, any>, offset?: string | number): MorphTimeline;
  add(child: MorphTimeline, offset?: string | number): MorphTimeline;
  label(name: string, offset?: string | number): MorphTimeline;
  addLabel(name: string, offset?: string | number): MorphTimeline;
  seek(position: string | number): void;
  play(position?: string | number): void;
  addPause(offset?: string | number, callback?: () => void): MorphTimeline;
  duration: number;
}

export interface MorphScrollOptions {
  target?: Element;
  container?: Element;
  axis?: 'x' | 'y';
  offset?: [string | number, string | number];
  pin?: boolean | string | Element;
  scrub?: boolean | number;
  engine?: 'motion' | 'gsap';
}

export interface MorphGestureOptions {
  drag?: boolean | {
    constraints?: { left?: number; right?: number; top?: number; bottom?: number };
    momentum?: boolean;
    snapToOrigin?: boolean;
  };
  hover?: boolean;
  press?: boolean;
  onDragStart?: (event: Event, info: any) => void;
  onDrag?: (event: Event, info: any) => void;
  onDragEnd?: (event: Event, info: any) => void;
  onHoverStart?: (event: Event) => void;
  onHoverEnd?: (event: Event) => void;
  onPressStart?: (event: Event) => void;
  onPressEnd?: (event: Event) => void;
}

export interface MorphSvgOptions extends MorphAnimationOptions {
  morphPrecision?: number;
  engine?: 'anime' | 'gsap';
}

export interface MorphMotionPathOptions extends Pick<
  MorphAnimationOptions, 'duration' | 'ease' | 'repeat' | 'autoplay' | 'onStart' | 'onUpdate' | 'onComplete'
> {
  delay?: number;
  start?: number;
  end?: number;
  autoRotate?: boolean;
}
