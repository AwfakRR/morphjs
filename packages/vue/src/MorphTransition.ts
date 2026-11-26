import { h, Transition, type FunctionalComponent, type TransitionProps } from 'vue';
import { animate } from 'morphjs';

export interface MorphTransitionProps {
  enter?: Record<string, any>;
  leave?: Record<string, any>;
  spring?: Record<string, any>;
  duration?: number;
  mode?: TransitionProps['mode'];
  appear?: boolean;
}

export const MorphTransition: FunctionalComponent<MorphTransitionProps> = (props, { slots }) => {
  const createHook = (phase?: Record<string, any>) => (el: Element, done: () => void) => {
    if (!phase) {
      done();
      return;
    }
    const { duration = props.duration, ...keyframes } = phase;
    const anim = animate(el, keyframes, { duration, spring: props.spring });
    if (anim && typeof anim.then === 'function') {
      anim.then(done);
    } else {
      done();
    }
  };

  return h(
    Transition,
    {
      css: false,
      mode: props.mode,
      appear: props.appear,
      onEnter: createHook(props.enter),
      onLeave: createHook(props.leave),
    },
    slots
  );
};

MorphTransition.props = ['enter', 'leave', 'spring', 'duration', 'mode', 'appear'];
