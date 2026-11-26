// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { timeline } from '../src/index';

it('seeks an Anime child from a stylesheet value when attached before initialization', async () => {
  const element = document.createElement('div');
  const style = document.createElement('style');
  element.className = 'nested-timeline-target';
  style.textContent = '.nested-timeline-target { opacity: 0.2; }';
  document.head.append(style);
  document.body.append(element);
  const child = timeline({ autoplay: false })
    .add(element, { opacity: 0.8, duration: 1, ease: 'linear' });
  const parent = timeline({ autoplay: false }).add(child, 0.25);

  try {
    parent.seek(0.75);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(0.75));
    expect(Number(getComputedStyle(element).opacity)).toBeCloseTo(0.5);
  } finally {
    parent.cancel();
    element.remove();
    style.remove();
  }
});
