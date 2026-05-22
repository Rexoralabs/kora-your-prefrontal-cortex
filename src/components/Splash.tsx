import { useEffect, useState } from "react";

export function Splash() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 1600);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center kora-cloud-bg"
      style={{ animation: "splashFadeOut 600ms ease 1100ms forwards" }}
      aria-hidden
    >
      <div className="relative flex flex-col items-center">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <span
            className="absolute inset-0 rounded-full border border-primary/50"
            style={{ animation: "splashRing 1.6s ease-out infinite" }}
          />
          <span
            className="absolute inset-0 rounded-full border border-primary/30"
            style={{ animation: "splashRing 1.6s ease-out 0.4s infinite" }}
          />
          <div className="w-12 h-12 rounded-full bg-primary shadow-soft" />
        </div>
        <h1
          className="mt-6 text-3xl tracking-tight"
          style={{ animation: "splashRise 700ms cubic-bezier(.2,.7,.2,1) both" }}
        >
          kora
        </h1>
        <p
          className="mt-1 font-serif-italic text-sm text-muted-foreground"
          style={{ animation: "splashRise 800ms 120ms cubic-bezier(.2,.7,.2,1) both" }}
        >
          your quiet co-pilot
        </p>
      </div>
    </div>
  );
}
