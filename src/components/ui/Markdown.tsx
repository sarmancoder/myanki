"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
  /** Recorta el texto renderizado a un número máximo de líneas. */
  clamp?: number;
  className?: string;
}

/**
 * Renderiza el Markdown de las tarjetas.
 *
 * `remark-gfm` añade tablas, listas de tareas, tachado y autoclaves de URLs, que
 * es justo lo que se usa en las tarjetas de ejemplo y notas.
 *
 * No se permite HTML embebido (`react-markdown` lo ignora por defecto), así que
 * el contenido de las tarjetas no puede inyectar etiquetas ni scripts.
 */
export default function Markdown({ children, clamp, className = "" }: MarkdownProps) {
  if (children.trim().length === 0) {
    return <span className="text-secondary-foreground">—</span>;
  }

  return (
    <div
      className={`prose-sm min-w-0 break-words text-sm text-primary ${className}`.trim()}
      style={clamp ? { display: "-webkit-box", WebkitLineClamp: clamp, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children: content }) => <p className="my-1 first:mt-0 last:mb-0">{content}</p>,
          ul: ({ children: content }) => <ul className="my-1 list-disc pl-5">{content}</ul>,
          ol: ({ children: content }) => <ol className="my-1 list-decimal pl-5">{content}</ol>,
          li: ({ children: content }) => <li className="my-0.5">{content}</li>,
          strong: ({ children: content }) => <strong className="font-semibold">{content}</strong>,
          em: ({ children: content }) => <em className="italic">{content}</em>,
          del: ({ children: content }) => <del className="line-through opacity-70">{content}</del>,
          h1: ({ children: content }) => <h3 className="mt-2 text-base font-bold">{content}</h3>,
          h2: ({ children: content }) => <h3 className="mt-2 text-base font-bold">{content}</h3>,
          h3: ({ children: content }) => <h4 className="mt-2 text-sm font-bold">{content}</h4>,
          h4: ({ children: content }) => <h5 className="mt-2 text-sm font-semibold">{content}</h5>,
          h5: ({ children: content }) => <h6 className="mt-2 text-sm font-semibold">{content}</h6>,
          h6: ({ children: content }) => <h6 className="mt-2 text-sm font-semibold">{content}</h6>,
          blockquote: ({ children: content }) => (
            <blockquote className="my-1 border-l-2 border-border pl-3 text-secondary-foreground">
              {content}
            </blockquote>
          ),
          code: ({ className: codeClassName, children: content }) => {
            const isBlock = typeof codeClassName === "string" && codeClassName.includes("language-");

            return isBlock ? (
              <code className={`${codeClassName} block overflow-x-auto rounded bg-secondary p-2 font-mono text-xs`}>
                {content}
              </code>
            ) : (
              <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]">{content}</code>
            );
          },
          pre: ({ children: content }) => (
            <pre className="my-1 overflow-x-auto rounded-lg bg-secondary p-2 font-mono text-xs">{content}</pre>
          ),
          a: ({ href, children: content }) => (
            <a
              href={href}
              className="text-primary underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              {content}
            </a>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} className="my-1 max-h-40 rounded-lg" />
          ),
          table: ({ children: content }) => (
            <div className="my-1 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{content}</table>
            </div>
          ),
          th: ({ children: content }) => (
            <th className="border border-border px-2 py-1 text-left font-semibold">{content}</th>
          ),
          td: ({ children: content }) => <td className="border border-border px-2 py-1">{content}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}