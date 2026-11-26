import { SvelteComponent, init, safe_not_equal } from 'svelte/internal';
import { expect, it, vi } from 'vitest';
import { morphScope } from '../src';

it('reverts the scope when a Svelte component is destroyed', () => {
  const cleanup = vi.fn();
  const component = new SvelteComponent();
  init(component, { target: {} as Element }, () => {
    morphScope().add(cleanup);
    return [];
  }, null, safe_not_equal, {});

  expect(cleanup).not.toHaveBeenCalled();
  component.$destroy();
  expect(cleanup).toHaveBeenCalledOnce();
});
