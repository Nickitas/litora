import { useEffect, useRef, type HTMLAttributes } from "react";
import { cn } from "../lib/utils";

export function ScrollProgress({
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      const progress =
        height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0;
      if (element.current)
        element.current.style.transform = `scaleX(${progress})`;
    };
    const schedule = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      {...props}
      ref={element}
      aria-hidden="true"
      className={cn(
        "brand-gradient fixed inset-x-0 top-0 z-50 h-1 origin-left",
        className
      )}
      style={{ ...style, transform: "scaleX(0)" }}
    />
  );
}
