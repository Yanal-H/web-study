import { describe, expect, it } from 'vitest';
import { exportTSV, parseDelimited } from './anki';
import type { Flashcard } from '../../state/types';

describe('Anki TSV round-trip', () => {
  it('exports then re-parses front/back/tags/type losslessly', () => {
    const cards: Flashcard[] = [
      { id: '1', type: 'basic', front: 'What is X?', back: 'The answer', tags: ['surgery', 'hy'] } as Flashcard,
      { id: '2', type: 'cloze', cloze: 'The {{c1::phases}} of healing', tags: ['physio'] } as Flashcard,
      { id: '3', type: 'basic', front: 'Comma, and "quote"', back: 'Tricky\tvalue', tags: [] } as Flashcard,
    ];
    const tsv = exportTSV(cards);
    const back = parseDelimited(tsv);
    expect(back).toHaveLength(3);
    expect(back[0]).toMatchObject({ type: 'basic', front: 'What is X?', back: 'The answer', tags: ['surgery', 'hy'] });
    expect(back[1]).toMatchObject({ type: 'cloze', cloze: 'The {{c1::phases}} of healing' });
    // quoting/escaping survives
    expect(back[2]).toMatchObject({ type: 'basic', front: 'Comma, and "quote"', back: 'Tricky\tvalue' });
  });

  it('auto-detects CSV and a header row', () => {
    const csv = 'front,back,tags,type\nQ1,A1,tag1,basic\nQ2,A2,,basic';
    const parsed = parseDelimited(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ front: 'Q1', back: 'A1', tags: ['tag1'] });
  });

  it('treats {{c1::…}} rows as cloze even without a type column', () => {
    const parsed = parseDelimited('The {{c1::heart}} pumps blood');
    expect(parsed[0]!.type).toBe('cloze');
  });
});
