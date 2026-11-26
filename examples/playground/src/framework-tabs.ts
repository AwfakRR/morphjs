export function initFrameworkTabs(root: Document) {
  const tabs = root.querySelectorAll<HTMLButtonElement>('.tab-btn');
  const panels = Array.from(tabs, tab => root.getElementById(tab.getAttribute('aria-controls') ?? ''));

  function selectTab(selected: number) {
    tabs.forEach((tab, index) => {
      const active = index === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle('active', active);
      const panel = panels[index];
      if (panel) {
        panel.hidden = !active;
        panel.classList.toggle('active', active);
      }
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(index));
    tab.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      let next: number;
      switch (event.key) {
        case 'ArrowLeft':
          next = (index + tabs.length - 1) % tabs.length;
          break;
        case 'ArrowRight':
          next = (index + 1) % tabs.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      selectTab(next);
      tabs[next].focus();
    });
  });
}
