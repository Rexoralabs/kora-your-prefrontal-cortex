import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

const KEY = "kora.splash.shown";

/**
 * Splash shows once per browser session — first entry only.
 * GSAP-orchestrated: orb breathes in, rings pulse, wordmark rises, whole
 * stage drifts up + fades on exit. Never fires on /login.
 */
export function Splash() {
  const [show, setShow] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLDivElement>(null);
  const ring1 = useRef<HTMLSpanElement>(null);
  const ring2 = useRef<HTMLSpanElement>(null);
  const ring3 = useRef<HTMLSpanElement>(null);
  const word = useRef<HTMLHeadingElement>(null);
  const tagline = useRef<HTMLParagraphElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname.startsWith("/login")) return;
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
      setShow(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (!show) return;
    const ctx = gsap.context(() => {
      // initial state
      gsap.set([orb.current, word.current, tagline.current], { autoAlpha: 0 });
      gsap.set(orb.current, { scale: 0.6, filter: "blur(8px)" });
      gsap.set(word.current, { y: 24, letterSpacing: "0.4em" });
      gsap.set(tagline.current, { y: 14 });
      gsap.set([ring1.current, ring2.current, ring3.current], { scale: 0.5, autoAlpha: 0 });

      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

      tl.to(orb.current, { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: 1.1 })
        .to(
          [ring1.current, ring2.current, ring3.current],
          {
            autoAlpha: 1,
            scale: 1,
            duration: 1.4,
            stagger: 0.12,
            ease: "power3.out",
          },
          "-=0.8",
        )
        .to(
          word.current,
          {
            autoAlpha: 1,
            y: 0,
            letterSpacing: "-0.01em",
            duration: 1.0,
            ease: "expo.out",
          },
          "-=0.9",
        )
        .to(
          tagline.current,
          { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out" },
          "-=0.65",
        );

      // ambient orb breath
      gsap.to(orb.current, {
        y: -4,
        duration: 2.2,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });

      // ring pulse loop
      [ring1.current, ring2.current, ring3.current].forEach((r, i) => {
        if (!r) return;
        gsap.to(r, {
          scale: 1.5,
          opacity: 0,
          duration: 2.4,
          delay: 0.4 + i * 0.4,
          repeat: -1,
          ease: "power2.out",
        });
      });

      // exit
      gsap.to(root.current, {
        autoAlpha: 0,
        delay: 2.2,
        duration: 0.85,
        ease: "power3.inOut",
        onComplete: () => setShow(false),
      });
      gsap.to(stage.current, {
        y: -18,
        delay: 2.2,
        duration: 0.85,
        ease: "power3.inOut",
      });
    }, root);
    return () => ctx.revert();
  }, [show]);

  if (!show) return null;

  return (
    <div
      ref={root}
      className="fixed inset-0 z-[100] flex items-center justify-center kora-cloud-bg"
      aria-hidden
    >
      <div ref={stage} className="relative flex flex-col items-center">
        <div className="relative w-32 h-32 flex items-center justify-center">
          <span
            ref={ring1}
            className="absolute inset-0 rounded-full border border-primary/40"
          />
          <span
            ref={ring2}
            className="absolute inset-0 rounded-full border border-primary/25"
          />
          <span
            ref={ring3}
            className="absolute inset-0 rounded-full border border-primary/15"
          />
          <div
            ref={orb}
            className="w-16 h-16 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, oklch(0.88 0.14 65), oklch(0.55 0.22 38))",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.6) inset, 0 24px 60px -12px color-mix(in oklab, var(--primary) 45%, transparent)",
            }}
          />
        </div>
        <h1 ref={word} className="mt-9 text-5xl tracking-tight">
          kora
        </h1>
        <p
          ref={tagline}
          className="mt-2 font-serif-italic text-[15px] text-muted-foreground"
        >
          Your Quiet Co-Pilot
        </p>
      </div>
    </div>
  );
}
