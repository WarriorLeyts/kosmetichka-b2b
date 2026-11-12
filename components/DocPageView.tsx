import Link from "next/link";
import { AppBar } from "@/components/app/AppBar";
import { RichText } from "@/lib/richText";
import type { DocContent } from "@/lib/cms/docSchema";
import { menuDocs } from "@/lib/cms/docs";

/** A document page from the admin panel (Контакты, Политика, Соглашение, /info/<slug>). */
export async function DocPageView({ doc, slug }: { doc: DocContent; slug: string }) {
  const links = (await menuDocs()).filter((l) => l.slug !== slug);
  return (
    <main className="min-h-screen">
      <AppBar backHref="/" />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-3xl border border-white/60 bg-white px-6 py-10 shadow-sm sm:px-8">
          <h1 className="mb-6 text-2xl font-black text-slate-800">{doc.title}</h1>
          {doc.groups.map((g, i) =>
            g.rows.length ? (
              <section key={i} className="mb-8">
                {g.title ? <h2 className="mb-3 text-base font-bold text-slate-700">{g.title}</h2> : null}
                <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  {g.rows.map((r, k) => (
                    <div key={k} className="flex gap-2">
                      <span className="w-28 shrink-0 text-slate-400">{r.label}</span>
                      <span className="min-w-0 break-words">{r.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null
          )}
          <RichText text={doc.body} />
          {links.length ? (
            <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-slate-100 pt-6 text-center">
              {links.map((l) => (
                <Link key={l.slug} href={l.path} className="text-sm text-pink-500 hover:underline">
                  {l.title}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
