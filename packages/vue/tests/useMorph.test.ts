import { createRenderer, type RendererOptions } from 'vue';
import { expect, it, vi } from 'vitest';
import { motionAdapter, type MorphControls, type MorphTargets } from 'morphjs';
import { useMorph } from '../src';
import { ensureMotion } from '../../core/src/adapters/motion-adapter';

it('cancels animations and gesture subscriptions when the component unmounts', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('Element', class {});
  vi.stubGlobal('NodeList', class {});
  const cleanup = vi.fn();
  const gesture = vi.spyOn(motionAdapter, 'gesture').mockReturnValue({ cleanup });
  try {
    await ensureMotion();
    const { createApp } = createRenderer({
      insert() {},
      remove() {},
      createComment: () => ({}),
    } as RendererOptions);
    let controls!: MorphControls;
    const app = createApp({
      setup() {
        const { animate, gesture } = useMorph();
        controls = animate({ value: 0 } as unknown as MorphTargets, { value: 100 }, { duration: 10 });
        gesture([], { hover: true });
        return () => null;
      },
    });
    app.mount({});
    const cancel = vi.spyOn(controls, 'cancel');
    expect(cleanup).not.toHaveBeenCalled();
    app.unmount();
    expect(cancel).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  } finally {
    gesture.mockRestore();
    vi.unstubAllGlobals();
  }
});
