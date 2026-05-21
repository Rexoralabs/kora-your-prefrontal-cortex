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

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center font-mono">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">SIGNAL_NOT_FOUND</p>
        <Link to="/" className="mt-6 inline-block text-primary underline">~/return</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-lg font-mono">
        <h1 className="text-lg font-semibold text-destructive">RUNTIME_FAULT</h1>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border bg-card p-3 text-xs text-muted-foreground">
{String(error?.message ?? error)}
        </pre>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-4 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >retry</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Kora — Autonomous AI Assistant" },
      { name: "description", content: "Project Kora: an autonomous, proactive agentic assistant — your externalized prefrontal cortex." },
      { property: "og:title", content: "Kora — Autonomous AI Assistant" },
      { name: "twitter:title", content: "Kora — Autonomous AI Assistant" },
      { property: "og:description", content: "Project Kora: an autonomous, proactive agentic assistant — your externalized prefrontal cortex." },
      { name: "twitter:description", content: "Project Kora: an autonomous, proactive agentic assistant — your externalized prefrontal cortex." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/22e42aed-2658-4e66-b692-ffbf7f126ba4" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/22e42aed-2658-4e66-b692-ffbf7f126ba4" },
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
    <html lang="en" className="dark">
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
      <AuthSync />
      <Outlet />
      <Toaster theme="dark" position="bottom-right" />
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
