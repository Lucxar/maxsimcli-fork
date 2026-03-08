import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Copy, Check } from "lucide-react";

/* ── CopyButton (internal) ────────────────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors"
      aria-label="Copy code"
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="check"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
          >
            <Check size={13} className="text-emerald-400" />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
          >
            <Copy size={13} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/* ── CodeBlock ─────────────────────────────────────────────────────────────── */

const LANG_COLORS: Record<string, string> = {
  bash: "text-emerald-400",
  json: "text-amber-400",
  markdown: "text-purple-400",
  text: "text-zinc-400",
  ts: "text-blue-400",
  typescript: "text-blue-400",
  js: "text-yellow-400",
  javascript: "text-yellow-400",
};

export function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const langColor = LANG_COLORS[language] ?? "text-zinc-400";
  return (
    <div className="relative group my-5 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/80">
        <span className={`text-[11px] font-mono font-medium uppercase tracking-widest ${langColor}`}>
          {language}
        </span>
        <CopyButton text={code.trim()} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] font-mono leading-relaxed">
        <code className="text-zinc-300 whitespace-pre">{code.trim()}</code>
      </pre>
    </div>
  );
}

/* ── Callout ───────────────────────────────────────────────────────────────── */

const CALLOUT_STYLES = {
  note: {
    border: "border-blue-500/60",
    bg: "bg-blue-500/5",
    label: "Note",
    labelColor: "text-blue-400",
  },
  tip: {
    border: "border-emerald-500/60",
    bg: "bg-emerald-500/5",
    label: "Tip",
    labelColor: "text-emerald-400",
  },
  warn: {
    border: "border-amber-500/60",
    bg: "bg-amber-500/5",
    label: "Warning",
    labelColor: "text-amber-400",
  },
} as const;

export function Callout({
  children,
  type = "note",
}: {
  children: ReactNode;
  type?: "note" | "tip" | "warn";
}) {
  const s = CALLOUT_STYLES[type] ?? CALLOUT_STYLES.note;
  return (
    <div className={`border-l-2 ${s.border} ${s.bg} p-4 rounded-r-lg my-5`}>
      <p className={`text-[11px] font-mono font-bold uppercase tracking-widest mb-1.5 ${s.labelColor}`}>
        {s.label}
      </p>
      <div className="text-zinc-400 text-sm leading-relaxed [&>p]:mb-0">{children}</div>
    </div>
  );
}

/* ── DocTable ──────────────────────────────────────────────────────────────── */

export function DocTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto my-5 rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-zinc-900/80 border-b border-zinc-800">
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-4 py-3 text-[11px] uppercase tracking-widest text-zinc-500 font-medium whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/40 transition-colors"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-3 ${j === 0 ? "font-mono text-blue-400 text-xs" : "text-zinc-400"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Inline elements ───────────────────────────────────────────────────────── */

export function InlineCode({ content, children }: { content?: string; children?: ReactNode }) {
  return (
    <code className="text-blue-400 font-mono text-[0.85em] bg-zinc-800/60 px-1.5 py-0.5 rounded">
      {content ?? children}
    </code>
  );
}

/* ── Typography ────────────────────────────────────────────────────────────── */

export function Heading({
  level,
  children,
}: {
  level: number;
  children: ReactNode;
}) {
  if (level === 3) {
    return (
      <h3 className="text-lg font-semibold text-zinc-100 mt-8 mb-3">{children}</h3>
    );
  }
  if (level === 4) {
    return (
      <h4 className="text-base font-medium text-zinc-200 mt-6 mb-2">{children}</h4>
    );
  }
  // Fallback for other heading levels
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  return <Tag className="text-zinc-100 font-semibold mt-6 mb-3">{children}</Tag>;
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <p className="text-zinc-400 text-sm leading-relaxed mb-4">{children}</p>;
}

/* ── Component map for Markdoc renderer ────────────────────────────────────── */

export const componentMap: Record<string, React.ComponentType<any>> = {
  CodeBlock,
  Callout,
  DocTable,
  InlineCode,
  Heading,
  Paragraph,
};
