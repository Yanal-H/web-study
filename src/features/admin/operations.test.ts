import { describe, expect, it } from 'vitest';
import { parseContentDeliveryHealth, parseSnapshot } from './operations';

describe('administrator aggregate health parsing', () => {
  it('accepts a valid operational snapshot without student details', () => {
    expect(parseSnapshot({
      generatedAt: '2026-08-20T00:00:00Z',
      content: { published: 4, drafts: 1, archived: 2, versions: 7 },
      community: { roster: 20_000, claimed: 12, waiting: 19_988, openReports: 0, activeDepartments: 2, activeChannels: 4 },
    })?.content.published).toBe(4);
  });

  it('parses delivery totals and clamps invalid counts', () => {
    const health = parseContentDeliveryHealth({
      generatedAt: '2026-08-20T00:00:00Z', publishedChapters: 4, sections: 20,
      cards: 540, mcqs: 100, emqs: 2, mnemonics: 12, invalidChapters: -1,
      duplicateCardIds: 0, duplicateQuestionIds: 0, latestPublishedAt: null,
      catalogFingerprint: 'abc123',
    });
    expect(health).toMatchObject({ publishedChapters: 4, cards: 540, invalidChapters: 0 });
  });

  it('rejects malformed delivery health', () => {
    expect(parseContentDeliveryHealth({ generatedAt: 'now' })).toBeNull();
  });
});
