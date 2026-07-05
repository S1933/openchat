"use client";

import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Highlight, themes } from "prism-react-renderer";
import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react";

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

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
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
        p({ children }) {
          return <p className="mb-3 last:mb-0">{children}</p>;
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
