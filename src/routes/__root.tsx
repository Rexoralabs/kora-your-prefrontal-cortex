import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Splash } from "@/components/Splash";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center kora-cloud-bg px-4">
      <div className="glass max-w-md rounded-3xl p-10 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-5xl tracking-tight">Drifted Away</h1>
        <p className="font-serif-italic mt-3 text-muted-foreground">
          This page isn't where you left it.
        </p>
        <Link
          to="/"
          className="btn-primary mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center kora-cloud-bg px-4">
      <div className="glass max-w-lg rounded-3xl p-8">
        <p className="eyebrow">Something Broke</p>
        <h1 className="mt-2 text-2xl tracking-tight">A Small Hiccup</h1>
        <pre className="font-mono-tight mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
{String(error?.message ?? error)}
        </pre>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="btn-primary mt-5 rounded-xl px-4 py-2 text-sm"
        >Try Again</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Kora — your quiet co-pilot" },
      { name: "description", content: "Kora is an autonomous, proactive AI assistant. Tell it what's on your mind — it plans, writes the code, and runs it." },
      { property: "og:title", content: "Kora — your quiet co-pilot" },
      { name: "twitter:title", content: "Kora — your quiet co-pilot" },
      { property: "og:description", content: "An autonomous AI assistant that thinks, writes code, and acts on your behalf." },
      { name: "twitter:description", content: "An autonomous AI assistant that thinks, writes code, and acts on your behalf." },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body className="min-h-screen bg-background text-foreground">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Splash />
      <AuthSync />
      <Outlet />
      <Toaster position="bottom-center" toastOptions={{ className: "glass-soft !rounded-2xl" }} />
    </QueryClientProvider>
  );
}

function AuthSync() {
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      qc.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, qc]);
  return null;
}
