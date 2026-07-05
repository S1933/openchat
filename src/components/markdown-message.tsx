"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

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

export function MarkdownMessage({ content }: { content: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
          const text = extractText(children).replace(/\n$/, "");
          const id = `code-${Math.random().toString(36).slice(2, 8)}`;
          return (
            <div className="my-3 overflow-hidden rounded-md border border-border bg-slate-950 text-slate-50">
              <div className="flex h-9 items-center justify-end border-b border-slate-800 px-2">
                <button
                  className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-slate-800"
                  title="Copier le code"
                  onClick={() => {
                    void navigator.clipboard.writeText(text).then(() => {
                      setCopied(id);
                      setTimeout(() => setCopied((current) => (current === id ? null : current)), 1500);
                    });
                  }}
                >
                  {copied === id ? <Check size={14} /> : <Copy size={14} />}
                  {copied === id ? "Copie" : "Copier"}
                </button>
              </div>
              <pre className="p-3 text-sm">{children}</pre>
            </div>
          );
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
