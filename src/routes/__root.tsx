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
      <div className="glass max-w-md rounded-2xl p-8 text-center">
        <h1 className="text-5xl tracking-tight">404</h1>
        <p className="font-serif-italic mt-2 text-muted-foreground">this page drifted away</p>
        <Link to="/" className="mt-6 inline-block text-primary underline-offset-4 hover:underline">
          go home
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
      <div className="glass max-w-lg rounded-2xl p-6">
        <h1 className="text-lg font-medium text-destructive">something broke</h1>
        <pre className="font-mono-tight mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 text-xs text-muted-foreground">
{String(error?.message ?? error)}
        </pre>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
        >try again</button>
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
      <Toaster position="bottom-center" />
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
