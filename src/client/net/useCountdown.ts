import { useEffect, useState } from "react";

/** Whole seconds left until `deadline` (server time), or null when there is no deadline. */
export function useCountdown(deadline: number | null, clockOffset: number): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);

  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - (now + clockOffset)) / 1000));
}
