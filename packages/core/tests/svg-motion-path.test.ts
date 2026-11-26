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
  it('moves all markers in a mix of NodeLists and element arrays', async () => {
    browser();
    const markers = [new Marker(), new Marker(), new Marker()];
    class MarkerList {
      forEach(callback: (marker: Marker) => void) { markers.slice(0, 2).forEach(callback); }
      [Symbol.iterator]() { return markers.slice(0, 2)[Symbol.iterator](); }
    }
    vi.stubGlobal('NodeList', MarkerList);
    const list = new MarkerList() as unknown as NodeList;
    const group = [markers[2]] as unknown as HTMLElement[];

    const controls = svg.motionPath([list, group], geometry() as unknown as SVGGeometryElement, {
      duration: 1, autoplay: false,
    });
    controls.finish();
    await controls.finished;
    expect(markers.map(marker => marker.style.transform)).toEqual(Array(3).fill('translate(40px,60px)'));
  });

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

  it('writes path translations and tangent rotations in pixels and degrees', async () => {
    const { marker, target } = browser();
    marker.style.transform = 'translateX(0%) translateY(0em) rotate(0turn)';
    const controls = svg.motionPath(target, geometry() as unknown as SVGGeometryElement, {
      duration: 1, autoplay: false, autoRotate: true,
    });

    controls.seek?.(0.6);
    await vi.waitFor(() => expect(controls.currentTime).toBe(0.6));
    expect(marker.style.transform).toBe('translate(40px,20px) rotate(90deg) translateX(0%) translateY(0em) rotate(0turn)');
    controls.cancel();
  });

  it('rotates to a diagonal tangent outside the original non-uniform scale', async () => {
    const { marker, target } = browser();
    marker.style.transform = 'scale(4, 1)';
    const track = {
      getTotalLength: () => 100,
      getPointAtLength: (distance: number) => ({ x: distance, y: distance }),
    } as unknown as SVGGeometryElement;

    const controls = svg.motionPath(target, track, { duration: 1, autoplay: false, autoRotate: true });
    controls.finish();
    await controls.finished;
    expect(marker.style.transform).toBe('translate(100px,100px) rotate(45deg) scale(4, 1)');
  });

  it('keeps the computed transform of a stylesheet-rotated target when autoRotate is off', async () => {
    const { marker, target } = browser();
    const transform = 'matrix(0.819152, 0.573576, -0.573576, 0.819152, 0, 0)';
    const getComputedStyle = vi.fn(() => ({ transform }));
    vi.stubGlobal('window', { getComputedStyle });

    const controls = svg.motionPath(target, geometry() as unknown as SVGGeometryElement, {
      duration: 1, autoplay: false,
    });
    controls.seek?.(0.6);
    await vi.waitFor(() => expect(controls.currentTime).toBe(0.6));

    expect(getComputedStyle).toHaveBeenCalledWith(target);
    expect(marker.style.transform.trim()).toBe(`translate(40px,20px) ${transform}`);
    controls.cancel();
  });

  it('translates before an inline rotation and scale without stacking successive path transforms', async () => {
    const { marker, target } = browser();
    const track = geometry() as unknown as SVGGeometryElement;
    marker.style.transform = 'rotate(35deg) scale(1.2)';

    const first = svg.motionPath(target, track, { duration: 1, autoplay: false });
    first.finish();
    await first.finished;
    expect(marker.style.transform).toBe('translate(40px,60px) rotate(35deg) scale(1.2)');

    const next = svg.motionPath(target, track, { duration: 1, autoplay: false, autoRotate: true });
    next.seek?.(0.6);
    await vi.waitFor(() => expect(next.currentTime).toBe(0.6));
    expect(marker.style.transform).toBe('translate(40px,20px) rotate(90deg) rotate(35deg) scale(1.2)');
    next.cancel();
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

  it('returns noop controls when SVG geometry cannot be measured', async () => {
    const { marker, target } = browser();
    const path = geometry();
    path.getTotalLength.mockImplementationOnce(() => {
      throw new DOMException('This element is non-rendered element.', 'InvalidStateError');
    });

    const controls = svg.motionPath(target, path as unknown as SVGGeometryElement);
    expect(controls.playState).toBe('idle');
    await controls.finished;
    expect(path.getTotalLength).toHaveBeenCalledOnce();
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
