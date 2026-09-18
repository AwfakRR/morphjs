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
  const onEnter = (el: Element, done: () => void) => {
    if (!props.enter) {
      done();
      return;
    }
    const options = { ...props.enter };
    if (props.duration !== undefined && options.duration === undefined) {
      options.duration = props.duration;
    }
    const anim = animate(el, options);
    if (anim && typeof anim.then === 'function') {
      anim.then(done);
    } else {
      done();
    }
  };

  const onLeave = (el: Element, done: () => void) => {
    if (!props.leave) {
      done();
      return;
    }
    const options = { ...props.leave };
    if (props.duration !== undefined && options.duration === undefined) {
      options.duration = props.duration;
    }
    const anim = animate(el, options);
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
      onEnter,
      onLeave,
    },
    slots
  );
};

MorphTransition.props = ['enter', 'leave', 'spring', 'duration', 'mode', 'appear'];
