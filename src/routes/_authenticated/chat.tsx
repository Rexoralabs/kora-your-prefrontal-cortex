import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Brain,
  Check,
  ChatCircleDots,
  Copy,
  Image as ImageIcon,
  ArrowsClockwise,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Square,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  searchThreads,
  sendChatMessage,
  createSignedUpload,
} from "@/lib/chat.functions";
import { runChatCommand, regenerateLastReply } from "@/lib/commands.functions";
import { getPlan } from "@/lib/agent.functions";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

type Mode = "chat" | "thinking";
type Attachment = { url: string; kind: "image" | "file"; name: string };

function ChatPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const listFn = useServerFn(listThreads);
  const createFn = useServerFn(createThread);
  const delFn = useServerFn(deleteThread);
  const searchFn = useServerFn(searchThreads);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("chat");
  const [q, setQ] = useState("");

  const threadsQ = useQuery({ queryKey: ["chat-threads"], queryFn: () => listFn() });

  const searchQ = useQuery({
    queryKey: ["chat-search", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: q.trim().length > 1,
  });

  useEffect(() => {
    if (!activeId && threadsQ.data?.length) setActiveId(threadsQ.data[0].id);
  }, [threadsQ.data, activeId]);

  async function newThread() {
    const t = await createFn({ data: { title: "new conversation", mode } });
    setActiveId(t.id);
    qc.invalidateQueries({ queryKey: ["chat-threads"] });
  }

  async function removeThread(id: string) {
    if (!confirm("delete this conversation?")) return;
    await delFn({ data: { id } });
    if (activeId === id) setActiveId(null);
    qc.invalidateQueries({ queryKey: ["chat-threads"] });
  }

  const threadList = useMemo(() => {
    if (q.trim().length > 1 && searchQ.data) {
      return searchQ.data.threads;
    }
    return threadsQ.data ?? [];
  }, [q, searchQ.data, threadsQ.data]);

  return (
    <div className="relative -mx-4 -my-6 min-h-[calc(100vh-64px)] kora-cloud-bg">
      <div className="mx-auto flex h-[calc(100vh-72px)] max-w-6xl gap-4 px-4 pt-6">
        {/* Sidebar */}
        <aside className="glass hidden w-72 shrink-0 flex-col rounded-2xl p-3 md:flex">
          <div className="flex items-center gap-2 px-1 pb-2">
            <h2 className="text-[15px] tracking-tight">Conversations</h2>
            <button
              onClick={newThread}
              className="ml-auto btn-ghost grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/8"
              title="New"
            >
              <Plus weight="bold" size={14} />
            </button>
          </div>
          <div className="relative mb-2">
            <MagnifyingGlass
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="field w-full rounded-lg pl-7 pr-2 py-1.5 text-[12.5px] outline-none"
            />
          </div>
          <div className="-mx-1 flex-1 overflow-y-auto px-1">
            {threadList.length === 0 && (
              <p className="px-2 py-6 text-center font-serif-italic text-[13px] text-muted-foreground">
                No conversations yet — start one
              </p>
            )}
            <ul className="space-y-0.5">
              {threadList.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setActiveId(t.id)}
                    className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
                      activeId === t.id
                        ? "bg-foreground/8 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    }`}
                  >
                    <span className="line-clamp-1 flex-1">{t.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeThread(t.id);
                      }}
                      className="invisible grid h-6 w-6 place-items-center rounded text-muted-foreground hover:text-destructive group-hover:visible"
                      aria-label="delete"
                    >
                      <Trash size={12} />
                    </button>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Conversation pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          {activeId ? (
            <ThreadView
              key={activeId}
              threadId={activeId}
              mode={mode}
              setMode={setMode}
              onOpenPlan={(id) => nav({ to: "/plans/$id", params: { id } })}
            />
          ) : (
            <EmptyState onStart={newThread} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="glass page-enter max-w-md rounded-3xl p-10 text-center">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-foreground text-background">
          <Sparkle weight="fill" size={18} />
        </div>
        <h1 className="text-2xl tracking-tight">Say Hello to Kora</h1>
        <p className="mt-2 font-serif-italic text-[15px] text-muted-foreground">
          A quiet co-pilot — chat freely, or hand her something heavy.
        </p>
        <button
          onClick={onStart}
          className="btn-primary mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px]"
        >
          <Plus weight="bold" size={14} /> Start a Conversation
        </button>
      </div>
    </div>
  );
}

function ThreadView({
  threadId,
  mode,
  setMode,
  onOpenPlan,
}: {
  threadId: string;
  mode: Mode;
  setMode: (m: Mode) => void;
  onOpenPlan: (id: string) => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getThread);
  const sendFn = useServerFn(sendChatMessage);
  const uploadFn = useServerFn(createSignedUpload);

  const threadQ = useQuery({
    queryKey: ["chat-thread", threadId],
    queryFn: () => getFn({ data: { id: threadId } }),
    refetchInterval: (q) => {
      const d: any = q.state.data;
      const hasOpenPlan = d?.messages?.some(
        (m: any) => m.role === "agent" && m.plan_id,
      );
      return hasOpenPlan ? 800 : false;
    },
  });

  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [threadQ.data?.messages?.length, streaming]);

  function stopStream() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(null);
    setSending(false);
  }

  async function uploadFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("file too big (max 8mb)");
      return;
    }
    try {
      const sig = await uploadFn({
        data: { filename: file.name, content_type: file.type || "application/octet-stream" },
      });
      const put = await fetch(sig.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`upload ${put.status}`);
      if (!sig.public_url) throw new Error("no signed url");
      setAttachments((a) => [
        ...a,
        {
          url: sig.public_url!,
          kind: file.type.startsWith("image/") ? "image" : "file",
          name: file.name,
        },
      ]);
    } catch (e: any) {
      toast.error(e.message ?? "upload failed");
    }
  }

  // Slash-command parser. /cmd arg
  const SLASH = /^\/(remember|focus|think|image)\s+(.+)$/is;

  async function runSlash(cmd: "remember" | "focus" | "think" | "image", arg: string) {
    setSending(true);
    const cmdFn = runChatCommand;
    const toastId = toast.loading(
      cmd === "image"
        ? "generating image…"
        : cmd === "think"
          ? "planning…"
          : `/${cmd}…`,
    );
    try {
      const res = await cmdFn({ data: { thread_id: threadId, command: cmd, arg } });
      toast.dismiss(toastId);
      if ((res as any)?.ok === false) toast.error((res as any).error ?? "command failed");
      else toast.success(`/${cmd} done`);
    } catch (e: any) {
      toast.dismiss(toastId);
      toast.error(e?.message ?? "command failed");
    } finally {
      setSending(false);
      qc.invalidateQueries({ queryKey: ["chat-thread", threadId] });
      qc.invalidateQueries({ queryKey: ["chat-threads"] });
    }
  }

  async function streamReply(text: string, sentAttachments: Attachment[]) {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("not signed in");
    setStreaming("");
    const ac = new AbortController();
    abortRef.current = ac;
    const res = await fetch("/api/public/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ thread_id: threadId, text, attachments: sentAttachments }),
      signal: ac.signal,
    });
    if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
    qc.invalidateQueries({ queryKey: ["chat-thread", threadId] });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let acc = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const chunk of parts) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const j = JSON.parse(line.slice(5).trim());
            if (j.type === "delta") {
              acc += j.text;
              setStreaming(acc);
            } else if (j.type === "done") {
              qc.invalidateQueries({ queryKey: ["chat-thread", threadId] });
              qc.invalidateQueries({ queryKey: ["chat-threads"] });
            } else if (j.type === "error") {
              toast.error(j.message);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") throw err;
    } finally {
      abortRef.current = null;
      setStreaming(null);
    }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    const sentAttachments = attachments;
    setDraft("");
    setAttachments([]);

    // Slash command path
    const slash = text.match(SLASH);
    if (slash) {
      await runSlash(slash[1].toLowerCase() as any, slash[2].trim());
      return;
    }

    setSending(true);
    try {
      if (mode === "thinking") {
        await sendFn({ data: { thread_id: threadId, text, attachments: sentAttachments, mode } });
        qc.invalidateQueries({ queryKey: ["chat-thread", threadId] });
        qc.invalidateQueries({ queryKey: ["chat-threads"] });
      } else {
        await streamReply(text, sentAttachments);
      }
    } catch (err: any) {
      toast.error(err.message ?? "send failed");
    } finally {
      setSending(false);
    }
  }

  async function regenerate(messageId: string) {
    // find the user message immediately preceding the assistant message
    const msgs = (threadQ.data?.messages ?? []) as any[];
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx < 1) return;
    const prevUser = [...msgs.slice(0, idx)].reverse().find((m) => m.role === "user");
    if (!prevUser) return;
    try {
      await regenerateLastReply({ data: { thread_id: threadId, message_id: messageId } });
      await qc.invalidateQueries({ queryKey: ["chat-thread", threadId] });
      setSending(true);
      await streamReply(prevUser.content, (prevUser.attachments as Attachment[]) ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "regen failed");
    } finally {
      setSending(false);
    }
  }

  const messages = threadQ.data?.messages ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-3 flex items-baseline gap-3 px-1">
        <h1 className="line-clamp-1 text-xl tracking-tight">
          {threadQ.data?.thread.title ?? "…"}
        </h1>
        <span className="font-serif-italic text-[13px] text-muted-foreground">
          {mode === "thinking" ? "deep thinking" : "fluid chat"}
        </span>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto pb-40 pr-1">
        <div className="flex flex-col gap-5">
          {messages.length === 0 && !streaming && (
            <p className="mt-12 text-center font-serif-italic text-[15px] text-muted-foreground">
              tell kora what's on your mind…
            </p>
          )}
          {messages.map((m: any) =>
            m.role === "user" ? (
              <UserBubble key={m.id} text={m.content} attachments={m.attachments ?? []} />
            ) : m.role === "agent" ? (
              <AgentTraceBubble key={m.id} planId={m.plan_id} onOpen={onOpenPlan} />
            ) : (
              <AssistantBubble key={m.id} text={m.content} />
            ),
          )}
          {streaming !== null && (
            <AssistantBubble text={streaming} streaming />
          )}
          {sending && mode === "thinking" && !messages.some((m: any) => m.role === "agent") && (
            <Thinking label="reading your intent" />
          )}
        </div>
      </div>

      {/* Composer */}
      <form
        onSubmit={send}
        className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-6"
      >
        <div className="pointer-events-auto mx-auto max-w-3xl">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <div
                  key={i}
                  className="glass-soft group relative flex items-center gap-2 rounded-lg px-2 py-1 text-[12px]"
                >
                  {a.kind === "image" ? (
                    <img src={a.url} alt={a.name} className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <ImageIcon size={14} />
                  )}
                  <span className="max-w-[140px] truncate">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="glass flex items-end gap-2 rounded-2xl p-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="btn-ghost grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              aria-label="attach"
              title="attach image"
            >
              <ImageIcon size={18} />
            </button>
            <ModeToggle mode={mode} setMode={setMode} />
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
              placeholder={
                mode === "thinking"
                  ? "give kora a task to plan and execute…"
                  : "ask kora anything…"
              }
              className="max-h-48 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <button
              disabled={sending || !draft.trim()}
              className="btn-primary grid h-10 w-10 place-items-center rounded-xl disabled:opacity-30"
              aria-label="send"
            >
              <ArrowUp weight="bold" size={18} />
            </button>
          </div>
          <p className="mt-2 text-center font-mono-tight text-[11px] text-muted-foreground">
            enter to send · shift+enter for newline · {mode === "thinking" ? "agent will plan + run" : "fluid streaming reply"}
          </p>
        </div>
      </form>
    </div>
  );
}

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="glass-soft flex items-center rounded-full p-0.5 text-[11px]">
      <button
        type="button"
        onClick={() => setMode("chat")}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
          mode === "chat" ? "bg-foreground text-background" : "text-muted-foreground"
        }`}
      >
        <ChatCircleDots size={11} weight={mode === "chat" ? "fill" : "regular"} />
        chat
      </button>
      <button
        type="button"
        onClick={() => setMode("thinking")}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition ${
          mode === "thinking" ? "bg-foreground text-background" : "text-muted-foreground"
        }`}
      >
        <Brain size={11} weight={mode === "thinking" ? "fill" : "regular"} />
        think
      </button>
    </div>
  );
}

function UserBubble({ text, attachments }: { text: string; attachments: Attachment[] }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] space-y-2">
        {attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {attachments.map((a, i) =>
              a.kind === "image" ? (
                <img
                  key={i}
                  src={a.url}
                  alt={a.name}
                  className="max-h-48 rounded-2xl border border-border object-cover shadow-soft"
                />
              ) : (
                <span key={i} className="rounded-lg bg-foreground/10 px-2 py-1 text-[12px]">
                  {a.name}
                </span>
              ),
            )}
          </div>
        )}
        {text && (
          <div className="rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-[15px] text-background shadow-soft">
            {text}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantBubble({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-background">
        <Sparkle weight="fill" size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="glass-soft rounded-2xl rounded-tl-md px-4 py-3 text-[15px]">
          {text ? (
            <div className="md-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            </div>
          ) : (
            <span className="thinking-text text-[14px]">thinking</span>
          )}
          {streaming && text && (
            <span className="ml-0.5 inline-block h-3.5 w-1 translate-y-0.5 animate-pulse bg-primary" />
          )}
        </div>
      </div>
    </div>
  );
}

function AgentTraceBubble({
  planId,
  onOpen,
}: {
  planId: string | null;
  onOpen: (id: string) => void;
}) {
  const getPlanFn = useServerFn(getPlan);
  const { data } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => getPlanFn({ data: { id: planId! } }),
    enabled: !!planId,
    refetchInterval: (q) => {
      const d: any = q.state.data;
      if (!d?.plan) return 1500;
      return d.plan.status === "running" || d.plan.status === "pending" ? 1500 : false;
    },
  });

  if (!planId) return null;
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
    <div className="flex gap-3">
      <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-background">
        <Brain weight="fill" size={14} />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
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
    </div>
  );
}

function Thinking({ label }: { label: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-background">
        <Brain weight="fill" size={14} />
      </div>
      <div className="glass-soft inline-flex items-center gap-3 rounded-2xl rounded-tl-md px-4 py-3">
        <span className="thinking-text text-[14px]">{label}</span>
        <span className="ml-1 inline-flex gap-1 text-primary">
          <span className="think-dot" />
          <span className="think-dot" />
          <span className="think-dot" />
        </span>
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
      <span className="relative mt-0.5 inline-flex h-5 w-5 items-center justify-center">
        <span className="absolute h-2 w-2 animate-ping rounded-full bg-primary" />
        <span className="h-2 w-2 rounded-full bg-primary" />
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
