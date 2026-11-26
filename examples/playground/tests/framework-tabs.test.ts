import { readFileSync } from 'node:fs';
import { beforeEach, expect, it } from 'vitest';
import { initFrameworkTabs } from '../src/framework-tabs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

class ElementStub extends EventTarget {
  private readonly attributes: Map<string, string>;

  constructor(markup: string) {
    super();
    this.attributes = new Map(
      Array.from(markup.matchAll(/([\w-]+)(?:="([^"]*)")?/g), ([, name, value]) => [name, value ?? '']),
    );
    this.classes = new Set(this.getAttribute('class')?.split(' '));
  }

  readonly classList = {
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, active: boolean) => {
      if (active) this.classes.add(name);
      else this.classes.delete(name);
    },
  };

  private readonly classes: Set<string>;
  get id() { return this.getAttribute('id'); }
  set tabIndex(value) { this.setAttribute('tabindex', String(value)); }
  get hidden() { return this.attributes.has('hidden'); }
  set hidden(value) {
    if (value) this.setAttribute('hidden', '');
    else this.attributes.delete('hidden');
  }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  focus() { focused = this; }
}

let focused: ElementStub;
let tabs: ElementStub[];
let panels: ElementStub[];

function expectSelection(selected: number) {
  tabs.forEach((tab, index) => {
    const active = index === selected;
    expect(tab.getAttribute('aria-selected')).toBe(String(active));
    expect(tab.getAttribute('tabindex')).toBe(active ? '0' : '-1');
    expect(tab.classList.contains('active')).toBe(active);
    expect(panels[index].hidden).toBe(!active);
    expect(panels[index].classList.contains('active')).toBe(active);
  });
}

beforeEach(() => {
  tabs = Array.from(html.matchAll(/<button ([^>]*class="tab-btn[^>]+)>/g), ([, attrs]) => new ElementStub(attrs));
  panels = Array.from(html.matchAll(/<pre ([^>]*class="tab-pane[^>]+)>/g), ([, attrs]) => new ElementStub(attrs));
});

it('names the tablist and links each tab and focusable panel, with React selected by default', () => {
  const list = new ElementStub(html.match(/<div (class="tabs"[^>]*)>/)?.[1] ?? '');
  expect(list.getAttribute('role')).toBe('tablist');
  expect(list.getAttribute('aria-label')).toBeTruthy();
  expect(tabs).toHaveLength(4);
  expect(panels).toHaveLength(4);
  expect(new Set([...tabs, ...panels].map(element => element.id)).size).toBe(8);
  tabs.forEach((tab, index) => {
    const panel = panels[index];
    expect(tab.getAttribute('role')).toBe('tab');
    expect(tab.id).toBeTruthy();
    expect(tab.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    expect(panel.getAttribute('tabindex')).toBe('0');
  });
  expectSelection(0);
});

it('selects a clicked tab and moves focus and selection with arrows, Home and End', () => {
  initFrameworkTabs({
    querySelectorAll: (selector: string) => selector === '.tab-btn' ? tabs : [],
    getElementById: (id: string) => panels.find(panel => panel.id === id) ?? null,
  } as unknown as Document);

  tabs[2].focus();
  tabs[2].dispatchEvent(new Event('click'));
  expectSelection(2);
  const steps = [
    ['ArrowRight', 3],
    ['ArrowRight', 0],
    ['ArrowLeft', 3],
    ['ArrowLeft', 2],
    ['Home', 0],
    ['End', 3],
  ] as const;
  for (const [key, index] of steps) {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key });
    focused.dispatchEvent(event);
    expect(focused, key).toBe(tabs[index]);
    expect(event.defaultPrevented).toBe(true);
    expectSelection(index);
  }
  const ctrlHome = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Home', ctrlKey: true });
  tabs[3].dispatchEvent(ctrlHome);
  expect(ctrlHome.defaultPrevented).toBe(false);
  expect(focused).toBe(tabs[3]);
  expectSelection(3);

  tabs[1].dispatchEvent(new Event('click'));
  expectSelection(1);
  const arrowDown = Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowDown' });
  tabs[1].dispatchEvent(arrowDown);
  expect(arrowDown.defaultPrevented).toBe(false);
  expectSelection(1);
});
