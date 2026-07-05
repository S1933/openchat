"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Menu, Pin, PinOff, Plus, RefreshCw, Search, Send, Settings, Sparkles, Square, Trash2, X } from "lucide-react";
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
};

type Model = {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  free: boolean;
};

export function ChatShell({ email }: { email: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<Model[]>([]);
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
  const modelSheetRef = useRef<HTMLButtonElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeConversation = conversations.find((conversation) => conversation.id === conversationId);
  const activeModel = models.find((model) => model.id === selectedModel);
  const filteredConversations = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(query.toLowerCase())
  );
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

  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  function handleMessagesScroll() {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 48;
  }

  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, streaming]);

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

  useEffect(() => {
    if (!modelSheetOpen) return;
    setModelHighlight(0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setModelHighlight((index) => Math.min(index + 1, models.length));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setModelHighlight((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const current = modelHighlightRef.current;
        const id = current === 0 ? (models[0]?.id ?? "") : models[current - 1]?.id;
        if (id !== undefined) selectModel(id);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setModelSheetOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modelSheetOpen, models]);

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

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || streaming) return;
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
      { id: crypto.randomUUID(), role: "user", content: text, model: selectedModel },
      { id: "streaming", role: "assistant", content: "", model: selectedModel }
    ]);
    setStreaming(true);
    setError("");
    abortRef.current = new AbortController();

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: id, model: selectedModel, message: text }),
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
    await refreshMessages(id);
    await bootstrap();
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
          "fixed inset-y-0 left-0 z-30 w-[min(84vw,320px)] border-r border-border bg-white transition-transform lg:static lg:translate-x-0",
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
          {(() => {
            const sorted = [...filteredConversations].sort((a, b) => {
              if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
              return a.updatedAt < b.updatedAt ? 1 : -1;
            });
            const pinned = sorted.filter((c) => c.pinned);
            const others = sorted.filter((c) => !c.pinned);
            return (
              <>
                {pinned.length > 0 ? (
                  <>
                    <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Epingles</p>
                    {pinned.map((conversation) => renderConversation(conversation))}
                  </>
                ) : null}
                {pinned.length > 0 && others.length > 0 ? (
                  <p className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recents</p>
                ) : null}
                {others.map((conversation) => renderConversation(conversation))}
              </>
            );
          })()}
        </div>
        <div className="border-t border-border p-3">
          <button className="flex h-11 w-full items-center gap-2 rounded-md px-2 text-sm" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} /> Parametres
          </button>
          <p className="truncate px-2 text-xs text-muted-foreground">{email}</p>
        </div>
      </aside>

      {drawerOpen ? <div className="fixed inset-0 z-20 bg-black/25 lg:hidden" onClick={() => setDrawerOpen(false)} /> : null}

      <section className="flex min-w-0 flex-1 flex-col">
        {needsOnboarding ? (
          <Onboarding apiKey={apiKey} setApiKey={setApiKey} saveApiKey={saveApiKey} error={error} />
        ) : (
          <>
            <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-3 py-4">
              {messages.length === 0 ? (
                <div className="mx-auto flex h-full max-w-md flex-col justify-center text-center">
                  <h2 className="text-2xl font-semibold">Comment puis-je aider ?</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Choisis un modele, envoie un message, puis reprends le chat ici.</p>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-4">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={cn(
                        "rounded-lg px-3 py-3 text-sm leading-6",
                        message.role === "user" ? "ml-auto max-w-[88%] bg-primary text-primary-foreground" : "bg-white"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <MarkdownMessage content={message.content || (message.id === "streaming" ? "..." : "")} />
                        </div>
                        {message.content ? (
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
                  ))}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>
            <form ref={formRef} className="border-t border-border bg-white p-2" onSubmit={sendMessage}>
              {error ? <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
              <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-lg border border-border bg-white p-2">
                <button
                  type="button"
                  onClick={() => setModelSheetOpen(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted"
                  title="Choisir un modele"
                >
                  <Sparkles size={14} className="shrink-0" />
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                  rows={1}
                  className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none"
                  placeholder="Message OpenChat (⏎ pour envoyer, ⇧⏎ saut de ligne)"
                />
                {streaming ? (
                  <button type="button" className="h-10 w-10 rounded-md bg-muted" onClick={stopStreaming} title="Stop">
                    <Square className="mx-auto" size={17} />
                  </button>
                ) : (
                  <button disabled={!input.trim() || !selectedModel} className="h-10 w-10 rounded-md bg-primary text-primary-foreground disabled:opacity-40" title="Envoyer">
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
          <button
            ref={modelHighlight === 0 ? modelSheetRef : null}
            className={cn(
              "mb-2 flex h-12 w-full items-center justify-between rounded-md border border-border px-3",
              modelHighlight === 0 && "ring-2 ring-primary"
            )}
            onClick={() => {
              const first = models[0]?.id ?? "";
              if (first) selectModel(first);
              else setModelSheetOpen(false);
            }}
            onMouseEnter={() => setModelHighlight(0)}
          >
            Auto <Check size={17} className={selectedModel === models[0]?.id ? "opacity-100" : "opacity-0"} />
          </button>
          {models.map((model, index) => {
            const highlight = modelHighlight === index + 1;
            return (
              <button
                key={model.id}
                ref={highlight ? modelSheetRef : null}
                className={cn(
                  "mb-2 flex min-h-12 w-full items-center justify-between rounded-md border border-border px-3 text-left",
                  highlight && "ring-2 ring-primary"
                )}
                onClick={() => selectModel(model.id)}
                onMouseEnter={() => setModelHighlight(index + 1)}
              >
                <span>
                  <span className="block font-medium">{model.displayName}</span>
                </span>
                <Check size={17} className={selectedModel === model.id ? "opacity-100" : "opacity-0"} />
              </button>
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
