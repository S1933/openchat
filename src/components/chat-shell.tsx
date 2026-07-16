"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Globe, Menu, Pin, PinOff, Plus, RefreshCw, Search, Send, Settings, Sparkles, Square, Star, Trash2, X } from "lucide-react";
import { MarkdownMessage } from "@/components/markdown-message";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  title: string;
  selectedModel: string | null;
  updatedAt: string;
  pinned: boolean;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  model?: string | null;
  webSearch?: boolean;
};

type Model = {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  free: boolean;
  favorite: boolean;
};

export function ChatShell({ email }: { email: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const sortedModels = useMemo(
    () => [...models].sort((a, b) => Number(b.favorite) - Number(a.favorite)),
    [models]
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [modelHighlight, setModelHighlight] = useState(0);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const filteredConversations = useMemo(
    () => conversations.filter((conversation) => conversation.title.toLowerCase().includes(query.toLowerCase())),
    [conversations, query]
  );
  const sortedSidebar = useMemo(
    () => [...filteredConversations].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    }),
    [filteredConversations]
  );
  const pinnedConversations = useMemo(() => sortedSidebar.filter((c) => c.pinned), [sortedSidebar]);
  const otherConversations = useMemo(() => sortedSidebar.filter((c) => !c.pinned), [sortedSidebar]);
  const modelSheetRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeConversation = conversations.find((conversation) => conversation.id === conversationId);
  const activeModel = models.find((model) => model.id === selectedModel);
  const needsOnboarding = !hasApiKey || models.length === 0;

  const bootstrap = useCallback(async () => {
    const [settingsRes, modelsRes, conversationsRes] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/models"),
      fetch("/api/conversations")
    ]);
    if (settingsRes.ok) {
      const settings = (await settingsRes.json()) as { hasApiKey: boolean; defaultModel: string | null };
      setHasApiKey(settings.hasApiKey);
      if (settings.defaultModel) setSelectedModel(settings.defaultModel);
    }
    if (modelsRes.ok) {
      const data = (await modelsRes.json()) as { models: Model[] };
      setModels(data.models);
      setSelectedModel((prev) => prev || data.models[0]?.id || "");
    }
    if (conversationsRes.ok) {
      const data = (await conversationsRes.json()) as { conversations: Conversation[] };
      setConversations(data.conversations);
      const first = data.conversations[0];
      if (first) {
        setConversationId((prev) => prev ?? first.id);
        const messagesRes = await fetch(`/api/conversations/${first.id}/messages`);
        if (messagesRes.ok) {
          const messagesData = (await messagesRes.json()) as { messages: Message[] };
          setMessages((prev) => (prev.length ? prev : messagesData.messages));
        }
      }
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Track viewport size: mobile (<768px) gets Enter-as-newline, desktop
  // keeps Enter-to-submit. Mobile keyboards + autocorrect make accidental
  // Enter submits too common; on mobile the user has the Send button.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  // Auto-grow the textarea to fit its content (typed or dictated), capped at max-h-36
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [input]);

  function handleMessagesScroll() {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 48;
  }

  useEffect(() => {
    if (stickToBottomRef.current) {
      // "auto" instead of "smooth" — smooth-scroll animations are 200-400ms each
      // and never finish during streaming because the next token triggers a new one.
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, streaming]);

  // Focus the textarea on app load (whenever the chat UI is mounted, not onboarding).
  // Belt-and-suspenders with `autoFocus` on the textarea itself: autoFocus fires
  // when React first mounts the element, this re-asserts focus on the next
  // animation frame in case a browser blocked the initial programmatic call
  // (common after a NextAuth redirect).
  useEffect(() => {
    if (needsOnboarding) return;
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [needsOnboarding]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setModelSheetOpen((open) => !open);
      } else if ((event.metaKey || event.ctrlKey) && event.key === "n" && !event.shiftKey) {
        event.preventDefault();
        void createConversation();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const modelHighlightRef = useRef(0);
  useEffect(() => {
    modelHighlightRef.current = modelHighlight;
  }, [modelHighlight]);

  // Edge-swipe gesture: from the left edge of the screen, swipe right to open the sidebar.
  // Mirrors the iOS native "back swipe" affordance on mobile.
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  function handleTouchStart(event: React.TouchEvent) {
    if (drawerOpen) return;
    const touch = event.touches[0];
    if (!touch || touch.clientX > 30) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }
  function handleTouchMove(event: React.TouchEvent) {
    if (drawerOpen) return;
    const start = swipeStartRef.current;
    if (!start) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Trigger only on a predominantly horizontal, right-ward swipe past threshold
    if (dx > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipeStartRef.current = null;
      setDrawerOpen(true);
    }
  }
  function handleTouchEnd() {
    swipeStartRef.current = null;
  }

  useEffect(() => {
    if (!modelSheetOpen) return;
    setModelHighlight(0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setModelHighlight((index) => Math.min(index + 1, sortedModels.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setModelHighlight((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const current = modelHighlightRef.current;
        const id = sortedModels[current]?.id;
        if (id !== undefined) selectModel(id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setModelSheetOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modelSheetOpen, sortedModels]);

  useEffect(() => {
    modelSheetRef.current?.scrollIntoView({ block: "nearest" });
  }, [modelHighlight]);

  async function saveApiKey() {
    setError("");
    if (!apiKey.trim()) {
      setError("Cle API requise.");
      return;
    }
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, defaultModel: selectedModel || undefined })
    });
    await syncModels();
    setHasApiKey(true);
    setApiKey("");
    setSettingsOpen(false);
  }

  async function syncModels() {
    setError("");
    const res = await fetch("/api/models/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "go" })
    });
    if (!res.ok) {
      setError("Synchronisation impossible.");
      return;
    }
    const modelsRes = await fetch("/api/models");
    const data = (await modelsRes.json()) as { models: Model[] };
    setModels(data.models);
    if (!selectedModel && data.models[0]) setSelectedModel(data.models[0].id);
  }

  async function createConversation() {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New chat", selectedModel: selectedModel || undefined })
    });
    const data = (await res.json()) as { conversation: Conversation };
    setConversations((prev) => [data.conversation, ...prev]);
    setConversationId(data.conversation.id);
    setMessages([]);
    setDrawerOpen(false);
  }

  async function openConversation(id: string) {
    setConversationId(id);
    setDrawerOpen(false);
    await refreshMessages(id);
    const conversation = conversations.find((item) => item.id === id);
    if (conversation?.selectedModel) setSelectedModel(conversation.selectedModel);
  }

  async function refreshMessages(id: string) {
    const res = await fetch(`/api/conversations/${id}/messages`);
    if (res.ok) {
      const data = (await res.json()) as { messages: Message[] };
      setMessages(data.messages);
    }
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((item) => item.id !== id));
    if (conversationId === id) {
      setConversationId(null);
      setMessages([]);
    }
  }

  function startRename(conversation: Conversation) {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  }

  function cancelRename() {
    setEditingId(null);
    setEditTitle("");
  }

  function selectModel(id: string) {
    setSelectedModel(id);
    setModelSheetOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function toggleFavorite(modelId: string) {
    // Optimistic update: flip locally first, then sync to server
    let nextValue = false;
    setModels((prev) =>
      prev.map((model) => {
        if (model.id !== modelId) return model;
        nextValue = !model.favorite;
        return { ...model, favorite: nextValue };
      })
    );
    try {
      await fetch("/api/models/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId })
      });
    } catch (err) {
      console.error("toggleFavorite failed", err);
    }
  }

  async function commitRename(id: string) {
    const title = editTitle.trim();
    setEditingId(null);
    setEditTitle("");
    if (!title) return;
    setConversations((prev) => prev.map((item) => (item.id === id ? { ...item, title } : item)));
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
  }

  async function togglePin(id: string) {
    const target = conversations.find((item) => item.id === id);
    if (!target) return;
    const pinned = !target.pinned;
    setConversations((prev) => prev.map((item) => (item.id === id ? { ...item, pinned } : item)));
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned })
    });
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!input.trim() || streaming) return;
    const useWebSearch = webSearchEnabled;
    setWebSearchEnabled(false);
    let id = conversationId;
    if (!id) {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: input.slice(0, 60), selectedModel })
      });
      const data = (await res.json()) as { conversation: Conversation };
      id = data.conversation.id;
      setConversationId(id);
      setConversations((prev) => [data.conversation, ...prev]);
    }

    const text = input.trim();
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text, model: selectedModel, webSearch: useWebSearch },
      { id: "streaming", role: "assistant", content: "", model: selectedModel }
    ]);
    setStreaming(true);
    setError("");
    // User just submitted: they want to see the response, override the
    // "respect prior scroll position" behavior. Reset stick-to-bottom so
    // the existing useEffect scrolls, and force one more scroll on the
    // next frame to win against the keyboard pop on mobile.
    stickToBottomRef.current = true;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
    abortRef.current = new AbortController();

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: id, model: selectedModel, message: text, webSearch: useWebSearch }),
      signal: abortRef.current.signal
    });

    if (!res.ok || !res.body) {
      setStreaming(false);
      setError("Envoi impossible.");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith("data:")) continue;
        const payload = JSON.parse(line.slice(5)) as { token?: string; thinking?: string; done?: boolean; error?: string };
        if (payload.thinking) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === "streaming" ? { ...message, thinking: (message.thinking ?? "") + payload.thinking } : message
            )
          );
        }
        if (payload.token) {
          setMessages((prev) =>
            prev.map((message) => {
              if (message.id !== "streaming") return message;
              const merged = message.content + payload.token;
              const thinkMatch = merged.match(/<think>([\s\S]*?)(<\/think>|$)/);
              if (!thinkMatch) return { ...message, content: merged };
              const extracted = thinkMatch[1];
              const rest = merged.slice(thinkMatch[0].length).replace(/^<\/think>\s*/, "");
              return {
                ...message,
                thinking: (message.thinking ?? "") + extracted,
                content: rest
              };
            })
          );
        }
        if (payload.error) setError(payload.error);
      }
    }
    setStreaming(false);
    abortRef.current = null;
    // Fire-and-forget: server already persisted the assistant message in its
    // post-stream background task. We hold the full text locally, so the
    // refetch is unnecessary latency before the user can send the next message.
    void refreshMessages(id);
  }

  function stopStreaming() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  const mainTitle = useMemo(() => activeConversation?.title ?? "New chat", [activeConversation]);

  function renderConversation(conversation: Conversation) {
    return (
      <div
        key={conversation.id}
        className={cn(
          "group mb-1 flex items-center gap-1 rounded-md px-2 py-2 text-sm",
          conversation.id === conversationId ? "bg-muted" : "hover:bg-muted"
        )}
      >
        <button
          className="h-7 w-7 shrink-0 rounded-md opacity-60 hover:bg-white"
          title={conversation.pinned ? "Desepingler" : "Epingler"}
          onClick={() => togglePin(conversation.id)}
        >
          {conversation.pinned ? (
            <Pin className="mx-auto" size={14} />
          ) : (
            <PinOff className="mx-auto" size={14} />
          )}
        </button>
        {editingId === conversation.id ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            onBlur={() => commitRename(conversation.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitRename(conversation.id);
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelRename();
              }
            }}
            onClick={(event) => event.stopPropagation()}
            className="min-w-0 flex-1 rounded-sm bg-white px-1 text-sm outline-none ring-1 ring-primary"
            maxLength={80}
          />
        ) : (
          <button
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => openConversation(conversation.id)}
            onDoubleClick={(event) => {
              event.preventDefault();
              startRename(conversation);
            }}
          >
            {conversation.title}
          </button>
        )}
        <button
          className="h-7 w-7 shrink-0 rounded-md opacity-60 hover:bg-white"
          title="Supprimer"
          onClick={() => deleteConversation(conversation.id)}
        >
          <Trash2 className="mx-auto" size={14} />
        </button>
      </div>
    );
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-[80%] border-r border-border bg-white shadow-xl transition-transform lg:static lg:w-80 lg:translate-x-0 lg:shadow-none",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-3">
          <span className="font-semibold">OpenChat</span>
          <button className="h-10 w-10 rounded-md lg:hidden" onClick={() => setDrawerOpen(false)} title="Fermer">
            <X className="mx-auto" size={20} />
          </button>
        </div>
        <div className="p-3">
          <button
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 font-medium text-primary-foreground"
            onClick={createConversation}
          >
            <Plus size={18} /> Nouveau chat
          </button>
          <div className="mt-3 flex h-10 items-center gap-2 rounded-md border border-border px-3">
            <Search size={16} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Rechercher"
            />
          </div>
        </div>
        <div className="h-[calc(100dvh-12rem)] overflow-y-auto px-2">
          <>
            {pinnedConversations.length > 0 ? (
              <>
                <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Epingles</p>
                {pinnedConversations.map((conversation) => renderConversation(conversation))}
              </>
            ) : null}
            {pinnedConversations.length > 0 && otherConversations.length > 0 ? (
              <p className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recents</p>
            ) : null}
            {otherConversations.map((conversation) => renderConversation(conversation))}
          </>
        </div>
        <div className="border-t border-border p-3">
          <button className="flex h-11 w-full items-center gap-2 rounded-md px-2 text-sm" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} /> Parametres
          </button>
          <p className="truncate px-2 text-xs text-muted-foreground">{email}</p>
        </div>
      </aside>

      {drawerOpen ? <div className="fixed inset-0 z-20 lg:hidden" onClick={() => setDrawerOpen(false)} /> : null}

      <section
        className="flex min-w-0 flex-1 flex-col"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {needsOnboarding ? (
          <Onboarding apiKey={apiKey} setApiKey={setApiKey} saveApiKey={saveApiKey} error={error} />
        ) : (
          <>
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-white px-2 lg:hidden">
              <button
                className="h-10 w-10 shrink-0 rounded-md hover:bg-muted"
                onClick={() => setDrawerOpen(true)}
                title="Ouvrir le menu"
                aria-label="Ouvrir le menu"
              >
                <Menu className="mx-auto" size={20} />
              </button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">{mainTitle}</span>
              <button
                className="h-10 w-10 shrink-0 rounded-md hover:bg-muted"
                onClick={createConversation}
                title="Nouveau chat"
                aria-label="Nouveau chat"
              >
                <Plus className="mx-auto" size={20} />
              </button>
            </div>
            <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-3 py-4">
              {messages.length === 0 ? (
                <div className="mx-auto flex h-full max-w-md flex-col justify-center text-center">
                  <h2 className="text-2xl font-semibold">Comment puis-je aider ?</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Choisis un modele, envoie un message, puis reprends le chat ici.</p>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-4">
                  {messages.map((message) => {
                    const isStreaming = message.id === "streaming";
                    return (
                    <article
                      key={message.id}
                      className={cn(
                        "rounded-lg px-3 py-3 text-sm leading-6",
                        message.role === "user" ? "ml-auto max-w-[88%] bg-primary text-primary-foreground" : "bg-white"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          {message.webSearch ? (
                            <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                              <Globe size={11} />
                              Web search
                            </div>
                          ) : null}
                          {isStreaming ? (
                            // Plain text during streaming: avoids re-parsing the
                            // entire growing markdown string on every token.
                            <pre className="m-0 whitespace-pre-wrap font-sans">
                              {message.content || "\u00a0"}
                            </pre>
                          ) : (
                            <MarkdownMessage content={message.content} />
                          )}
                        </div>
                        {message.content && !isStreaming ? (
                          <button
                            title="Copier"
                            className="h-8 w-8 shrink-0 rounded-md opacity-70 hover:bg-muted"
                            onClick={() => navigator.clipboard.writeText(message.content)}
                          >
                            <Copy className="mx-auto" size={15} />
                          </button>
                        ) : null}
                      </div>
                    </article>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>
            <form ref={formRef} className="border-t border-border bg-white p-2" onSubmit={sendMessage}>
              {error ? <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
              <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-lg border-0 bg-white p-2 lg:border lg:border-border">
                <button
                  type="button"
                  onClick={() => setModelSheetOpen(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted"
                  title="Choisir un modele"
                >
                  <Sparkles size={14} className="shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => setWebSearchEnabled((value) => !value)}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
                    webSearchEnabled ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}
                  title={webSearchEnabled ? "Desactiver la recherche web" : "Activer la recherche web"}
                  aria-label="Recherche web"
                  aria-pressed={webSearchEnabled}
                >
                  <Globe size={16} className="shrink-0" />
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    // On mobile, Enter inserts a newline (default behavior).
                    // On desktop, Enter submits; Shift+Enter still inserts a newline.
                    if (isMobile) return;
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  rows={1}
                  autoFocus
                  className="max-h-36 min-h-10 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 outline-none"
                  placeholder="Message OpenChat…"
                  title="⏎ pour envoyer · ⇧⏎ saut de ligne"
                />
                {streaming ? (
                  <button type="button" className="h-10 w-10 rounded-md bg-muted" onClick={stopStreaming} title="Stop">
                    <Square className="mx-auto" size={17} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() || !selectedModel}
                    className="h-10 w-10 rounded-md bg-primary text-primary-foreground disabled:opacity-40"
                    title="Envoyer"
                    aria-label="Envoyer"
                  >
                    <Send className="mx-auto" size={17} />
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </section>

      {modelSheetOpen ? (
        <Sheet title="Modeles" onClose={() => setModelSheetOpen(false)}>
          {sortedModels.map((model, index) => {
            const highlight = modelHighlight === index;
            return (
              <div
                key={model.id}
                ref={highlight ? modelSheetRef : null}
                className={cn(
                  "mb-2 flex min-h-12 w-full items-center justify-between rounded-md border border-border px-3 text-left",
                  highlight && "ring-2 ring-primary"
                )}
                onMouseEnter={() => setModelHighlight(index)}
              >
                <button
                  className="min-w-0 flex-1 py-3 text-left"
                  onClick={() => selectModel(model.id)}
                >
                  <span className="block font-medium">{model.displayName}</span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggleFavorite(model.id);
                  }}
                  className="ml-2 h-9 w-9 shrink-0 rounded-md hover:bg-muted"
                  title={model.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                  aria-label={model.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                  aria-pressed={model.favorite}
                >
                  <Star
                    size={17}
                    className={cn("mx-auto", model.favorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")}
                  />
                </button>
                <Check size={17} className={cn("ml-1 shrink-0", selectedModel === model.id ? "opacity-100" : "opacity-0")} />
              </div>
            );
          })}
        </Sheet>
      ) : null}

      {settingsOpen ? (
        <Sheet title="Parametres" onClose={() => setSettingsOpen(false)}>
          <label className="text-sm font-medium">Cle API</label>
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            type="password"
            className="mt-2 h-11 w-full rounded-md border border-border px-3 outline-none focus:ring-2 focus:ring-primary"
            placeholder="sk-..."
          />
          <button className="mt-3 h-11 w-full rounded-md bg-primary font-medium text-primary-foreground" onClick={saveApiKey}>
            Tester et enregistrer
          </button>
          <button className="mt-2 h-11 w-full rounded-md border border-border font-medium" onClick={syncModels}>
            Synchroniser les modeles
          </button>
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        </Sheet>
      ) : null}
    </main>
  );
}

function Onboarding({
  apiKey,
  setApiKey,
  saveApiKey,
  error
}: {
  apiKey: string;
  setApiKey: (value: string) => void;
  saveApiKey: () => void;
  error: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-5">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-primary">Premier lancement</p>
        <h2 className="mt-2 text-2xl font-semibold">Ajoute ta cle API</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Elle reste chiffree cote serveur et sert a utiliser tes modeles preferes.
        </p>
        <input
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          type="password"
          className="mt-5 h-11 w-full rounded-md border border-border px-3 outline-none focus:ring-2 focus:ring-primary"
          placeholder="Cle API"
        />
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <button className="mt-4 h-11 w-full rounded-md bg-primary font-medium text-primary-foreground" onClick={saveApiKey}>
          Valider et synchroniser
        </button>
      </div>
    </div>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-lg bg-white p-4 shadow-xl sm:left-auto sm:right-4 sm:top-16 sm:w-96 sm:rounded-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button className="h-10 w-10 rounded-md" onClick={onClose} title="Fermer">
            <X className="mx-auto" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
