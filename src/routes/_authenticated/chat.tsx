import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUp,
  Brain,
  Check,
  Sparkle,
  Warning,
  X,
} from "@phosphor-icons/react";
import { ingestSignal, getPlan } from "@/lib/agent.functions";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

type Msg =
  | { id: string; role: "user"; text: string; t: number }
  | { id: string; role: "agent"; planId: string | null; text?: string; t: number };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function ChatPage() {
  const ingest = useServerFn(ingestSignal);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "agent",
      planId: null,
      text:
        "I'm Kora. Tell me what's on your mind — a task, a fuzzy worry, a half-formed idea. I'll plan it, write the code, and run it. Quietly.",
      t: Date.now(),
    },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const userMsg: Msg = { id: uid(), role: "user", text, t: Date.now() };
    const pendingId = uid();
    setMessages((m) => [...m, userMsg, { id: pendingId, role: "agent", planId: null, t: Date.now() }]);
    setDraft("");
    try {
      const res = await ingest({ data: { text, source: "chat", priority: "normal", autorun: true } });
      setMessages((m) =>
        m.map((x) => (x.id === pendingId ? { ...x, planId: res.plan_id ?? null } : x)),
      );
      qc.invalidateQueries({ queryKey: ["signals"] });
    } catch (err: any) {
      setMessages((m) =>
        m.map((x) =>
          x.id === pendingId
            ? { id: x.id, role: "agent", planId: null, text: `Something went sideways: ${err.message ?? err}`, t: Date.now() }
            : x,
        ),
      );
      toast.error(err.message ?? "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative -mx-4 -my-6 min-h-[calc(100vh-64px)] kora-cloud-bg">
      <div className="mx-auto flex h-[calc(100vh-64px)] max-w-3xl flex-col px-4 pt-8">
        <header className="mb-6 flex items-baseline gap-3">
          <h1 className="text-2xl tracking-tight">chat</h1>
          <span className="font-serif-italic text-muted-foreground">
            think out loud — kora handles the rest
          </span>
        </header>

        <div ref={scroller} className="flex-1 overflow-y-auto pb-32 pr-1">
          <div className="flex flex-col gap-5">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} text={m.text} />
              ) : (
                <AgentBubble key={m.id} msg={m} onOpen={(id) => nav({ to: "/plans/$id", params: { id } })} />
              ),
            )}
          </div>
        </div>

        <form
          onSubmit={send}
          className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-6"
        >
          <div className="pointer-events-auto mx-auto max-w-3xl">
            <div className="glass flex items-end gap-2 rounded-2xl p-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="ask kora to do something…"
                className="max-h-48 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
              />
              <button
                disabled={sending || !draft.trim()}
                className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground transition disabled:opacity-30"
                aria-label="send"
              >
                <ArrowUp weight="bold" size={18} />
              </button>
            </div>
            <p className="mt-2 text-center font-mono-tight text-[11px] text-muted-foreground">
              enter to send · shift+enter for newline
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-[15px] text-background shadow-soft">
        {text}
      </div>
    </div>
  );
}

function AgentBubble({ msg, onOpen }: { msg: Extract<Msg, { role: "agent" }>; onOpen: (id: string) => void }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-background">
        <Sparkle weight="fill" size={14} />
      </div>
      <div className="min-w-0 flex-1">
        {msg.text && (
          <div className="glass-soft rounded-2xl rounded-tl-md px-4 py-3 text-[15px]">
            {msg.text}
          </div>
        )}
        {msg.planId && <AgentTrace planId={msg.planId} onOpen={onOpen} />}
        {!msg.planId && !msg.text && <Thinking label="reading your intent" />}
      </div>
    </div>
  );
}

function Thinking({ label }: { label: string }) {
  return (
    <div className="glass-soft inline-flex items-center gap-3 rounded-2xl rounded-tl-md px-4 py-3">
      <Brain size={16} className="text-primary" />
      <span className="thinking-text text-[14px]">{label}</span>
      <span className="ml-1 inline-flex gap-1 text-primary">
        <span className="think-dot" />
        <span className="think-dot" />
        <span className="think-dot" />
      </span>
    </div>
  );
}

function AgentTrace({ planId, onOpen }: { planId: string; onOpen: (id: string) => void }) {
  const getPlanFn = useServerFn(getPlan);
  const { data } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => getPlanFn({ data: { id: planId } }),
    refetchInterval: (q) => {
      const d: any = q.state.data;
      if (!d?.plan) return 1500;
      return d.plan.status === "running" || d.plan.status === "pending" ? 1500 : false;
    },
  });

  if (!data?.plan) return <Thinking label="planning steps" />;
  const { plan, runs } = data;
  const dag: any = plan.dag;
  const nodes: any[] = dag?.nodes ?? [];
  const runsByNode: Record<string, any[]> = {};
  for (const r of runs) (runsByNode[r.node_id] ??= []).push(r);

  const done = plan.status === "completed";
  const failed = plan.status === "failed";
  const live = !done && !failed;

  return (
    <div className="mt-2 space-y-2">
      {dag?.reasoning && (
        <div className="glass-soft rounded-2xl rounded-tl-md px-4 py-3">
          <p className="font-serif-italic text-[15px] leading-snug text-foreground/80">
            "{dag.reasoning}"
          </p>
        </div>
      )}

      <div className="glass rounded-2xl p-3">
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="font-mono-tight text-[11px] uppercase tracking-wider text-muted-foreground">
            plan · {nodes.length} step{nodes.length === 1 ? "" : "s"}
          </span>
          <span
            className={`font-mono-tight text-[11px] uppercase tracking-wider ${
              done ? "text-ok" : failed ? "text-error" : "text-primary"
            }`}
          >
            {plan.status}
          </span>
          <button
            onClick={() => onOpen(planId)}
            className="ml-auto font-mono-tight text-[11px] text-muted-foreground underline-offset-4 hover:underline"
          >
            open ↗
          </button>
        </div>
        <ol className="space-y-1.5">
          {nodes.map((n) => {
            const last = (runsByNode[n.id] ?? []).slice(-1)[0];
            const s = last?.status ?? "pending";
            return (
              <li key={n.id} className="flex items-start gap-3 rounded-xl px-2 py-1.5">
                <StatusGlyph s={s} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-snug">{n.name}</p>
                  {n.description && (
                    <p className="font-mono-tight text-[11px] text-muted-foreground line-clamp-1">
                      {n.description}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {live && (
          <div className="mt-2 px-2">
            <Thinking label="executing" />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusGlyph({ s }: { s: string }) {
  if (s === "ok")
    return (
      <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-ok/15 text-ok">
        <Check weight="bold" size={12} />
      </span>
    );
  if (s === "error")
    return (
      <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-error/15 text-error">
        <X weight="bold" size={12} />
      </span>
    );
  if (s === "running")
    return (
      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center">
        <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
        <span className="absolute h-2 w-2 rounded-full bg-primary" />
      </span>
    );
  if (s === "retry")
    return (
      <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-warn/15 text-warn">
        <Warning weight="bold" size={12} />
      </span>
    );
  return <span className="mt-0.5 h-5 w-5 rounded-full border border-border" />;
}
