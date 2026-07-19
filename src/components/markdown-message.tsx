"use client";

import { isValidElement, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Highlight, themes } from "prism-react-renderer";
import { Check, ChevronDown, ChevronRight, Copy, Eye } from "lucide-react";

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    const props = (node as { props: { children?: ReactNode } }).props;
    return extractText(props.children);
  }
  return "";
}

function normalizeLang(lang: string): string {
  const aliases: Record<string, string> = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    yml: "yaml",
    md: "markdown",
    "c++": "cpp",
    "c#": "csharp"
  };
  const lower = lang.toLowerCase();
  return aliases[lower] ?? lower;
}

function CodeBlock({ text, lang }: { text: string; lang: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lineCount = text === "" ? 0 : text.split("\n").length;
  const previewLines = text.split("\n").slice(0, 2).join("\n");
  const id = `code-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div className="my-3 overflow-hidden rounded-md border border-border bg-slate-950 text-slate-50">
      <div className="flex h-9 items-center justify-between border-b border-slate-800 px-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-slate-800"
          title={expanded ? "Plier le code" : "Deplier le code"}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="font-mono uppercase tracking-wide text-slate-300">{lang}</span>
          <span className="text-slate-500">· {lineCount} ligne{lineCount > 1 ? "s" : ""}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-slate-800"
          title="Copier le code"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copie" : "Copier"}
        </button>
      </div>
      {expanded ? (
        <Highlight
          code={text}
          language={lang}
          theme={themes.vsDark}
        >
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={`${className} overflow-x-auto p-3 text-sm`} style={style}>
              {tokens.map((line, index) => (
                <div key={`${id}-${index}`} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      ) : (
        <pre className="overflow-hidden whitespace-pre p-3 text-sm text-slate-500">
          <code>{previewLines}{lineCount > 2 ? "\n…" : ""}</code>
        </pre>
      )}
    </div>
  );
}

// ----  think-block support -----------------------------------------------
//
// Some "thinking" models (DeepSeek R1, Qwen QwQ, …) emit their chain-of-thought
// inside... fence-off the reasoning from the final answer so the chat stays
// scannable: render each block as a collapsible "Réflexion du modèle" panel
// (collapsed by default, with chevron + character count). The pre-processor is
// run on every render — it's cheap (≤ a few KB of text) and avoids dragging in
// a remark plugin for a one-off syntax.

type Segment =
  | { type: "think"; text: string }
  | { type: "md"; text: string };

function splitThinking(content: string): Segment[] {
  const segments: Segment[] = [];
  // Non-greedy, multi-line. Multiple blocks per response are supported.
  // Built from a string to keep the source XML/markdown-clean: the literal
  // opening/closing tags would otherwise get stripped by some renderers.
  const THINK_RE = new RegExp("([\\s\\S]*?)<\\/think>", "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = THINK_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index);
      if (before.length > 0) segments.push({ type: "md", text: before });
    }
    const inner = match[1].trim();
    if (inner) segments.push({ type: "think", text: inner });
    lastIndex = THINK_RE.lastIndex;
  }
  if (lastIndex < content.length) {
    const after = content.slice(lastIndex);
    if (after.length > 0) segments.push({ type: "md", text: after });
  }
  return segments;
}

function ThinkBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // Long-press (≥500 ms without moving) reveals the reasoning. A short tap is
  // ignored entirely so the block stays out of the way until the user actually
  // wants it. Once revealed, a regular tap collapses it again.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Suppress the click event that fires immediately after the long-press timer
  // completes (mouseup → click is ~1 frame apart) so the just-expanded block
  // doesn't immediately collapse.
  const justExpandedRef = useRef(false);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function startPress() {
    if (expanded) return; // when already open, the click handler is the only path
    clearTimer();
    timerRef.current = setTimeout(() => {
      setExpanded(true);
      justExpandedRef.current = true;
      setTimeout(() => {
        justExpandedRef.current = false;
      }, 350);
      timerRef.current = null;
    }, 500);
  }

  function endPress() {
    // Timer still pending → press was shorter than 500 ms → abort, do nothing.
    if (timerRef.current !== null) clearTimer();
  }

  function handleClick() {
    if (expanded && !justExpandedRef.current) setExpanded(false);
  }

  return (
    <div className="my-3 overflow-hidden rounded-md border border-dashed border-border bg-muted/40 text-xs">
      <div
        role="button"
        tabIndex={0}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        onClick={handleClick}
        onKeyDown={(event) => {
          // Keyboard accessibility: only acts on close (Enter/Space on already-
          // expanded). Reveal is touch/mouse-only by design.
          if ((event.key === "Enter" || event.key === " ") && expanded) {
            event.preventDefault();
            setExpanded(false);
          }
        }}
        aria-expanded={expanded}
        aria-label={expanded ? "Masquer la réflexion" : "Maintenir pour révéler la réflexion"}
        className="flex h-9 w-full cursor-pointer select-none items-center gap-1.5 px-2 font-medium text-muted-foreground hover:bg-muted/60 active:bg-muted/80"
      >
        {expanded ? <ChevronDown size={14} /> : <Eye size={14} />}
        <span>{expanded ? "Réflexion du modèle" : "Maintenir pour révéler"}</span>
        <span className="ml-auto text-slate-400">{text.length} caractère{text.length > 1 ? "s" : ""}</span>
      </div>
      {expanded ? (
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words border-t border-dashed border-border bg-muted/20 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
          {text}
        </pre>
      ) : null}
    </div>
  );
}

const mdComponents = {
  pre({ children }: { children?: ReactNode }) {
    // children is a <code> element with className="language-xxx"
    let lang = "text";
    let text = "";
    if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
      const className = children.props.className ?? "";
      const match = /language-(\w+)/.exec(className);
      if (match) lang = normalizeLang(match[1]);
      text = extractText(children.props.children).replace(/\n$/, "");
    } else {
      text = extractText(children).replace(/\n$/, "");
    }
    if (!text) return <pre>{children}</pre>;
    return <CodeBlock text={text} lang={lang} />;
  },
  p({ children }: { children?: ReactNode }) {
    return <p className="mb-3 last:mb-0">{children}</p>;
  }
};

export function MarkdownMessage({ content }: { content: string }) {
  const segments = splitThinking(content);
  // Content with no thinking blocks: short-circuit straight to a single
  // ReactMarkdown to keep the empty-segment case trivial and avoid an extra
  // fragment wrapper when there's nothing to splice.
  if (segments.length === 0 || (segments.length === 1 && segments[0].type === "md")) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {segments.length === 0 ? content : segments[0].text}
      </ReactMarkdown>
    );
  }
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "think" ? (
          <ThinkBlock key={`think-${index}`} text={segment.text} />
        ) : (
          <ReactMarkdown
            key={`md-${index}`}
            remarkPlugins={[remarkGfm]}
            components={mdComponents}
          >
            {segment.text}
          </ReactMarkdown>
        )
      )}
    </>
  );
}
