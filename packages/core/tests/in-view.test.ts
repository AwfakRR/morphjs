import { afterEach, describe, expect, it, vi } from 'vitest';
import core, { scroll as coreScroll, type MorphInViewOptions } from '../src/index';
import stripped, { scroll as strippedScroll } from '../../morph-stripped/src/index';

function setup() {
  const first = { nodeType: 1 } as Element;
  const second = { nodeType: 1 } as Element;
  const querySelectorAll = vi.fn(() => [first, second]);
  const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  let notify: IntersectionObserverCallback;
  const Observer = vi.fn(function (callback: IntersectionObserverCallback) {
    notify = callback;
    return observer;
  });
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { querySelectorAll });
  vi.stubGlobal('IntersectionObserver', Observer);

  const entry = (target: Element, ratio: number, isIntersecting = ratio > 0) =>
    ({ target, intersectionRatio: ratio, isIntersecting }) as IntersectionObserverEntry;
  const emit = (...entries: IntersectionObserverEntry[]) =>
    notify(entries, observer as unknown as IntersectionObserver);
  return { first, second, Observer, observer, querySelectorAll, entry, emit };
}

afterEach(() => vi.unstubAllGlobals());

describe.each([
  { edition: 'core', morph: core, scroll: coreScroll },
  { edition: 'stripped', morph: stripped, scroll: strippedScroll },
])('$edition scroll.inView', ({ morph, scroll }) => {
  it('is available on both the default morph export and the named scroll export', () => {
    expect(morph.scroll).toBe(scroll);
    expect(typeof scroll).toBe('function');
    expect(typeof scroll.inView).toBe('function');
  });

  it('does not touch the DOM during SSR or without IntersectionObserver', () => {
    const enter = vi.fn();
    scroll.inView('.card', enter)();
    const { querySelectorAll } = setup();
    vi.stubGlobal('IntersectionObserver', undefined);
    scroll.inView('.card', enter)();
    expect(enter).not.toHaveBeenCalled();
    expect(querySelectorAll).not.toHaveBeenCalled();
  });

  it('observes selector matches and fires once per element at the configured threshold', () => {
    const { first, second, Observer, observer, querySelectorAll, entry, emit } = setup();
    const enter = vi.fn();
    const container = { nodeType: 1 } as Element;
    const options: MorphInViewOptions = { container, margin: '10px', threshold: 0.25 };
    scroll.inView('.card', enter, options);
    expect(querySelectorAll).toHaveBeenCalledWith('.card');
    expect(Observer).toHaveBeenCalledWith(expect.any(Function), { root: container, rootMargin: '10px', threshold: 0.25 });
    expect(observer.observe.mock.calls).toEqual([[first], [second]]);

    emit(entry(first, 0.1), entry(second, 0));
    expect(enter).not.toHaveBeenCalled();
    const reveal = entry(first, 0.25);
    emit(reveal, entry(first, 0), entry(first, 1), entry(second, 0.5));
    expect(enter.mock.calls).toEqual([[first, reveal], [second, expect.any(Object)]]);
    expect(observer.unobserve.mock.calls).toEqual([[first], [second]]);
  });

  it('re-arms below the threshold and stops queued entries after cleanup', () => {
    const { first, second, observer, entry, emit } = setup();
    const enter = vi.fn();
    const stop = morph.scroll.inView({ 0: first, 1: second, length: 2 }, enter, { once: false, threshold: 0.5 });
    emit(entry(first, 1), entry(first, 0.6), entry(first, 0.4), entry(first, 0.7));
    expect(enter.mock.calls.map(([element]) => element)).toEqual([first, first]);
    expect(observer.unobserve).not.toHaveBeenCalled();

    stop();
    emit(entry(second, 1));
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(enter).toHaveBeenCalledTimes(2);
  });

  it('handles a single DOM element with a length property as a target', () => {
    const { first, observer, entry, emit } = setup();
    Object.assign(first, { length: 0 });
    const enter = vi.fn();
    scroll.inView(first, enter);
    expect(observer.observe).toHaveBeenCalledWith(first);
    emit(entry(first, 0), entry(first, 0, true));
    expect(enter).toHaveBeenCalledOnce();
  });
});
