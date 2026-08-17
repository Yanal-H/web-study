import { describe, expect, it } from 'vitest';
import { renderMarkdown, extractWikilinks } from './markdown';

describe('markdown renderer', () => {
  it('escapes HTML — no XSS through user note content', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('renders headings, bold, italic and inline code', () => {
    expect(renderMarkdown('# Title')).toContain('<h1');
    expect(renderMarkdown('**b**')).toContain('<strong>b</strong>');
    expect(renderMarkdown('*i*')).toContain('<em>i</em>');
    expect(renderMarkdown('`x`')).toContain('<code>x</code>');
  });

  it('renders wikilinks with a data attribute', () => {
    const html = renderMarkdown('see [[Wound healing]]');
    expect(html).toContain('data-wikilink="Wound healing"');
  });

  it('reveals cloze answers in the reader', () => {
    const html = renderMarkdown('The {{c1::phases::hint}} of healing');
    expect(html).toContain('class="cloze"');
    expect(html).toContain('phases');
    expect(html).not.toContain('hint');
  });

  it('renders lists and callouts', () => {
    expect(renderMarkdown('- one\n- two')).toContain('<ul');
    expect(renderMarkdown('> [!warning] careful')).toContain('md-callout--warning');
  });

  it('only allows safe link protocols', () => {
    const html = renderMarkdown('[x](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('extracts wikilink targets', () => {
    expect(extractWikilinks('a [[One]] b [[Two]]')).toEqual(['One', 'Two']);
  });
});
