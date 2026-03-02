import { useState, useEffect, useCallback } from "react";

const BREAKPOINTS = { xs: 0, sm: 640, md: 768, lg: 1024 };

function getBreakpoint(w) {
  if (w >= BREAKPOINTS.lg) return "lg";
  if (w >= BREAKPOINTS.md) return "md";
  if (w >= BREAKPOINTS.sm) return "sm";
  return "xs";
}

export function useBreakpoint() {
  const [bp, setBp] = useState(() => getBreakpoint(window.innerWidth));

  useEffect(() => {
    let raf;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setBp(getBreakpoint(window.innerWidth)));
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  const isMobile = bp === "xs" || bp === "sm";
  const isTablet = bp === "md";
  const isDesktop = bp === "lg";

  return { breakpoint: bp, isMobile, isTablet, isDesktop };
}

export function responsive(bp, map) {
  return map[bp] ?? map.lg ?? map.md ?? map.sm ?? map.xs;
}
