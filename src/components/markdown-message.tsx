"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy } from "lucide-react";

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
          const text = String(children).replace(/\n$/, "");
          return (
            <div className="my-3 overflow-hidden rounded-md border border-border bg-slate-950 text-slate-50">
              <div className="flex h-9 items-center justify-end border-b border-slate-800 px-2">
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-800"
                  title="Copier le code"
                  onClick={() => navigator.clipboard.writeText(text)}
                >
                  <Copy size={16} />
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
