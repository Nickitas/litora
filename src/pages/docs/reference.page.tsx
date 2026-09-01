import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useParams } from "react-router";
import { ArrowLeft, BookOpen } from "lucide-react";
import { referenceDocuments } from "./reference";
const headingId = (children: React.ReactNode) => String(children ?? "").toLowerCase().replace(/[^а-яa-z0-9]+/gi, "-").replace(/^-|-$/g, "");
const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => <h2 id={headingId(children)} className="scroll-mt-24 break-words border-b border-border/50 pb-3 pt-4 text-2xl font-bold sm:text-3xl">{children}</h2>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 id={headingId(children)} className="scroll-mt-24 break-words border-b border-border/50 pb-2 pt-6 text-xl font-bold sm:text-2xl">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 id={headingId(children)} className="scroll-mt-24 break-words pt-4 text-lg font-bold sm:text-xl">{children}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="break-words leading-7 text-muted-foreground">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="space-y-2 pl-6 text-muted-foreground [&>li]:list-disc">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="space-y-2 pl-6 text-muted-foreground [&>li]:list-decimal">{children}</ol>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="border-l-4 border-primary/40 bg-primary/[0.06] px-4 py-3 italic">{children}</blockquote>,
  pre: ({ children }: { children?: React.ReactNode }) => <pre className="my-4 max-w-full overflow-x-auto rounded-xl">{children}</pre>,
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => className ? <code className="block min-w-max rounded-xl bg-zinc-950 p-4 font-mono text-xs leading-6 text-zinc-100 sm:text-sm">{children}</code> : <code className="break-words rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.9em] text-primary">{children}</code>,
  table: ({ children }: { children?: React.ReactNode }) => <div className="my-4 max-w-full overflow-x-auto rounded-xl border"><table className="w-full min-w-[560px] border-collapse text-left text-sm">{children}</table></div>,
  th: ({ children }: { children?: React.ReactNode }) => <th className="border-b bg-muted/40 px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }: { children?: React.ReactNode }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
  img: ({ src, alt }: { src?: string; alt?: string }) => <img src={src} alt={alt ?? ""} className="h-auto max-w-full rounded-xl" />,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/70">{children}</a>,
  hr: () => <hr className="my-6 border-border" />,
};

export function ReferencePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const document = referenceDocuments.find((item) => item.slug === slug);
  const content = document?.content ?? "Не удалось загрузить документ.";
  const currentIndex = document ? referenceDocuments.findIndex((item) => item.slug === document.slug) : -1;
  const headings = useMemo(() => content.split("\n").filter((line) => /^#{2,3}\s+/.test(line)).map((line) => line.replace(/^#{2,3}\s+/, "")), [content]);
  if (!document) return <div className="py-16 text-center"><h1 className="text-2xl font-bold">Документ не найден</h1><Link to="/docs" className="mt-4 inline-block text-primary">К документации</Link></div>;
  return <article className="min-w-0 space-y-8"><Link to="/docs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> К документации</Link><header className="min-w-0 space-y-3"><div className="flex items-center gap-3 text-primary"><BookOpen className="size-5 shrink-0" /><span className="text-sm">{document.category}</span></div><h1 className="break-words text-3xl font-bold sm:text-4xl">{document.title}</h1><p className="break-words text-lg text-muted-foreground">{document.description}</p></header><div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start"><div className="min-w-0 overflow-hidden rounded-2xl border bg-background/80 p-4 shadow-sm sm:p-8"><ReactMarkdown components={markdownComponents as never}>{content}</ReactMarkdown></div>{headings.length > 0 && <aside className="sticky top-6 hidden rounded-xl border bg-muted/20 p-4 lg:block"><p className="mb-3 text-xs font-semibold tracking-wide text-primary uppercase">В документе</p><nav className="space-y-2 text-sm text-muted-foreground">{headings.map((heading) => <a key={heading} href={`#${headingId(heading)}`} className="block break-words hover:text-foreground">{heading}</a>)}</nav></aside>}</div><nav className="grid min-w-0 gap-3 border-t border-border/50 pt-6 sm:grid-cols-2">{currentIndex > 0 && <Link to={`/docs/reference/${referenceDocuments[currentIndex - 1].slug}`} className="min-w-0 rounded-xl border p-4 text-sm hover:border-primary/50"><span className="text-xs text-muted-foreground">Предыдущий документ</span><span className="mt-1 block break-words font-medium">← {referenceDocuments[currentIndex - 1].title}</span></Link>}{currentIndex < referenceDocuments.length - 1 && <Link to={`/docs/reference/${referenceDocuments[currentIndex + 1].slug}`} className="min-w-0 rounded-xl border p-4 text-right text-sm hover:border-primary/50"><span className="text-xs text-muted-foreground">Следующий документ</span><span className="mt-1 block break-words font-medium">{referenceDocuments[currentIndex + 1].title} →</span></Link>}</nav></article>;
}
