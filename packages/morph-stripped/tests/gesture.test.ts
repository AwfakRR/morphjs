import { afterEach, describe, expect, it, vi } from 'vitest';
import { gesture } from '../src/index';

const { hover, press } = vi.hoisted(() => ({ hover: vi.fn(), press: vi.fn() }));
vi.mock('../src/engine', () => ({ loadMotion: async () => ({ hover, press }) }));

afterEach(() => vi.unstubAllGlobals());

function setupCard() {
  const card = Object.assign(new EventTarget(), { style: { transform: 'scale(0.94)', translate: '' } });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { querySelectorAll: () => [card] });
  return card;
}

describe('stripped gestures', () => {
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
