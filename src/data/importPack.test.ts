import { describe, expect, it } from 'vitest';
import { replacementPlan } from './importPack';

describe('replacementPlan', () => {
  it('removes only rows deleted from the updated chapter', () => {
    const plan = replacementPlan(
      'ana-ch1',
      {
        cardIds: new Set(['ana-ch1-card-001']),
        mcqIds: new Set(['ana-ch1-mcq-001']),
        mediaIds: new Set(['ana-ch1:figure-1']),
      },
      {
        cards: [
          { id: 'ana-ch1-card-001', chapterId: 'ana-ch1' },
          { id: 'ana-ch1-card-removed', chapterId: 'ana-ch1' },
          { id: 'sur-ch1-card-001', chapterId: 'sur-ch1' },
        ],
        mcqs: [
          { id: 'ana-ch1-mcq-001', chapterId: 'ana-ch1' },
          { id: 'ana-ch1-mcq-removed', chapterId: 'ana-ch1' },
          { id: 'sur-ch1-mcq-001', chapterId: 'sur-ch1' },
        ],
        media: [
          { imageId: 'ana-ch1:figure-1' },
          { imageId: 'ana-ch1:old-figure' },
          { imageId: 'sur-ch1:figure-1' },
        ],
      }
    );
    expect(plan).toEqual({
      cards: ['ana-ch1-card-removed'],
      mcqs: ['ana-ch1-mcq-removed'],
      media: ['ana-ch1:old-figure'],
    });
  });
});
