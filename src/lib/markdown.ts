// Minimal, XSS-safe Markdown subset for Notes.
//
// Strategy: escape ALL HTML first, then apply a small set of inline/block
// transforms on the escaped text. Because we never inject raw user HTML, the
// output is safe to pass to dangerouslySetInnerHTML. Supports: headings, bold,
// italic, inline code, fenced code, links, [[wikilinks]], {{c1::cloze}},
// > blockquote / > [!note] callouts, unordered + ordered lists, --- rules.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface WikiLink {
  target: string;
}

/** Extract [[wikilink]] targets from raw note text. */
export function extractWikilinks(src: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]!.trim());
  return out;
}

function inline(text: string, opts: RenderOpts): string {
  let t = text;
  // inline code first (protect its contents)
  const codes: string[] = [];
  t = t.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(c);
    return `@@CODE${codes.length - 1}@@`;
  });
  // cloze {{c1::answer::hint}} -> revealed by default in the reader
  t = t.replace(/\{\{c\d+::([^}]*?)(?:::[^}]*?)?\}\}/g, (_m, ans) => `<span class="cloze">${ans}</span>`);
  // wikilinks
  t = t.replace(/\[\[([^\]]+)\]\]/g, (_m, name) => {
    const clean = String(name).trim();
    return `<a class="wikilink" data-wikilink="${clean}" href="#">${clean}</a>`;
  });
  // links [text](url) — only http(s)/relative
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safe = /^(https?:|\/|#)/.test(url) ? url : '#';
    const ext = /^https?:/.test(safe) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${safe}"${ext}>${label}</a>`;
  });
  // bold / italic
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // restore inline code
  t = t.replace(/@@CODE(\d+)@@/g, (_m, i) => `<code>${codes[Number(i)]}</code>`);
  void opts;
  return t;
}

interface RenderOpts {
  onWikilink?: (target: string) => void;
}

/** Render a Markdown subset to a safe HTML string. */
export function renderMarkdown(src: string, opts: RenderOpts = {}): string {
  const escaped = escapeHtml(src ?? '');
  const lines = escaped.split(/\r?\n/);
  const html: string[] = [];
  let i = 0;
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i]!;

    // fenced code
    if (/^```/.test(line)) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) {
        buf.push(lines[i]!);
        i++;
      }
      i++; // skip closing fence
      html.push(`<pre class="md-pre"><code>${buf.join('\n')}</code></pre>`);
      continue;
    }

    // horizontal rule
    if (/^---+\s*$/.test(line)) {
      closeList();
      html.push('<hr />');
      i++;
      continue;
    }

    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1]!.length;
      html.push(`<h${level} class="md-h">${inline(h[2]!, opts)}</h${level}>`);
      i++;
      continue;
    }

    // callout / blockquote
    if (/^&gt;\s?/.test(line)) {
      closeList();
      const buf: string[] = [];
      let kind = 'note';
      while (i < lines.length && /^&gt;\s?/.test(lines[i]!)) {
        let content = lines[i]!.replace(/^&gt;\s?/, '');
        const cm = content.match(/^\[!(\w+)\]\s*(.*)$/);
        if (cm) {
          kind = cm[1]!.toLowerCase();
          content = cm[2]!;
        }
        buf.push(inline(content, opts));
        i++;
      }
      html.push(`<div class="md-callout md-callout--${kind}">${buf.join('<br/>')}</div>`);
      continue;
    }

    // unordered list
    if (/^[-*]\s+/.test(line)) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul class="md-ul">');
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ''), opts)}</li>`);
      i++;
      continue;
    }
    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol class="md-ol">');
      }
      html.push(`<li>${inline(line.replace(/^\d+\.\s+/, ''), opts)}</li>`);
      i++;
      continue;
    }

    // blank line
    if (/^\s*$/.test(line)) {
      closeList();
      i++;
      continue;
    }

    // paragraph
    closeList();
    html.push(`<p class="md-p">${inline(line, opts)}</p>`);
    i++;
  }
  closeList();
  return html.join('\n');
}
