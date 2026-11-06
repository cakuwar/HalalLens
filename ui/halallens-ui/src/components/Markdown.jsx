import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Turn the writer's "[2]" headline references into links. Numbering restarts per company,
 * so track which company section ("### Name (5347)") each line belongs to.
 */
function linkCitations(markdown) {
  let code = "x";
  return markdown
    .split("\n")
    .map((line) => {
      const heading = line.match(/^#{2,4}\s.*\((\d{4,5})\)\s*$/);
      if (heading) {
        code = heading[1];
        return line;
      }
      return line.replace(/\[(\d{1,2})\](?!\()/g, (_, n) => `[${n}](#cite-${code}-${n})`);
    })
    .join("\n");
}

/** The writer's Markdown. Raw HTML is never rendered (react-markdown escapes it). */
export default function Markdown({ text, headlines = {} }) {
  const components = {
    a({ href = "", children }) {
      const cite = href.match(/^#cite-(\w+)-(\d+)$/);
      if (cite) {
        const h = (headlines[cite[1]] || []).find((x) => x.n === Number(cite[2]));
        const live = h?.url && h.url !== "#";
        return (
          <a
            className="cite cite--link"
            href={live ? h.url : undefined}
            target={live ? "_blank" : undefined}
            rel="noreferrer"
            data-tip={h ? `${h.title} · ${h.source}` : `Headline ${cite[2]}`}
          >
            {cite[2]}
          </a>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    table({ children }) {
      return (
        <div className="md__table">
          <table>{children}</table>
        </div>
      );
    },
  };

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {linkCitations(text || "")}
      </ReactMarkdown>
    </div>
  );
}
