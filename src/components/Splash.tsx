import { useEffect, useState } from "react";

const KEY = "kora.splash.shown";

/**
 * Splash shows once per browser session — first entry only.
 * It does NOT show on route changes, refreshes within a session, or returns.
 */
export function Splash() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const already = sessionStorage.getItem(KEY);
      if (already) return;
      sessionStorage.setItem(KEY, "1");
      setShow(true);
    } catch {
      // Storage blocked — skip splash rather than break the app.
    }
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center kora-cloud-bg"
      style={{ animation: "splashFadeOut 700ms ease 1300ms forwards" }}
      aria-hidden
    >
      <div className="relative flex flex-col items-center">
        <div className="relative w-28 h-28 flex items-center justify-center">
          <span
            className="absolute inset-0 rounded-full border border-primary/40"
            style={{ animation: "splashRing 1.8s ease-out infinite" }}
          />
          <span
            className="absolute inset-0 rounded-full border border-primary/25"
            style={{ animation: "splashRing 1.8s ease-out 0.5s infinite" }}
          />
          <div
            className="w-14 h-14 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, oklch(0.85 0.15 60), oklch(0.55 0.22 38))",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.6) inset, 0 20px 50px -10px color-mix(in oklab, var(--primary) 40%, transparent)",
              animation: "orbDrift 3.6s ease-in-out infinite",
            }}
          />
        </div>
        <h1
          className="mt-8 text-4xl tracking-tight"
          style={{ animation: "splashRise 720ms cubic-bezier(.2,.7,.2,1) both" }}
        >
          kora
        </h1>
        <p
          className="mt-1 font-serif-italic text-base text-muted-foreground"
          style={{ animation: "splashRise 840ms 140ms cubic-bezier(.2,.7,.2,1) both" }}
        >
          your quiet co-pilot
        </p>
      </div>
    </div>
  );
}
