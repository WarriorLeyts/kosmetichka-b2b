import type { ReactNode } from "react";

/**
 * A small, safe markup for texts from the admin panel (pages, catalog SEO texts): «## » / «### » headings,
 * «- » lists, «1. » numbered lists, paragraphs (an empty line between), **bold**, [text](link).
 * No HTML from the text ever reaches the page; links only to http(s), mailto, tel and the site itself.
 */
type Block = { type: "h2" | "h3" | "p"; text: string } | { type: "ul" | "ol"; items: string[] };

export function parseRich(src: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: "p", text: para.join("\n") });
    para = [];
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{2,3})\s+(.+)$/);
    const ul = line.match(/^\s*[-•*]\s+(.+)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (!line.trim()) flush();
    else if (h) {
      flush();
      out.push({ type: h[1].length === 2 ? "h2" : "h3", text: h[2].trim() });
    } else if (ul || ol) {
      flush();
      const type = ul ? "ul" : "ol";
      const last = out[out.length - 1];
      if (last && last.type === type) last.items.push((ul ?? ol)![1]);
      else out.push({ type, items: [(ul ?? ol)![1]] });
    } else para.push(line.trim());
  }
  flush();
  return out;
}

const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i;

export function inline(text: string, key = ""): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`${key}b${i++}`}>{m[1]}</strong>);
    else if (SAFE_LINK.test(m[3])) {
      const ext = /^https?:/i.test(m[3]);
      out.push(
        <a key={`${key}a${i++}`} href={m[3]} className="text-pink-600 hover:underline" {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {m[2]}
        </a>
      );
    } else out.push(m[2]);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseRich(text);
  if (!blocks.length) return null;
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.type === "h2" ? (
          <h2 key={i} className="mb-2 mt-6 text-lg font-bold text-slate-700 first:mt-0">
            {inline(b.text, `${i}`)}
          </h2>
        ) : b.type === "h3" ? (
          <h3 key={i} className="mb-1.5 mt-4 font-semibold text-slate-700">
            {inline(b.text, `${i}`)}
          </h3>
        ) : b.type === "p" ? (
          <p key={i} className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {inline(b.text, `${i}`)}
          </p>
        ) : b.type === "ul" ? (
          <ul key={i} className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {b.items.map((t, k) => (
              <li key={k}>{inline(t, `${i}-${k}`)}</li>
            ))}
          </ul>
        ) : b.type === "ol" ? (
          <ol key={i} className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            {b.items.map((t, k) => (
              <li key={k}>{inline(t, `${i}-${k}`)}</li>
            ))}
          </ol>
        ) : null
      )}
    </div>
  );
}
