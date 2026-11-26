import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gesture } from '../src/index';
import { ensureMotion } from '../src/adapters/motion-adapter';

const { hover, press } = vi.hoisted(() => ({ hover: vi.fn(), press: vi.fn() }));
vi.mock('motion', () => ({ hover, press }));

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
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe('core gestures', () => {
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
