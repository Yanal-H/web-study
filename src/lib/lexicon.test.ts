import { describe, it, expect } from 'vitest';
import { buildIndex, decorate, renderRich, renderInline, BASE_INDEX } from './lexicon';

describe('lexicon', () => {
  it('colours numbers with units', () => {
    const html = decorate('<p>Contraction runs 2–3 weeks after injury.</p>');
    expect(html).toContain('t-value');
    expect(html).toContain('2–3 weeks');
  });

  it('colours built-in terms by class', () => {
    const html = decorate('<p>Neutrophils arrive before macrophages.</p>');
    expect(html).toContain('class="t t-cell"');
  });

  it('uses authored glossary kinds and definitions', () => {
    const idx = buildIndex([
      { term: 'lavender oil', kind: 'drug', def: 'A topical agent.', aliases: [] },
    ]);
    const html = decorate('<p>Apply lavender oil.</p>', idx);
    expect(html).toContain('t-drug');
    expect(html).toContain('title="A topical agent."');
  });

  it('follows aliases', () => {
    const idx = buildIndex([
      { term: 'myofibroblast', kind: 'cell', aliases: ['myofibroblasts'] },
    ]);
    expect(decorate('<p>myofibroblasts contract.</p>', idx)).toContain('t-cell');
  });

  it('never highlights inside tags, code or headings', () => {
    const html = decorate('<h2>Neutrophils</h2><code>neutrophils</code>');
    expect(html).toBe('<h2>Neutrophils</h2><code>neutrophils</code>');
  });

  it('does not nest one highlight inside another', () => {
    const html = decorate('<p>Give 500 mg flucloxacillin for 7 days.</p>');
    expect(html).not.toMatch(/<span class="t[^>]*><span class="t/);
  });

  it('leaves stop words alone', () => {
    expect(decorate('<p>The diagnosis is clear.</p>')).not.toContain('t-condition');
  });

  it('renders markdown then colours it', () => {
    const html = renderRich('**Myofibroblasts** appear at 3 days.');
    expect(html).toContain('<strong>');
    expect(html).toContain('t-value');
  });

  it('renderInline drops the wrapping paragraph', () => {
    expect(renderInline('Plain line.', BASE_INDEX)).not.toContain('<p');
  });

  it('escapes HTML in the source text', () => {
    expect(renderRich('<img src=x onerror=alert(1)>')).not.toContain('<img');
  });
});
