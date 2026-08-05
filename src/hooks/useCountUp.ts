import { useEffect, useRef, useState } from "react";

interface UseCountUpOptions {
  duration?: number;
  start?: number;
  separator?: boolean;
  decimals?: number;
}

export function useCountUp(
  target: number,
  { duration = 1600, start = 0, separator = true, decimals = 0 }: UseCountUpOptions = {}
) {
  const [value, setValue] = useState(start);
  const prevTarget = useRef(start);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevTarget.current;
    const to = target;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevTarget.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  const formatted = value.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: separator,
  });

  return { value, formatted };
}

export default useCountUp;
