import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, gesture } from '../src/index';
import { ensureMotion } from '../src/adapters/motion-adapter';

const { hover, press, animate } = vi.hoisted(() => ({ hover: vi.fn(), press: vi.fn(), animate: vi.fn() }));
vi.mock('motion', () => ({ hover, press, animate }));

class TestElement extends EventTarget {
  style = { transform: '' };
}

function pointer(type: string, clientX = 0, clientY = 0) {
  return Object.assign(new Event(type), { clientX, clientY, pointerId: 1 });
}

beforeEach(async () => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', {});
  vi.stubGlobal('Element', TestElement);
  vi.stubGlobal('HTMLElement', TestElement);
  vi.stubGlobal('NodeList', class {});
  await ensureMotion();
});

afterEach(() => {
  configure({ reducedMotion: 'user' });
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

function send(target: EventTarget, type: string, clientX: number, clientY: number, timeStamp: number) {
  const event = Object.assign(new Event(type), { clientX, clientY, pointerId: 1 });
  target.dispatchEvent(Object.defineProperty(event, 'timeStamp', { value: timeStamp }));
}

describe('core gestures', () => {
  it('keeps the original bounds and snap destination when a dragged element is rebound', async () => {
    const target = new TestElement();
    const computedStyle = vi.fn()
      .mockReturnValueOnce({ transform: 'matrix(1, 0, 0, 1, 30, -12)' })
      .mockReturnValue({ transform: 'matrix(1, 0, 0, 1, 90, -12)' });
    vi.stubGlobal('getComputedStyle', computedStyle);
    animate.mockReturnValue({ stop: vi.fn() });
    const options = { drag: { constraints: { left: -60, right: 60 }, snapToOrigin: true }, onDragStart: vi.fn() };
    const firstCleanup = gesture(target as unknown as Element, options);
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 100, 0, 20);
    expect(target.style.transform).toBe('translate(90px, -12px)');
    send(target, 'pointerup', 100, 0, 25);
    firstCleanup();

    const secondCleanup = gesture(target as unknown as Element, options);
    send(target, 'pointerdown', 100, 0, 30);
    send(target, 'pointermove', 130, 0, 50);
    expect(target.style.transform).toBe('translate(90px, -12px)');
    expect(options.onDragStart).toHaveBeenLastCalledWith(expect.any(Event), expect.objectContaining({
      offset: { x: 60, y: 0 },
    }));
    send(target, 'pointerup', 130, 0, 55);
    await Promise.resolve();

    expect(animate).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith(60, 0, expect.objectContaining({ type: 'spring' }));
    animate.mock.lastCall![2].onUpdate(0);
    expect(target.style.transform).toBe('translate(30px, -12px)');
    secondCleanup();
  });

  it.each(['never', 'always'] as const)('snaps back to the existing translation with reducedMotion: %s', async (reducedMotion) => {
    configure({ reducedMotion });
    const target = new TestElement();
    const onDragEnd = vi.fn();
    vi.stubGlobal('getComputedStyle', () => ({ transform: 'matrix(1, 0, 0, 1, 30, -12)' }));
    animate.mockReturnValue({ stop: vi.fn() });
    const cleanup = gesture(target as unknown as Element, { drag: { snapToOrigin: true }, onDragEnd });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 20, 0, 20);
    expect(target.style.transform).toBe('translate(50px, -12px)');
    send(target, 'pointerup', 20, 0, 25);
    await Promise.resolve();

    expect(onDragEnd).toHaveBeenCalledWith(expect.any(Event), expect.objectContaining({ offset: { x: 20, y: 0 } }));
    if (reducedMotion === 'always') {
      expect(animate).not.toHaveBeenCalled();
    } else {
      expect(animate).toHaveBeenCalledWith(20, 0, expect.objectContaining({ type: 'spring' }));
      animate.mock.lastCall![2].onUpdate(0);
    }
    expect(target.style.transform).toBe('translate(30px, -12px)');
    cleanup();
  });

  it('clamps momentum relative to the existing translation', async () => {
    const target = new TestElement();
    vi.stubGlobal('getComputedStyle', () => ({
      transform: 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, -12, 0, 1)',
    }));
    animate.mockReturnValue({ stop: vi.fn() });
    const cleanup = gesture(target as unknown as Element, { drag: { constraints: { left: -15, right: 25 }, momentum: true } });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', -30, 0, 20);
    expect(target.style.transform).toBe('translate(15px, -12px)');
    send(target, 'pointermove', 10, 0, 40);
    send(target, 'pointerup', 10, 0, 45);
    await Promise.resolve();

    expect(animate).toHaveBeenCalledWith(10, 25, expect.objectContaining({ type: 'inertia', min: -15, max: 25 }));
    animate.mock.lastCall![2].onUpdate(50);
    expect(target.style.transform).toBe('translate(55px, -12px)');
    cleanup();
  });

  it('clamps signed bounds, reports velocity, and preserves position across drags', () => {
    const target = new TestElement();
    const onDrag = vi.fn(), onDragEnd = vi.fn();
    const cleanup = gesture(target as unknown as Element, {
      drag: { constraints: { left: -30, right: 40, bottom: 15 } }, onDrag, onDragEnd,
    });
    send(target, 'pointerdown', 10, 20, 0);
    send(target, 'pointermove', 110, -80, 20);
    expect(target.style.transform).toBe('translate(40px, -100px)');
    expect(onDrag).toHaveBeenLastCalledWith(expect.any(Event), expect.objectContaining({
      delta: { x: 100, y: -100 }, offset: { x: 40, y: -100 }, velocity: { x: 5000, y: -5000 },
    }));
    send(target, 'pointerup', 110, -80, 25);
    expect(onDragEnd).toHaveBeenLastCalledWith(expect.any(Event), expect.objectContaining({
      offset: { x: 40, y: -100 }, velocity: { x: 5000, y: -5000 },
    }));
    send(target, 'pointerdown', 200, 200, 30);
    send(target, 'pointermove', 190, 205, 50);
    expect(target.style.transform).toBe('translate(30px, -95px)');
    send(target, 'pointermove', 10, 400, 70);
    expect(target.style.transform).toBe('translate(-30px, 15px)');
    expect(animate).not.toHaveBeenCalled();
    cleanup();
  });

  it('limits momentum to the bounds and interrupts it on pointerdown and cleanup', async () => {
    const target = new TestElement();
    const stop = vi.fn();
    animate.mockReturnValue({ stop });
    const cleanup = gesture(target as unknown as Element, { drag: { constraints: { right: 50 }, momentum: true } });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 20, 0, 20);
    send(target, 'pointerup', 20, 0, 25);
    await Promise.resolve();

    expect(animate).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith(20, 50, expect.objectContaining({
      type: 'inertia', velocity: 1000, max: 50,
    }));
    const glide = animate.mock.lastCall![2];
    expect(glide.modifyTarget(800)).toBe(50);
    glide.onUpdate(90);
    expect(target.style.transform).toBe('translate(50px, 0px)');
    send(target, 'pointerdown', 30, 0, 30);
    expect(stop).toHaveBeenCalledOnce();
    glide.onUpdate(45);
    send(target, 'pointermove', 20, 0, 50);
    expect(target.style.transform).toBe('translate(40px, 0px)');
    send(target, 'pointerup', 20, 0, 55);
    await Promise.resolve();
    expect(animate).toHaveBeenCalledTimes(2);
    cleanup();
    animate.mock.lastCall![2].onUpdate(0);
    expect(target.style.transform).toBe('translate(40px, 0px)');
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('springs to origin instead of gliding when both options are set', async () => {
    const target = new TestElement();
    animate.mockReturnValue({ stop: vi.fn() });
    const cleanup = gesture(target as unknown as Element, { drag: { momentum: true, snapToOrigin: true } });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 40, 0, 20);
    send(target, 'pointerup', 40, 0, 25);
    await Promise.resolve();

    expect(animate).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith(40, 0, expect.objectContaining({ type: 'spring' }));
    animate.mock.lastCall![2].onUpdate(0);
    expect(target.style.transform).toBe('translate(0px, 0px)');
    cleanup();
  });

  it.each([
    ['snaps immediately', { momentum: true, snapToOrigin: true }, 'translate(0px, 0px)'],
    ['stays at the release position', { momentum: true }, 'translate(40px, 20px)'],
  ] as const)('%s when reduced motion is enabled', async (_, drag, expected) => {
    configure({ reducedMotion: 'always' });
    const target = new TestElement();
    const onDragEnd = vi.fn();
    const cleanup = gesture(target as unknown as Element, { drag, onDragEnd });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 40, 20, 20);
    expect(target.style.transform).toBe('translate(40px, 20px)');
    send(target, 'pointerup', 40, 20, 25);

    expect(target.style.transform).toBe(expected);
    expect(onDragEnd).toHaveBeenCalledWith(expect.any(Event), expect.objectContaining({
      offset: { x: 40, y: 20 },
    }));
    await Promise.resolve();
    expect(animate).not.toHaveBeenCalled();
    cleanup();
  });

  it('does not fling a stationary or cancelled pointer', async () => {
    const target = new TestElement();
    const cleanup = gesture(target as unknown as Element, { drag: { momentum: true } });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 20, 0, 20);
    send(target, 'pointerup', 20, 0, 130);
    send(target, 'pointerdown', 20, 0, 140);
    send(target, 'pointermove', 30, 0, 150);
    send(target, 'pointercancel', 30, 0, 160);
    send(target, 'pointerdown', 30, 0, 170);
    send(target, 'pointermove', 40, 0, 180);
    send(target, 'lostpointercapture', 40, 0, 190);
    send(target, 'pointerdown', 40, 0, 200);
    send(target, 'pointermove', 50, 0, 220);
    await Promise.resolve();

    expect(animate).not.toHaveBeenCalled();
    expect(target.style.transform).toBe('translate(50px, 0px)');
    cleanup();
  });

  it('still snaps to origin if the optional Motion animation cannot start', async () => {
    const target = new TestElement();
    animate.mockImplementation(() => { throw new Error('Motion unavailable'); });
    const cleanup = gesture(target as unknown as Element, { drag: { snapToOrigin: true } });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 20, 0, 20);
    send(target, 'pointerup', 20, 0, 25);

    await vi.waitFor(() => expect(target.style.transform).toBe('translate(0px, 0px)'));
    cleanup();
  });

  it.each([
    ['hover', hover, 'onHoverStart', 'onHoverEnd', 'pointerenter', 'pointerleave'],
    ['press', press, 'onPressStart', 'onPressEnd', 'pointerdown', 'pointerup'],
  ] as const)('routes Motion %s start and end events', (kind, register, startKey, endKey, startType, endType) => {
    const target = new TestElement();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const cancel = vi.fn();
    register.mockReturnValueOnce(cancel);
    const cleanup = gesture(target as unknown as Element, { [kind]: true, [startKey]: onStart, [endKey]: onEnd });

    const start = pointer(startType);
    const end = pointer(endType);
    expect(register).toHaveBeenCalledWith([target], expect.any(Function));
    const [, handleStart] = register.mock.lastCall!;
    handleStart(target, start)(end);
    expect(onStart.mock.calls).toEqual([[start]]);
    expect(onEnd.mock.calls).toEqual([[end]]);

    cleanup();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('wires and cleans up native drag alongside Motion hover and press', () => {
    const target = new TestElement();
    const onDragStart = vi.fn();
    const onDrag = vi.fn();
    const onDragEnd = vi.fn();
    const onHoverStart = vi.fn();
    const onPressStart = vi.fn();
    const cancelHover = vi.fn();
    const cancelPress = vi.fn();
    hover.mockReturnValueOnce(cancelHover);
    press.mockReturnValueOnce(cancelPress);
    const cleanup = gesture(target as unknown as Element, {
      hover: true, press: true, drag: true, onHoverStart, onPressStart, onDragStart, onDrag, onDragEnd,
    });

    const start = pointer('pointerdown', 10, 20);
    const move = pointer('pointermove', 70, 45);
    const end = pointer('pointerup', 70, 45);
    target.dispatchEvent(pointer('pointerenter'));
    target.dispatchEvent(start);
    target.dispatchEvent(move);
    target.dispatchEvent(end);

    expect(onDragStart.mock.calls).toEqual([[start, expect.objectContaining({ offset: { x: 0, y: 0 } })]]);
    expect(onDrag.mock.calls).toEqual([[move, expect.objectContaining({ delta: { x: 60, y: 25 } })]]);
    expect(onDragEnd.mock.calls).toEqual([[end, expect.objectContaining({ offset: { x: 60, y: 25 } })]]);
    expect(target.style.transform).toBe('translate(60px, 25px)');
    expect(onHoverStart).not.toHaveBeenCalled();
    expect(onPressStart).not.toHaveBeenCalled();

    cleanup();
    expect(cancelHover).toHaveBeenCalledOnce();
    expect(cancelPress).toHaveBeenCalledOnce();
    target.dispatchEvent(start);
    target.dispatchEvent(move);
    target.dispatchEvent(end);
    expect(onDragStart).toHaveBeenCalledOnce();
    expect(onDrag).toHaveBeenCalledOnce();
    expect(onDragEnd).toHaveBeenCalledOnce();
  });
});
