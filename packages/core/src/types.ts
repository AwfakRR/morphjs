// Target types
export type MorphTarget = string | Element | NodeList | Element[];
export type MorphTargets = MorphTarget | MorphTarget[];

// Easing
export type EasingFunction = (t: number) => number;
export type CubicBezier = [number, number, number, number];
export type EasingValue = string | EasingFunction | CubicBezier;

// Animation options
export interface MorphAnimationOptions {
  duration?: number;
  delay?: number | ((index: number, total: number) => number);
  ease?: EasingValue;
  repeat?: number;
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  autoplay?: boolean;
  adapter?: string;
  engine?: 'motion' | 'anime' | 'gsap' | string;
  onStart?: () => void;
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
  onCancel?: () => void;
}

// Spring options
export interface MorphSpringOptions {
  stiffness?: number; // default 100
  damping?: number;   // default 10  
  mass?: number;      // default 1
  velocity?: number;  // default 0
  restDelta?: number; // default 0.01
  restSpeed?: number; // default 0.01
}

// Stagger options
export interface MorphStaggerOptions {
  each?: number;
  from?: number | 'first' | 'center' | 'last' | 'random';
  grid?: [number, number] | [number, number, number];
  jitter?: number;
  seed?: number;
  start?: number | string; // e.g. '+=500'
  ease?: EasingValue;
}

// Timeline segment
export interface TimelineSegment {
  targets: MorphTargets;
  properties: Record<string, any>;
  options?: MorphAnimationOptions;
  offset?: string | number;
}

// Timeline defaults
export interface TimelineOptions extends MorphAnimationOptions {
  defaults?: MorphAnimationOptions;
}

// Controls returned from every animation
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

// Timeline controls extend MorphControls
export interface MorphTimeline extends MorphControls {
  add(targets: MorphTargets, properties: Record<string, any>, offset?: string | number): MorphTimeline;
  label(name: string, offset?: string | number): MorphTimeline;
  addPause(offset?: string | number, callback?: () => void): MorphTimeline;
  duration: number;
}

// Scroll options
export interface MorphScrollOptions {
  adapter?: string;
  engine?: string;
  target?: Element;
  container?: Element;
  axis?: 'x' | 'y';
  offset?: [string | number, string | number]; // e.g. ['start end', 'end start']
  pin?: boolean | string | Element;
  scrub?: boolean | number;
}

// Gesture options
export interface MorphGestureOptions {
  drag?: boolean | {
    constraints?: { left?: number; right?: number; top?: number; bottom?: number };
    momentum?: boolean;
    snapToOrigin?: boolean;
  };
  hover?: boolean;
  press?: boolean;
  onDragStart?: (event: Event, info: GestureInfo) => void;
  onDrag?: (event: Event, info: GestureInfo) => void;
  onDragEnd?: (event: Event, info: GestureInfo) => void;
  onHoverStart?: (event: Event) => void;
  onHoverEnd?: (event: Event) => void;
  onPressStart?: (event: Event) => void;
  onPressEnd?: (event: Event) => void;
}

export interface GestureInfo {
  point: { x: number; y: number };
  delta: { x: number; y: number };
  offset: { x: number; y: number };
  velocity: { x: number; y: number };
}

// SVG morph options
export interface MorphSvgOptions extends MorphAnimationOptions {
  morphPrecision?: number;
}

// Layout / FLIP snapshot & options
export interface FlipRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface FlipSnapshot {
  readonly element: Element;
  readonly rect: FlipRect;
  readonly flipId?: string;
  readonly opacity?: number;
}

export interface FlipState {
  readonly snapshots: ReadonlyMap<Element, FlipSnapshot>;
  readonly byId: ReadonlyMap<string, FlipSnapshot>;
}

export interface FlipAnimationEntry {
  readonly element: Element;
  readonly first: FlipRect;
  readonly last: FlipRect;
  readonly dx: number;
  readonly dy: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly properties: Record<string, any>;
}

export interface MorphFlipOptions extends MorphAnimationOptions {
  /** Animate width/height changes via scaleX/scaleY (default: true). */
  scale?: boolean;
  /** Optional spring physics (routes to Motion spring). */
  spring?: boolean | MorphSpringOptions;
  /** Target elements to match against the captured state (e.g. for data-flip-id shared elements). */
  targets?: MorphTargets;
  /** Animate opacity changes captured between states (default: false). */
  fade?: boolean;
  /** Restore pre-FLIP inline transform when the transition completes (default: true). */
  prune?: boolean;
}

export type FlipArg = number | MorphFlipOptions;

// Adapter engine identifier
export type AdapterType = 'motion' | 'anime' | 'gsap' | string;

// Animation lifecycle events
export type AnimationEventType = 'start' | 'update' | 'complete' | 'cancel' | 'pause' | 'resume';

export interface AnimationEvent {
  type: AnimationEventType;
  target: MorphTargets;
  controls: MorphControls;
  timestamp: number;
}

// Plugin adapter registration
export interface AdapterPlugin {
  name: string;
  adapter: IAnimationAdapter;
  priority?: number; // higher priority = preferred for ambiguous cases
  capabilities: AdapterCapability[];
}

export type AdapterCapability = 
  | 'tween' | 'spring' | 'timeline' | 'stagger' 
  | 'scroll' | 'gesture' | 'svg' | 'layout' | 'three';

// The adapter interface — must be implemented by all backends
export interface IAnimationAdapter {
  readonly name: string;
  readonly capabilities: AdapterCapability[];
  
  animate(targets: MorphTargets, properties: Record<string, any>, options?: MorphAnimationOptions): MorphControls;
  spring?(targets: MorphTargets, properties: Record<string, any>, springOpts: MorphSpringOptions, options?: MorphAnimationOptions): MorphControls;
  timeline?(segments: TimelineSegment[], options?: TimelineOptions): MorphTimeline;
  stagger?(value: number, options?: MorphStaggerOptions): any;
  scroll?(animation: MorphControls | ((progress: number) => void), options?: MorphScrollOptions): MorphControls;
  gesture?(targets: MorphTargets, options?: MorphGestureOptions): (() => void) | { cleanup: () => void };
  svg?(targets: MorphTargets, properties: Record<string, any>, options?: MorphSvgOptions): MorphControls;
  layout?(entries: FlipAnimationEntry[], options?: MorphFlipOptions): MorphControls;
  ensure?(): Promise<any>;
  
  dispose?(): void;
}

// MorphJS global configuration
export interface MorphConfig {
  defaultAdapter?: AdapterType;
  defaultDuration?: number;
  defaultEase?: EasingValue;
  reducedMotion?: 'always' | 'never' | 'user'; // respect prefers-reduced-motion
}
