import { useEffect, useState } from 'react';

// rAF-based FPS readout. Updated every 250 ms so the digit doesn't strobe.
// Measures the browser frame loop, not Pixi's internal ticker — close enough
// for an at-a-glance "are we dropping frames" signal during a reveal.
export function FpsHud() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      frames++;
      const elapsed = now - last;
      if (elapsed >= 250) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="fps-hud">{fps} fps</div>;
}
