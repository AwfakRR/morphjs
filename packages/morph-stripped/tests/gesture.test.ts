import { afterEach, describe, expect, it, vi } from 'vitest';
import { gesture } from '../src/index';

const { hover, press, animate } = vi.hoisted(() => ({ hover: vi.fn(), press: vi.fn(), animate: vi.fn() }));
vi.mock('../src/engine', () => ({ loadMotion: async () => ({ hover, press, animate }) }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

function setupCard() {
  const card = Object.assign(new EventTarget(), { style: { transform: 'scale(0.94)', translate: '' } });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { querySelectorAll: () => [card] });
  return card;
}

function send(target: EventTarget, type: string, clientX: number, clientY: number, timeStamp: number) {
  const event = Object.assign(new Event(type), { clientX, clientY, pointerId: 1 });
  target.dispatchEvent(Object.defineProperty(event, 'timeStamp', { value: timeStamp }));
}

describe('stripped gestures', () => {
  it('adopts an externally changed translation on rebind', async () => {
    const target = setupCard();
    let computedTranslation = '30px';
    vi.stubGlobal('getComputedStyle', () => ({ translate: computedTranslation }));
    animate.mockReturnValue({ stop: vi.fn() });
    const drag = { constraints: { left: -60, right: 60 } };
    const firstCleanup = gesture('#card', { drag });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 60, 0, 20);
    send(target, 'pointerup', 60, 0, 25);
    expect(target.style.translate).toBe('90px 0px');
    firstCleanup();

    target.style.translate = '150px';
    computedTranslation = '150px';
    const onDragStart = vi.fn();
    const cleanup = gesture('#card', { drag: { ...drag, snapToOrigin: true }, onDragStart });
    send(target, 'pointerdown', 60, 0, 30);
    send(target, 'pointermove', 55, 0, 50);
    expect(target.style.translate).toBe('145px 0px');
    expect(onDragStart).toHaveBeenCalledWith(expect.any(Event), expect.objectContaining({ offset: { x: 0, y: 0 } }));
    send(target, 'pointerup', 55, 0, 55);
    await Promise.resolve();

    expect(animate).toHaveBeenCalledWith(-5, 0, expect.objectContaining({ type: 'spring' }));
    animate.mock.lastCall![2].onUpdate(0);
    expect(target.style.translate).toBe('150px 0px');
    cleanup();
  });

  it('keeps the original bounds and snap destination when a dragged element is rebound', async () => {
    const target = setupCard();
    const computedStyle = vi.fn()
      .mockReturnValueOnce({ translate: '30px -12px' })
      .mockReturnValue({ translate: '90px -12px' });
    vi.stubGlobal('getComputedStyle', computedStyle);
    animate.mockReturnValue({ stop: vi.fn() });
    const options = { drag: { constraints: { left: -60, right: 60 }, snapToOrigin: true }, onDragStart: vi.fn() };
    const firstCleanup = gesture('#card', options);
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 100, 0, 20);
    expect(target.style.translate).toBe('90px -12px');
    send(target, 'pointerup', 100, 0, 25);
    firstCleanup();

    const secondCleanup = gesture('#card', options);
    send(target, 'pointerdown', 100, 0, 30);
    send(target, 'pointermove', 130, 0, 50);
    expect(target.style.translate).toBe('90px -12px');
    expect(options.onDragStart).toHaveBeenLastCalledWith(expect.any(Event), expect.objectContaining({
      offset: { x: 60, y: 0 },
    }));
    send(target, 'pointerup', 130, 0, 55);
    await Promise.resolve();

    expect(animate).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith(60, 0, expect.objectContaining({ type: 'spring' }));
    animate.mock.lastCall![2].onUpdate(0);
    expect(target.style.translate).toBe('30px -12px');
    secondCleanup();
  });

  it('snaps back to the existing translation rather than to zero', async () => {
    const target = setupCard();
    const onDragEnd = vi.fn();
    vi.stubGlobal('getComputedStyle', () => ({ translate: '30px -12px' }));
    animate.mockReturnValue({ stop: vi.fn() });
    const cleanup = gesture('#card', { drag: { snapToOrigin: true }, onDragEnd });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 20, 0, 20);
    expect(target.style.translate).toBe('50px -12px');
    send(target, 'pointerup', 20, 0, 25);
    await Promise.resolve();

    expect(onDragEnd).toHaveBeenCalledWith(expect.any(Event), expect.objectContaining({ offset: { x: 20, y: 0 } }));
    expect(animate).toHaveBeenCalledWith(20, 0, expect.objectContaining({ type: 'spring' }));
    animate.mock.lastCall![2].onUpdate(0);
    expect(target.style.translate).toBe('30px -12px');
    cleanup();
  });

  it('clamps momentum relative to the existing translation', async () => {
    const target = setupCard();
    vi.stubGlobal('getComputedStyle', () => ({
      translate: 'calc(20% + 2px) -12px 3px',
    }));
    animate.mockReturnValue({ stop: vi.fn() });
    const cleanup = gesture('#card', { drag: { constraints: { left: -15, right: 25 }, momentum: true } });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', -30, 0, 20);
    expect(target.style.translate).toBe('calc(calc(20% + 2px) + -15px) -12px 3px');
    send(target, 'pointermove', 10, 0, 40);
    send(target, 'pointerup', 10, 0, 45);
    await Promise.resolve();

    expect(animate).toHaveBeenCalledWith(10, 25, expect.objectContaining({ type: 'inertia', min: -15, max: 25 }));
    animate.mock.lastCall![2].onUpdate(50);
    expect(target.style.translate).toBe('calc(calc(20% + 2px) + 25px) -12px 3px');
    cleanup();
  });

  it('clamps signed bounds, reports velocity, and preserves position across drags', () => {
    const target = setupCard();
    const onDrag = vi.fn(), onDragEnd = vi.fn();
    const cleanup = gesture('#card', {
      drag: { constraints: { left: -30, right: 40, bottom: 15 } }, onDrag, onDragEnd,
    });
    send(target, 'pointerdown', 10, 20, 0);
    send(target, 'pointermove', 110, -80, 20);
    expect(target.style.translate).toBe('40px -100px');
    expect(onDrag).toHaveBeenLastCalledWith(expect.any(Event), expect.objectContaining({
      delta: { x: 100, y: -100 }, offset: { x: 40, y: -100 }, velocity: { x: 5000, y: -5000 },
    }));
    send(target, 'pointerup', 110, -80, 25);
    expect(onDragEnd).toHaveBeenLastCalledWith(expect.any(Event), expect.objectContaining({
      offset: { x: 40, y: -100 }, velocity: { x: 5000, y: -5000 },
    }));
    send(target, 'pointerdown', 200, 200, 30);
    send(target, 'pointermove', 190, 205, 50);
    expect(target.style.translate).toBe('30px -95px');
    send(target, 'pointermove', 10, 400, 70);
    expect(target.style.translate).toBe('-30px 15px');
    expect(animate).not.toHaveBeenCalled();
    cleanup();
  });

  it('limits momentum to the bounds and interrupts it on pointerdown and cleanup', async () => {
    const target = setupCard();
    const stop = vi.fn();
    animate.mockReturnValue({ stop });
    const cleanup = gesture('#card', { drag: { constraints: { right: 50 }, momentum: true } });
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
    expect(target.style.translate).toBe('50px 0px');
    send(target, 'pointerdown', 30, 0, 30);
    expect(stop).toHaveBeenCalledOnce();
    glide.onUpdate(45);
    send(target, 'pointermove', 20, 0, 50);
    expect(target.style.translate).toBe('40px 0px');
    send(target, 'pointerup', 20, 0, 55);
    await Promise.resolve();
    expect(animate).toHaveBeenCalledTimes(2);
    cleanup();
    animate.mock.lastCall![2].onUpdate(0);
    expect(target.style.translate).toBe('40px 0px');
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('springs to origin instead of gliding when both options are set', async () => {
    const target = setupCard();
    animate.mockReturnValue({ stop: vi.fn() });
    const cleanup = gesture('#card', { drag: { momentum: true, snapToOrigin: true } });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 40, 0, 20);
    send(target, 'pointerup', 40, 0, 25);
    await Promise.resolve();

    expect(animate).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith(40, 0, expect.objectContaining({ type: 'spring' }));
    animate.mock.lastCall![2].onUpdate(0);
    expect(target.style.translate).toBe('0px 0px');
    cleanup();
  });

  it('does not fling a stationary or cancelled pointer', async () => {
    const target = setupCard();
    const cleanup = gesture('#card', { drag: { momentum: true } });
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
    expect(target.style.translate).toBe('50px 0px');
    cleanup();
  });

  it('still snaps to origin if the optional Motion animation cannot start', async () => {
    const target = setupCard();
    animate.mockImplementation(() => { throw new Error('Motion unavailable'); });
    const cleanup = gesture('#card', { drag: { snapToOrigin: true } });
    send(target, 'pointerdown', 0, 0, 0);
    send(target, 'pointermove', 20, 0, 20);
    send(target, 'pointerup', 20, 0, 25);

    await vi.waitFor(() => expect(target.style.translate).toBe('0px 0px'));
    cleanup();
  });

  it.each(['hover', 'press'] as const)('routes Motion %s start and end events', async (kind) => {
    const card = setupCard();
    const register = { hover, press }[kind];
    const cancel = vi.fn();
    register.mockReturnValueOnce(cancel);
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const callbacks = kind === 'hover'
      ? { onHoverStart: onStart, onHoverEnd: onEnd }
      : { onPressStart: onStart, onPressEnd: onEnd };
    const cleanup = gesture('#card', { [kind]: true, ...callbacks });
    await Promise.resolve();

    const start = new Event(kind === 'hover' ? 'pointerenter' : 'pointerdown');
    const end = new Event(kind === 'hover' ? 'pointerleave' : 'pointerup');
    expect(register).toHaveBeenCalledWith('#card', expect.any(Function));
    const [, handleStart] = register.mock.lastCall!;
    handleStart(card, start)(end);
    expect(onStart).toHaveBeenCalledWith(start);
    expect(onEnd).toHaveBeenCalledWith(end);

    cleanup();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('translates the card without overwriting scale and reports the release offset', () => {
    const card = setupCard();
    const onDragEnd = vi.fn();
    const cleanup = gesture('#card', { drag: true, onDragEnd });
    const pointer = (type: string, clientX: number, clientY: number) =>
      Object.assign(new Event(type), { clientX, clientY, pointerId: 1 });
    card.dispatchEvent(pointer('pointerdown', 10, 20));
    card.dispatchEvent(pointer('pointermove', 70, 45));
    const release = pointer('pointerup', 70, 45);
    card.dispatchEvent(release);

    expect(card.style.transform).toBe('scale(0.94)');
    expect(card.style.translate).toBe('60px 25px');
    expect(onDragEnd).toHaveBeenCalledWith(release, expect.objectContaining({ offset: { x: 60, y: 25 } }));
    cleanup();
  });
});
