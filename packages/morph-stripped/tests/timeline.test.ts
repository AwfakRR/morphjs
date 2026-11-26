import { expect, it, vi } from 'vitest';
import { engine as animeEngine } from 'animejs';
import { timeline } from '../src/index';

it.each(['pause', 'cancel'] as const)('keeps top-level Anime composition after %s()', async (action) => {
  const target = { x: 0 };
  const first = timeline({ autoplay: false })
    .add(target as any, { x: [0, 100], duration: 2, ease: 'linear' });
  await vi.waitFor(() => expect(first.duration).toBeCloseTo(2));
  first.seek?.(0.5);
  first[action]();
  expect(target.x).toBeCloseTo(action === 'pause' ? 25 : 0);

  const second = timeline({ autoplay: false })
    .add(target as any, { x: [200, 300], duration: 1, ease: 'linear' });
  try {
    await vi.waitFor(() => expect(second.duration).toBeCloseTo(1));
    second.seek?.(0.5);
    first.seek?.(0.75);
    expect(target.x).toBeCloseTo(250);
  } finally {
    first.cancel();
    second.cancel();
  }
});

it('rewinds elapsed rather than rendered time when cancelling a reversed top-level Anime timeline', async () => {
  const target = { x: 0 };
  const tl = timeline({ autoplay: false })
    .add(target as any, { x: [0, 100], duration: 1, ease: 'linear' });
  await vi.waitFor(() => expect(tl.duration).toBeCloseTo(1));
  tl.seek?.(0.4);
  tl.reverse();
  tl.pause();
  expect(target.x).toBeCloseTo(40);
  tl.cancel();
  expect(tl.currentTime).toBeCloseTo(1);
  expect(target.x).toBeCloseTo(100);
});

it.each(['tween', 'child'] as const)('keeps an autoplaying Anime timeline running after adding a %s', async (kind) => {
  const tl = timeline().add({ x: 0 } as any, { x: 100, duration: 5 });

  try {
    await vi.waitFor(() => expect(tl.currentTime).toBeGreaterThan(0.1));
    const time = tl.currentTime;
    const target = { y: 0 };
    if (kind === 'child') {
      tl.add(timeline({ autoplay: false }).add(target as any, { y: 1, duration: 1 }));
    } else {
      tl.add(target as any, { y: 1, duration: 1 });
    }
    await vi.waitFor(() => expect(tl.duration).toBeCloseTo(6));
    expect(tl.currentTime).toBeGreaterThanOrEqual(time);
    expect(tl.playState).toBe('running');
    await vi.waitFor(() => expect(tl.currentTime).toBeGreaterThan(time + 0.05));
  } finally {
    tl.cancel();
  }
});

it('keeps the rendered position when appending to a reversing Anime timeline', async () => {
  const target = { x: 0 };
  const tl = timeline({ autoplay: false })
    .add(target, { x: [0, 100], duration: 2, ease: 'linear' });

  try {
    await vi.waitFor(() => expect(tl.duration).toBeCloseTo(2));
    tl.seek(1.25);
    tl.reverse();
    tl.add({ y: 0 }, { y: 1, duration: 1 });

    expect(tl.duration).toBeCloseTo(3);
    expect(tl.currentTime).toBeCloseTo(1.25);
    expect(target.x).toBeCloseTo(62.5);
    expect(tl.playState).toBe('running');
    await vi.waitFor(() => expect(tl.currentTime).toBeLessThan(1.2));
  } finally {
    tl.cancel();
  }
});

it('positions Anime timeline segments in seconds before and after initialization', async () => {
  const tl = timeline({ autoplay: false })
    .add({ x: 0 }, { x: 1 }, 0)
    .add({ x: 0 }, { x: 1 }, '-=0.2')
    .add({ x: 0 }, { x: 1 }, '-=0.2');

  await vi.waitFor(() => expect(tl.duration).toBeGreaterThan(0));
  expect(tl.duration).toBeCloseTo(2.6, 5);

  tl.add({ x: 0 }, { x: 1 }, 3);
  expect(tl.duration).toBeCloseTo(4, 5);

  tl.add({ x: 0 }, { x: 1 }, '+=0.5');
  expect(tl.duration).toBeCloseTo(5.5, 5);
});

it('uses seconds for Anime timeline defaults', async () => {
  const tl = timeline({ autoplay: false, defaults: { duration: 0.5, delay: 0.25 } })
    .add({ x: 0 }, { x: 100 });

  await vi.waitFor(() => expect(tl.duration).toBeGreaterThan(0));
  expect(tl.duration).toBeCloseTo(0.75, 5);
});

it('uses seconds for Anime segment timing before and after initialization', async () => {
  const tl = timeline({ autoplay: false })
    .add({ x: 0 }, { x: 100, duration: 0.5, delay: 0.25 });

  await vi.waitFor(() => expect(tl.duration).toBeGreaterThan(0));
  expect(tl.duration).toBeCloseTo(0.75, 5);

  tl.add({ x: 0 }, { x: 100, duration: 0.25, delay: 0.125 });
  expect(tl.duration).toBeCloseTo(1.125, 5);
});

it.each(['anime', 'gsap'] as const)('uses labels in builder order and playback on %s', async (engine) => {
  const target = { x: 0 };
  const tl = timeline({ engine, autoplay: false })
    .label('intro', 0.25)
    .add(target as any, { x: 100, duration: 1, ease: 'linear' }, 'intro+=0.25');

  try {
    tl.seek('intro+=0.75');
    await vi.waitFor(() => expect(tl.currentTime).toBeCloseTo(1));
    expect(target.x).toBeCloseTo(50);
    expect(tl.duration).toBeCloseTo(1.5);

    tl.seek(0.75);
    expect(tl.currentTime).toBeCloseTo(0.75);
    expect(target.x).toBeCloseTo(25);

    tl.addLabel('outro', 'intro+=1');
    tl.play('outro');
    tl.pause();
    expect(tl.currentTime).toBeCloseTo(1.25);
    expect(target.x).toBeCloseTo(75);
  } finally {
    tl.cancel();
  }
});

it.each(['anime', 'gsap'] as const)('scrubs nested timelines at label-relative offsets on %s', async (engine) => {
  const target = { x: 0 };
  const child = timeline({ engine, autoplay: false })
    .label('start', 0.25)
    .add(target as any, { x: 100, duration: 1, ease: 'linear' }, 'start');
  const scene = timeline({ engine, autoplay: false }).add(child, 0.25);
  const parent = timeline({ engine, autoplay: false })
    .addLabel('scene', 0.5)
    .add(scene, 'scene+=0.5')
    .label('end');

  try {
    parent.seek('scene+=1.5');
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(2));
    expect(child.currentTime).toBeCloseTo(0.75);
    expect(target.x).toBeCloseTo(50);
    expect(parent.duration).toBeCloseTo(2.5);

    parent.seek('end');
    expect(target.x).toBeCloseTo(100);
    parent.seek('scene');
    expect(target.x).toBeCloseTo(0);

    const lateTarget = { x: 0 };
    const late = timeline({ engine, autoplay: false })
      .add(lateTarget as any, { x: 100, duration: 1, ease: 'linear' });
    parent.add(late, 'end').label('tail', '-=0.5');
    parent.seek('tail');
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(3));
    expect(lateTarget.x).toBeCloseTo(50);
    expect(parent.duration).toBeCloseTo(3.5);
  } finally {
    parent.cancel();
  }
});

it('does not let a nested timeline autoplay independently of its paused parent', async () => {
  const target = { x: 0 };
  const child = timeline().add(target as any, { x: 100, duration: 1, ease: 'linear' });
  const parent = timeline({ autoplay: false }).add(child, 1);

  try {
    await vi.waitFor(() => expect(parent.duration).toBeCloseTo(2));
    expect(child.playState).toBe('paused');
    expect(target.x).toBe(0);
    parent.seek(1.5);
    expect(target.x).toBeCloseTo(50);
  } finally {
    parent.cancel();
  }
});

it.each([['anime', 'gsap'], ['gsap', 'anime']] as const)('can nest a %s timeline in a %s parent', async (childEngine, engine) => {
  const target = { x: 0 };
  const child = timeline({ engine: childEngine, autoplay: false })
    .add(target as any, { x: 100, duration: 1, ease: 'linear' });
  const parent = timeline({ engine, autoplay: false }).add(child, 0.5);

  try {
    parent.seek(1);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(1));
    expect(target.x).toBeCloseTo(50);
    expect(parent.duration).toBeCloseTo(1.5);
    parent.seek(0.5);
    expect(target.x).toBeCloseTo(0);
  } finally {
    parent.cancel();
  }
});

it('includes pending additions when nesting a previously initialized timeline', async () => {
  const target = { x: 0 };
  const scene = timeline({ autoplay: false }).add({ x: 0 } as any, { x: 1, duration: 1 });
  await vi.waitFor(() => expect(scene.duration).toBeCloseTo(1));

  const child = timeline({ autoplay: false }).add(target as any, { x: 100, duration: 1, ease: 'linear' });
  scene.add(child);
  const parent = timeline({ autoplay: false }).add(scene, 0.5);

  try {
    parent.seek(2);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(2));
    expect(parent.duration).toBeCloseTo(2.5);
    expect(target.x).toBeCloseTo(50);
  } finally {
    parent.cancel();
  }
});

it.each([['anime', false], ['anime', true], ['gsap', false], ['gsap', true]] as const)('does not resume a %s parent cancelled while adding a child (autoplay: %s)', async (engine, autoplay) => {
  const target = { x: 0 };
  const parent = timeline({ engine, autoplay })
    .label('intro', 0.5)
    .add(target as any, { x: 100, duration: 2, ease: 'linear' });
  if (!autoplay) await vi.waitFor(() => expect(parent.duration).toBeCloseTo(2));

  const child = timeline({ engine, autoplay: false }).add({ y: 0 } as any, { y: 1, duration: 1 });
  try {
    parent.add(child);
    parent.play('intro');
    parent.cancel();
    await vi.waitFor(() => expect(parent.duration).toBeCloseTo(3));
    expect(parent.playState).not.toBe('running');
    const stoppedAt = parent.currentTime;
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(parent.currentTime).toBe(stoppedAt);
  } finally {
    parent.cancel();
  }
});

it.each(['anime', 'gsap'] as const)('restarts a %s timeline cancelled before initialization', async (engine) => {
  const child = timeline({ engine, autoplay: false }).add({ x: 0 }, { x: 100, duration: 2 });
  const parent = timeline({ engine }).add(child);

  try {
    parent.cancel();
    parent.restart();
    await vi.waitFor(() => expect(parent.currentTime).toBeGreaterThan(0.05));
    expect(parent.playState).toBe('running');
  } finally {
    parent.cancel();
  }
});

it.each([['anime', false], ['anime', true], ['gsap', false], ['gsap', true]] as const)('seeks both Anime children sharing a target in a %s parent (prebuilt: %s)', async (engine, prebuilt) => {
  const target = { x: 0 };
  const first = timeline({ autoplay: false })
    .add(target as any, { x: [0, 100], duration: 1, ease: 'linear' });
  const second = timeline({ autoplay: false })
    .add(target as any, { x: [100, 0], duration: 1, ease: 'linear' });
  if (prebuilt) await vi.waitFor(() => expect(first.duration + second.duration).toBeCloseTo(2));
  const parent = timeline({ engine, autoplay: false }).add(first).add(second);

  try {
    parent.seek(0.5);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(0.5));
    expect(target.x).toBeCloseTo(50);
    parent.seek(1.25);
    expect(target.x).toBeCloseTo(75);
    parent.seek(0.25);
    expect(target.x).toBeCloseTo(25);
  } finally {
    parent.cancel();
  }
});

it.each(['child first', 'same turn', 'parent first'])('hands off a shared property from an Anime parent tween to its child (%s)', async (order) => {
  const target = { x: 10 };
  const prebuiltParent = order === 'parent first' ? timeline({ autoplay: false })
    .add(target, { x: [0, 100], duration: 1, ease: 'linear' }) : undefined;
  if (prebuiltParent) await vi.waitFor(() => expect(prebuiltParent.duration).toBeCloseTo(1));
  const child = timeline({ autoplay: false })
    .add(target, { x: [100, 200], duration: 1, ease: 'linear' })
    .add(target, { x: 300, duration: 1, ease: 'linear' });
  if (order === 'child first') await vi.waitFor(() => expect(child.duration).toBeCloseTo(2));
  const parent = prebuiltParent ?? timeline({ autoplay: false })
    .add(target, { x: [0, 100], duration: 1, ease: 'linear' });
  parent.add(child);

  try {
    parent.seek(0.5);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(0.5));
    expect(target.x).toBeCloseTo(50);
    parent.seek(1.5);
    expect(target.x).toBeCloseTo(150);
    parent.seek(2.5);
    expect(target.x).toBeCloseTo(250);
    parent.seek(0.25);
    expect(target.x).toBeCloseTo(25);
  } finally {
    parent.cancel();
  }
});

it('keeps Anime keyframe order when seeking an attached child', async () => {
  const target = { x: 0 };
  const child = timeline({ autoplay: false })
    .add(target, { x: [0, 100, 200], duration: 2, ease: 'linear' });
  const parent = timeline({ autoplay: false }).add(child);

  try {
    parent.seek(0.5);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(0.5));
    expect(target.x).toBeCloseTo(50);
    parent.seek(1.5);
    expect(target.x).toBeCloseTo(150);
    parent.seek(0.25);
    expect(target.x).toBeCloseTo(25);
  } finally {
    parent.cancel();
  }
});

it('keeps the later Anime segment in control when seeking backward through overlap', async () => {
  const target = { x: 0 };
  const child = timeline({ autoplay: false })
    .add(target, { x: [0, 100], duration: 2, ease: 'linear' })
    .add(target, { x: [50, 150], duration: 1, ease: 'linear' }, 0.5);
  const parent = timeline({ autoplay: false }).add(child);

  try {
    parent.seek(1.2);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(1.2));
    expect(target.x).toBeCloseTo(120);
    parent.seek(0.8);
    expect(target.x).toBeCloseTo(80);
  } finally {
    parent.cancel();
  }
});

it('chains a destination-only tween added after seeking, before attaching its Anime timeline', async () => {
  const target = { x: 0 };
  const child = timeline({ autoplay: false })
    .add(target, { x: [0, 100], duration: 1, ease: 'linear' });
  await vi.waitFor(() => expect(child.duration).toBeCloseTo(1));
  child.seek(0.5);
  expect(target.x).toBeCloseTo(50);
  child.add(target, { x: 200, duration: 1, ease: 'linear' });
  const parent = timeline({ autoplay: false }).add(child);

  try {
    parent.seek(1.5);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(1.5));
    expect(target.x).toBeCloseTo(150);
  } finally {
    parent.cancel();
  }
});

it('renders an attached Anime blend tween as an absolute value', async () => {
  const target = { x: 0 };
  const child = timeline({ autoplay: false })
    .add(target, { x: [0, 100], duration: 1, ease: 'linear', composition: 'blend' });
  const parent = timeline({ autoplay: false }).add(child);

  try {
    parent.seek(0.5);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(0.5));
    await vi.waitFor(() => {
      animeEngine.update();
      expect(target.x).toBeCloseTo(50);
    }, { timeout: 250 });
  } finally {
    parent.cancel();
  }
});

it.each([{ x: 110 }, { x: [{ to: 110 }] }])('preserves a prebuilt Anime child’s destination-only start (%j)', async (props) => {
  const target = { x: 10 };
  const child = timeline({ autoplay: false })
    .add(target, { ...props, duration: 1, ease: 'linear' });
  await vi.waitFor(() => expect(child.duration).toBeCloseTo(1));
  child.seek(0.75);
  expect(target.x).toBeCloseTo(85);

  const parent = timeline({ autoplay: false }).add(child, 0.5);
  try {
    parent.seek(1);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(1));
    expect(target.x).toBeCloseTo(60);
  } finally {
    parent.cancel();
  }
});

it('resolves an initialized Anime child’s finished promise when its parent reaches the end', async () => {
  const child = timeline({ autoplay: false }).add({ x: 0 } as any, { x: 100, duration: 1 });
  await vi.waitFor(() => expect(child.duration).toBeCloseTo(1));
  const finished = vi.fn();
  void child.finished.then(finished);
  const parent = timeline({ autoplay: false }).add(child).label('end');

  try {
    parent.seek('end');
    await vi.waitFor(() => expect(finished).toHaveBeenCalledTimes(1));
  } finally {
    parent.cancel();
  }
});

it('samples overlapping Anime children at the GSAP parent time in both directions', async () => {
  const long = { x: 0 };
  const short = { x: 0 };
  const child = timeline({ autoplay: false }).add(long as any, { x: [0, 100], duration: 2, ease: 'linear' });
  const overlap = timeline({ autoplay: false }).add(short as any, { x: [0, 100], duration: 0.5, ease: 'linear' });
  const parent = timeline({ engine: 'gsap', autoplay: false }).add(child, 0).add(overlap, 0.5);

  try {
    parent.seek(1.5);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(1.5));
    expect(long.x).toBeCloseTo(75);
    expect(short.x).toBeCloseTo(100);
    parent.seek(0.75);
    expect(long.x).toBeCloseTo(37.5);
    expect(short.x).toBeCloseTo(50);
    parent.seek(0.25);
    expect(long.x).toBeCloseTo(12.5);
    expect(short.x).toBeCloseTo(0);
  } finally {
    parent.cancel();
  }
});

it('does not inherit the Anime parent delay on the child completion timer', async () => {
  const target = { x: 0 };
  const child = timeline({ autoplay: false }).add({ x: 0 } as any, { x: 100, duration: 1 });
  const finished = vi.fn();
  void child.finished.then(finished);
  const parent = timeline({ autoplay: false, defaults: { delay: 0.25 } })
    .add(child)
    .label('handoff')
    .add(target as any, { x: [0, 100], duration: 1, ease: 'linear' });

  try {
    parent.seek('handoff');
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(1));
    await vi.waitFor(() => expect(finished).toHaveBeenCalledTimes(1));
    parent.seek(1.75);
    expect(target.x).toBeCloseTo(50);
  } finally {
    parent.cancel();
  }
});

it('measures nested Anime segments and labels independently of longer host tracks', async () => {
  const target = { x: 0 };
  const leaf = timeline({ autoplay: false })
    .add(target, { x: [0, 100], duration: 1, ease: 'linear' });
  const child = timeline({ autoplay: false })
    .add({ x: 0 }, { x: 100, duration: 0.5 })
    .label('start')
    .add(leaf, 'start+=0.25')
    .label('end');
  const parent = timeline({ autoplay: false })
    .add({ x: 0 }, { x: 100, duration: 4 })
    .label('end')
    .add(child, 0.5);

  try {
    parent.seek(1.75);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(1.75));
    expect(target.x).toBeCloseTo(50);
    expect(child.duration).toBeCloseTo(1.75);
    expect(parent.duration).toBeCloseTo(4);
    child.seek('end');
    expect(parent.currentTime).toBeCloseTo(2.25);
    expect(target.x).toBeCloseTo(100);
    parent.seek('end');
    expect(parent.currentTime).toBeCloseTo(4);
  } finally {
    parent.cancel();
  }
});

it.each([['<<', 0], ['<<+=0.25', 0.25]] as const)('starts a nested Anime segment at %s without a previous track', async (position, gap) => {
  const target = { x: 0 };
  const child = timeline({ autoplay: false })
    .add(target, { x: [0, 100], duration: 1, ease: 'linear' }, position);
  const parent = timeline({ autoplay: false }).add(child, 0.5);

  try {
    parent.seek(1 + gap);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(1 + gap));
    expect(child.duration).toBeCloseTo(1 + gap);
    expect(target.x).toBeCloseTo(50);
  } finally {
    parent.cancel();
  }
});

it('does not count the Anime host loop default on nested completion timers', async () => {
  const target = { x: 0 };
  const leaf = timeline({ autoplay: false })
    .add({ x: 0 }, { x: 100, duration: 1 });
  const child = timeline({ autoplay: false })
    .add(leaf)
    .add(target, { x: [0, 100], duration: 1, ease: 'linear' });
  const parent = timeline({ autoplay: false, defaults: { loop: 2 } }).add(child);

  try {
    parent.seek(1.5);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(1.5));
    expect(child.duration).toBeCloseTo(2);
    expect(target.x).toBeCloseTo(50);
  } finally {
    parent.cancel();
  }
});
