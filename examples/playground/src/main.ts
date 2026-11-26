import morph, { timeline, spring, stagger, scroll, gesture, svg } from 'morph-stripped';
import { initFrameworkTabs } from './framework-tabs';

// --- Demo 1: Quick Start (Shorthand) ---
const btnQuickMove = document.getElementById('btn-quick-move');
const btnQuickRotate = document.getElementById('btn-quick-rotate');
const btnQuickReset = document.getElementById('btn-quick-reset');

btnQuickMove?.addEventListener('click', () => {
  morph('#quick-box', { x: 80 }, 0.5);
});

btnQuickRotate?.addEventListener('click', () => {
  morph('#quick-box', { rotate: 180 }, 0.5);
});

btnQuickReset?.addEventListener('click', () => {
  morph('#quick-box', { x: 0, rotate: 0 }, 0.5);
});

// --- Demo 2: Spring Physics ---
const btnSpringTrigger = document.getElementById('btn-spring-trigger');
const inputStiffness = document.getElementById('spring-stiffness') as HTMLInputElement | null;
const inputDamping = document.getElementById('spring-damping') as HTMLInputElement | null;
const inputMass = document.getElementById('spring-mass') as HTMLInputElement | null;
const valStiffness = document.getElementById('val-stiffness');
const valDamping = document.getElementById('val-damping');
const valMass = document.getElementById('val-mass');

function updateSpringValues() {
  if (valStiffness && inputStiffness) valStiffness.textContent = inputStiffness.value;
  if (valDamping && inputDamping) valDamping.textContent = inputDamping.value;
  if (valMass && inputMass) valMass.textContent = inputMass.value;
}

[inputStiffness, inputDamping, inputMass].forEach((input) => {
  input?.addEventListener('input', updateSpringValues);
});

btnSpringTrigger?.addEventListener('click', () => {
  const stiffness = inputStiffness ? parseFloat(inputStiffness.value) : 100;
  const damping = inputDamping ? parseFloat(inputDamping.value) : 10;
  const mass = inputMass ? parseFloat(inputMass.value) : 1;

  spring('#spring-ball', { y: [0, -60, 0], scale: [1, 1.2, 1] }, { stiffness, damping, mass });
});

// --- Demo 3: Timeline & Controls ---
let tl: any = null;
function createDemoTimeline() {
  const t = timeline({ autoplay: false });
  t.add('#tl-box-1', { x: [0, 80] }, 0)
   .add('#tl-box-2', { y: [0, -40] }, '-=0.2')
   .add('#tl-box-3', { rotate: [0, 360] }, '-=0.2');
  return t;
}

tl = createDemoTimeline();

const btnTlPlay = document.getElementById('btn-tl-play');
const btnTlPause = document.getElementById('btn-tl-pause');
const btnTlReverse = document.getElementById('btn-tl-reverse');
const btnTlRestart = document.getElementById('btn-tl-restart');
const inputScrub = document.getElementById('tl-scrub') as HTMLInputElement | null;

btnTlPlay?.addEventListener('click', () => tl?.play());
btnTlPause?.addEventListener('click', () => tl?.pause());
btnTlReverse?.addEventListener('click', () => tl?.reverse());
btnTlRestart?.addEventListener('click', () => tl?.restart());

let isScrubbing = false;
inputScrub?.addEventListener('pointerdown', () => {
  isScrubbing = true;
  tl?.pause();
});
inputScrub?.addEventListener('pointerup', () => {
  isScrubbing = false;
});
inputScrub?.addEventListener('input', () => {
  if (inputScrub && tl && tl.seek && tl.duration > 0) {
    const val = parseFloat(inputScrub.value);
    tl.seek(val * tl.duration);
  }
});

function syncScrubSlider() {
  if (!isScrubbing && inputScrub && tl && tl.duration > 0) {
    inputScrub.value = (tl.currentTime / tl.duration).toFixed(3);
  }
  requestAnimationFrame(syncScrubSlider);
}
requestAnimationFrame(syncScrubSlider);

// --- Demo 4: Stagger Grid ---
const grid = document.getElementById('stagger-grid');
const gridSize: [number, number] = [6, 6];
if (grid) {
  grid.innerHTML = '';
  for (let i = 0; i < gridSize[0] * gridSize[1]; i++) {
    const dot = document.createElement('div');
    dot.className = 'stagger-dot';
    grid.appendChild(dot);
  }
}

const btnStagCenter = document.getElementById('btn-stag-center');
const btnStagEdge = document.getElementById('btn-stag-edge');
const btnStagRandom = document.getElementById('btn-stag-random');

btnStagCenter?.addEventListener('click', () => {
  morph('.stagger-dot', { scale: [0.2, 1], opacity: [0.2, 1] }, {
    delay: stagger(0.04, { from: 'center', grid: gridSize }),
    duration: 0.4,
  });
});

btnStagEdge?.addEventListener('click', () => {
  morph('.stagger-dot', { scale: [0.2, 1], opacity: [0.2, 1] }, {
    delay: stagger(0.04, { from: 'last' }),
    duration: 0.4,
  });
});

btnStagRandom?.addEventListener('click', () => {
  morph('.stagger-dot', { scale: [0.2, 1], opacity: [0.2, 1] }, {
    delay: stagger(0.04, { from: 'random' }),
    duration: 0.4,
  });
});

// --- Demo 5: Gesture ---
gesture('#gesture-card', {
  drag: { snapToOrigin: true },
  hover: true,
  press: true,
  onHoverStart: () => {
    morph('#gesture-card', { scale: 1.06 }, 0.2);
  },
  onHoverEnd: () => {
    morph('#gesture-card', { scale: 1 }, 0.2);
  },
  onPressStart: () => {
    morph('#gesture-card', { scale: 0.94 }, 0.1);
  },
  onPressEnd: () => {
    morph('#gesture-card', { scale: 1 }, 0.1);
  },
});

gesture('#gesture-puck', {
  drag: { constraints: { left: -60, right: 60, top: 0, bottom: 0 }, momentum: true },
});

// --- Demo 6: Scroll ---
const scrollContainer = document.getElementById('scroll-container');
if (scrollContainer) {
  scroll(
    (progress) => {
      const bar = document.getElementById('scroll-progress');
      if (bar) {
        bar.style.width = `${progress * 100}%`;
      }
      const parallax = document.getElementById('parallax-element');
      if (parallax) {
        parallax.style.transform = `translateY(${progress * 40}px) rotate(${progress * 90}deg)`;
      }
    },
    { container: scrollContainer }
  );
}

const revealContainer = document.getElementById('reveal-container');
if (revealContainer && typeof IntersectionObserver !== 'undefined') {
  revealContainer.classList.add('reveal-ready');
  scroll.inView(revealContainer.querySelectorAll('.reveal-item'), (element) => {
    element.classList.add('is-revealed');
  }, { container: revealContainer, threshold: 0.25 });
}

// --- Demo 7: SVG ---
const btnSvgDraw = document.getElementById('btn-svg-draw');
const btnSvgMorph = document.getElementById('btn-svg-morph');

// Initialize SVG stroke so it starts hidden and ready to draw
const initStroke = () => {
  const strokePath = document.getElementById('svg-stroke') as SVGGeometryElement | null;
  if (strokePath && strokePath.getTotalLength) {
    const len = strokePath.getTotalLength();
    strokePath.style.strokeDasharray = `${len}`;
    strokePath.style.strokeDashoffset = `${len}`;
    strokePath.setAttribute('stroke-dasharray', `${len}`);
    strokePath.setAttribute('stroke-dashoffset', `${len}`);
  }
};
initStroke();

let isDrawn = false;
let strokeDraw: ReturnType<typeof svg.draw> | null = null;
btnSvgDraw?.addEventListener('click', () => {
  if (!strokeDraw) {
    strokeDraw = svg.draw('#svg-stroke', { duration: 1.5, ease: 'easeInOut' });
    isDrawn = true;
    return;
  }
  if (isDrawn) {
    strokeDraw.reverse();
    isDrawn = false;
  } else {
    strokeDraw.play();
    isDrawn = true;
  }
});

const starPath = 'M100 20 L120 70 L180 80 L130 115 L145 170 L100 140 L55 170 L70 115 L20 80 L80 70 Z';
const circlePath = 'M 100, 100 m -60, 0 a 60,60 0 1,0 120,0 a 60,60 0 1,0 -120,0';
let isStar = true;

btnSvgMorph?.addEventListener('click', () => {
  const fromPath = isStar ? starPath : circlePath;
  const toPath = isStar ? circlePath : starPath;
  svg.morph('#svg-morph-path', {
    d: [fromPath, toPath],
    duration: 1.2,
    ease: 'easeInOut',
  });
  isStar = !isStar;
});

// --- Framework Tabs ---
if (typeof document !== 'undefined') initFrameworkTabs(document);
