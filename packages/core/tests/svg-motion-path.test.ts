import 'animejs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configure, svg as core } from '../src/index';
import { svg as stripped } from '../../morph-stripped/src/index';

class Marker {
  nodeType = 1;
  style = { transform: '' };
}

function geometry() {
  return {
    getTotalLength: vi.fn(() => 100),
    getPointAtLength: vi.fn((distance: number) => distance <= 40
      ? { x: distance, y: 0 }
      : { x: 40, y: distance - 40 }),
  };
}

function browser(path?: ReturnType<typeof geometry>) {
  const marker = new Marker();
  const querySelector = vi.fn(() => path);
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { querySelector });
  vi.stubGlobal('Element', Marker);
  vi.stubGlobal('NodeList', class {});
  return { marker, target: marker as unknown as HTMLElement, querySelector };
}

afterEach(() => {
  configure({ reducedMotion: 'user' });
  vi.unstubAllGlobals();
});

describe.each([['core', core], ['stripped', stripped]] as const)('%s SVG motion path', (_, svg) => {
  it('seeks by seconds along the selected segment and rotates to the sampled tangent', async () => {
    const path = geometry();
    const { marker, target, querySelector } = browser(path);
    const onComplete = vi.fn();
    const controls = svg.motionPath(target, '#track', {
      start: 0.2, end: 0.8, duration: 2, autoplay: false, autoRotate: true, onComplete,
    });

    await vi.waitFor(() => expect(controls.playState).toBe('paused'));
    expect(querySelector).toHaveBeenCalledWith('#track');
    expect(path.getTotalLength).toHaveBeenCalledOnce();
    expect(marker.style.transform.trim()).toBe('translate(20px,0px) rotate(0deg)');

    controls.seek?.(1);
    expect(marker.style.transform.trim()).toBe('translate(40px,10px) rotate(90deg)');

    controls.finish();
    await controls.finished;
    expect(marker.style.transform.trim()).toBe('translate(40px,40px) rotate(90deg)');
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('applies easing and repeats the distance tween without writing rotation by default', async () => {
    const { marker, target } = browser();
    marker.style.transform = 'rotate(15deg)';
    const path = geometry();
    const controls = svg.motionPath(target, path as unknown as SVGPathElement, {
      start: 2, end: -1, duration: 1, delay: 0.2, repeat: 1, ease: t => t * t, autoplay: false,
    });

    controls.seek?.(0.5);
    await vi.waitFor(() => expect(controls.currentTime).toBe(0.5));
    expect(controls.duration).toBe(2);
    expect(marker.style.transform).toContain('translate(40px,35px)');
    expect(marker.style.transform).toContain('rotate(15deg)');
    controls.seek?.(1.5);
    expect(marker.style.transform).toContain('translate(40px,35px)');
    controls.cancel();
    expect(marker.style.transform).toContain('translate(40px,60px)');
  });

  it('returns noop controls on the server or when the path cannot be sampled', async () => {
    const path = geometry();
    const track = path as unknown as SVGPathElement;
    await svg.motionPath('#marker', track).finished;
    expect(path.getTotalLength).not.toHaveBeenCalled();

    const { target, querySelector, marker } = browser();
    await svg.motionPath(target, '#missing').finished;
    querySelector.mockImplementationOnce(() => { throw new SyntaxError('Invalid selector'); });
    await svg.motionPath(target, '[').finished;
    path.getTotalLength.mockReturnValueOnce(0);
    await svg.motionPath(target, track).finished;
    expect(path.getPointAtLength).not.toHaveBeenCalled();
    expect(marker.style.transform).toBe('');
  });
});

it('respects reduced motion in core', async () => {
  configure({ reducedMotion: 'always' });
  const { marker, target } = browser();
  const controls = core.motionPath(target, geometry() as unknown as SVGPathElement, { duration: 5 });
  await controls.finished;
  expect(marker.style.transform.trim()).toBe('translate(40px,60px)');
});
