import React, {
  ReactNode,
  useState,
  useEffect,
  useRef,
  Children,
  isValidElement,
  cloneElement,
  ReactElement
} from 'react';

export interface MorphPresenceProps {
  children?: ReactNode;
  initial?: boolean;
  onExitComplete?: () => void;
}

interface ChildEntry {
  element: ReactElement;
  key: string | number;
  isExiting: boolean;
}

/**
 * MorphPresence handles exit animations by delaying the unmounting of components
 * that are removed from the React tree until their exit animations are complete.
 */
export const MorphPresence: React.FC<MorphPresenceProps> = ({
  children,
  initial = true,
  onExitComplete
}) => {
  const [displayedChildren, setDisplayedChildren] = useState<ChildEntry[]>([]);
  const isInitialRender = useRef(true);

  useEffect(() => {
    const getKey = (child: ReactElement, index: number): string | number =>
      child.key != null ? child.key : `morph_child_${index}`;

    if (isInitialRender.current) {
      isInitialRender.current = false;
      const initialChildren = Children.toArray(children)
        .filter(isValidElement)
        .map((child, index) => ({
          element: child as ReactElement,
          key: getKey(child as ReactElement, index),
          isExiting: false
        }));
      setDisplayedChildren(initialChildren);
      return;
    }

    const currentArray = Children.toArray(children).filter(isValidElement) as ReactElement[];
    const currentKeys = new Set(currentArray.map((child, index) => getKey(child, index)));

    setDisplayedChildren((prev) => {
      const nextChildren: ChildEntry[] = [];
      const newChildrenMap = new Map<string | number, ReactElement>(
        currentArray.map((child, index) => [getKey(child, index), child])
      );

      // Keep previous children that are still present or currently exiting
      for (const child of prev) {
        if (newChildrenMap.has(child.key)) {
          // Still present, update the element
          nextChildren.push({
            element: newChildrenMap.get(child.key)!,
            key: child.key,
            isExiting: false
          });
          newChildrenMap.delete(child.key);
        } else if (!currentKeys.has(child.key)) {
          // Removed from current tree, mark as exiting
          nextChildren.push({
            ...child,
            isExiting: true
          });
        }
      }

      // Add new children that weren't in prev
      for (const [key, element] of newChildrenMap) {
        nextChildren.push({ element, key, isExiting: false });
      }

      return nextChildren;
    });
  }, [children]);

  const handleExitComplete = (key: string | number) => {
    setDisplayedChildren((prev) => {
      const next = prev.filter((child) => child.key !== key);
      if (next.length === 0 && onExitComplete) {
        onExitComplete();
      }
      return next;
    });
  };

  return React.createElement(
    React.Fragment,
    null,
    displayedChildren.map((child) => {
      // We clone the child to pass down isExiting and onExitComplete if it's exiting
      if (child.isExiting) {
        return cloneElement(child.element, {
          isExiting: true,
          onExitComplete: () => {
            // Call original if it exists
            if (child.element.props.onExitComplete) {
              child.element.props.onExitComplete();
            }
            handleExitComplete(child.key);
          }
        });
      }
      return child.element;
    })
  );
};
