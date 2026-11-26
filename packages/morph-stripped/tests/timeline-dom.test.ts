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

it('resolves nested Anime values once with the actual targets and their parent', async () => {
  const container = document.createElement('div');
  const targets = [document.createElement('div'), document.createElement('div')];
  container.dataset.opacity = '0.8';
  container.append(...targets);
  document.body.append(container);
  const value = vi.fn((target: HTMLElement, index: number, _targets: HTMLElement[] | number) =>
    Number(target.parentElement?.dataset.opacity ?? 0) - index * 0.2);
  const child = timeline({ autoplay: false })
    .add(targets, { opacity: { from: 0, to: value }, duration: 1, ease: 'linear' });
  const parent = timeline({ autoplay: false }).add(child, 0.25);

  try {
    parent.seek(0.75);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(0.75));
    expect(value).toHaveBeenCalledTimes(2);
    for (const [index, [target, receivedIndex, list]] of value.mock.calls.entries()) {
      expect(target).toBe(targets[index]);
      expect(receivedIndex).toBe(index);
      expect(Array.isArray(list) ? list : targets.slice(0, list)).toEqual(targets);
      expect(Number(target.style.opacity)).toBeCloseTo(0.4 - index * 0.1);
    }
  } finally {
    parent.cancel();
    container.remove();
  }
});

it('uses the attached target’s measured duration for a nested Anime track', async () => {
  const target = document.createElement('div');
  document.body.append(target);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ width: 100 } as DOMRect);
  const duration = vi.fn((element: HTMLElement) => element.getBoundingClientRect().width * 10);
  const child = timeline({ autoplay: false })
    .add(target, { opacity: [0, 1], duration, ease: 'linear' });
  const parent = timeline({ autoplay: false }).add(child, 0.25).label('end');

  try {
    parent.seek(0.75);
    await vi.waitFor(() => expect(parent.currentTime).toBeCloseTo(0.75));
    expect(child.duration).toBeCloseTo(1);
    expect(parent.duration).toBeCloseTo(1.25);
    expect(Number(target.style.opacity)).toBeCloseTo(0.5);
    expect(duration).toHaveBeenCalledTimes(1);
    expect(duration.mock.calls[0][0]).toBe(target);
  } finally {
    parent.cancel();
    target.remove();
  }
});
