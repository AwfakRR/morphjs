import { animate, stagger } from 'morphjs';

/**
 * Configuration for table transitions
 */
export interface TableTransitionOptions {
  /**
   * Animation style for rows entering
   */
  rowEnterStyle?: 'fade' | 'slide-up';
  /**
   * Animation style for cell updates
   */
  cellHighlightStyle?: 'pulse' | 'flash';
  /**
   * Base duration in seconds
   */
  duration?: number;
}

/**
 * Creates transition effects for @tanstack/table integrations.
 * 
 * @param options - Configuration for table transitions
 * @returns Hooks to trigger table animations
 */
export function createTableTransition(options: TableTransitionOptions = {}) {
  const {
    rowEnterStyle = 'fade',
    cellHighlightStyle = 'pulse',
    duration = 0.25,
  } = options;

  return {
    /**
     * Animate rows entering (e.g. after sort or page change)
     * @param elements Array of row DOM elements
     */
    animateRows(elements: HTMLElement[] | NodeListOf<HTMLElement>) {
      if (typeof window === 'undefined' || !elements || elements.length === 0) return;

      const targets = Array.from(elements);
      const properties: Record<string, any> = { opacity: [0, 1] };

      if (rowEnterStyle === 'slide-up') {
        properties.y = [15, 0];
      }

      return animate(targets, properties, {
        duration,
        delay: stagger(0.02),
        ease: 'easeOut',
      });
    },

    /**
     * Highlight a specific cell that was updated
     * @param element The cell DOM element
     */
    highlightCell(element: HTMLElement) {
      if (typeof window === 'undefined' || !element) return;

      if (cellHighlightStyle === 'pulse') {
        return animate(
          element,
          { scale: [1, 1.05, 1] },
          { duration: 0.3, ease: 'easeInOut' }
        );
      } else if (cellHighlightStyle === 'flash') {
        return animate(
          element,
          { backgroundColor: ['rgba(100, 200, 255, 0.3)', 'transparent'] },
          { duration: 0.5, ease: 'easeOut' }
        );
      }
    }
  };
}
