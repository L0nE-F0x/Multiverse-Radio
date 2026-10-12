import { useEffect, useRef } from 'react';
import { useUi, type CabinetEvent } from '../ui/store';

/** Runs `handler` whenever one of `kinds` happens to the cabinet. Never re-renders. */
export function useCabinetEvent(kinds: readonly CabinetEvent[], handler: (kind: CabinetEvent) => void): void {
  const ref = useRef({ kinds, handler });
  useEffect(() => {
    ref.current = { kinds, handler };
  });
  useEffect(
    () =>
      useUi.subscribe((state, previous) => {
        const event = state.event;
        if (!event || event === previous.event) return;
        if (ref.current.kinds.includes(event.kind)) ref.current.handler(event.kind);
      }),
    [],
  );
}
