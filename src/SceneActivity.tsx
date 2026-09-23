import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/** Keep decorative scenes still when motion is reduced, and idle when invisible. */
export function SceneActivity() {
  const { gl, setFrameloop, invalidate } = useThree();
  useEffect(() => {
    let visible = true;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const active = visible && !document.hidden;
      setFrameloop(active ? motion.matches ? "demand" : "always" : "never");
      if (active) invalidate();
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(gl.domElement);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
    };
  }, [gl, setFrameloop, invalidate]);
  return null;
}
