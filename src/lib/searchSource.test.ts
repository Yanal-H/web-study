import { describe, expect, it } from 'vitest';
import { testChapters } from '../test/content';
import { contentDocs, noteDocs, searchSource } from './searchSource';

describe('normalized worker search source', () => {
  it('contains only searchable fields and builds every supported content kind', () => {
    const chapter = testChapters().find((item) => item.cards.length > 0 && item.mcqs.length > 0)!;
    const source = searchSource([chapter]);
    const docs = contentDocs(source);
    const kinds = docs.map((doc) => doc.kind);

    expect(kinds).toContain('chapter');
    expect(kinds).toContain('section');
    expect(kinds).toContain('card');
    expect(kinds).toContain('mcq');
    expect(JSON.stringify(source)).not.toContain('explanation');
    expect(JSON.stringify(source)).not.toContain('figures');
  });

  it('preserves section hashes and normalizes notes', () => {
    const docs = contentDocs(searchSource([testChapters()[0]!]));
    expect(docs.find((doc) => doc.kind === 'section')?.route).toContain('#sec-');
    expect(noteDocs({ n1: { title: 'My note', body: 'Recall this' } })).toEqual([
      { id: 'note:n1', kind: 'note', title: 'My note', text: 'Recall this', route: '/notes' },
    ]);
  });
});
