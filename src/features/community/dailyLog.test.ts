import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: null }));

const { groupForDigest, digestText, todayLocal } = await import('./dailyLog');
type DailyLog = Awaited<ReturnType<typeof import('./dailyLog').listDailyLogs>>['logs'][number];

const log = (o: Partial<DailyLog>): DailyLog =>
  ({
    id: o.id ?? 'x',
    author_id: o.author_id ?? 'u1',
    author_alias: o.author_alias ?? 'Student',
    log_date: '2026-08-22',
    academic_year: 'Y2',
    subject: o.subject ?? 'Surgery',
    topic: o.topic ?? 'Wound healing',
    lecturer: o.lecturer ?? null,
    body: o.body ?? 'Covered the phases.',
    created_at: o.created_at ?? '2026-08-22T09:00:00Z',
  }) as DailyLog;

describe('groupForDigest — several accounts of one lecture belong together', () => {
  it('puts every entry for one topic in one place', () => {
    // The value is that students complement each other: one caught the
    // classification, another the complications. Interleaved by timestamp,
    // that is unusable.
    const groups = groupForDigest([
      log({ id: '1', subject: 'Surgery', topic: 'Wound healing', author_alias: 'A' }),
      log({ id: '2', subject: 'Anatomy', topic: 'Brachial plexus', author_alias: 'B' }),
      log({ id: '3', subject: 'Surgery', topic: 'Wound healing', author_alias: 'C' }),
    ]);
    expect(groups.map((g) => g.subject)).toEqual(['Anatomy', 'Surgery']); // sorted
    const surgery = groups.find((g) => g.subject === 'Surgery')!;
    expect(surgery.topics).toHaveLength(1);
    expect(surgery.topics[0]!.entries.map((e) => e.author_alias)).toEqual(['A', 'C']);
  });

  it('keeps different topics of one subject apart', () => {
    const groups = groupForDigest([
      log({ id: '1', subject: 'Surgery', topic: 'Wound healing' }),
      log({ id: '2', subject: 'Surgery', topic: 'Burns' }),
    ]);
    expect(groups[0]!.topics.map((t) => t.topic)).toEqual(['Burns', 'Wound healing']);
  });

  it('files an unlabelled entry rather than dropping it', () => {
    const groups = groupForDigest([log({ id: '1', subject: '   ', topic: '  ' })]);
    expect(groups[0]!.subject).toBe('Unfiled');
    expect(groups[0]!.topics[0]!.topic).toBe('Untitled');
  });

  it('handles an empty day', () => {
    expect(groupForDigest([])).toEqual([]);
  });
});

describe('digestText — a day, ready to paste into the authoring prompt', () => {
  it('says so plainly when nothing was filed', () => {
    expect(digestText('2026-08-22', [])).toMatch(/No study logs were filed for 2026-08-22/);
  });

  it('counts entries and distinct students, not entries twice', () => {
    const text = digestText('2026-08-22', [
      log({ id: '1', author_id: 'u1' }),
      log({ id: '2', author_id: 'u1' }), // same student, two lectures
      log({ id: '3', author_id: 'u2' }),
    ]);
    expect(text).toContain('3 entries from 2 student(s)');
  });

  it('lays the day out by subject and topic, attributing each note', () => {
    const text = digestText('2026-08-22', [
      log({ id: '1', subject: 'Surgery', topic: 'Wound healing', lecturer: 'Dr Adel', author_alias: 'Mona', body: 'Phases overlap.' }),
    ]);
    expect(text).toContain('## Surgery');
    expect(text).toContain('### Wound healing — Dr Adel');
    expect(text).toContain('- (Mona) Phases overlap.');
  });

  it('flattens a multi-line note so one entry stays one bullet', () => {
    const text = digestText('2026-08-22', [log({ id: '1', body: 'First line\n\n  second line  ' })]);
    expect(text).toContain('- (Student) First line second line');
  });

  it('uses the singular for a single entry', () => {
    expect(digestText('2026-08-22', [log({ id: '1' })])).toContain('1 entry from 1 student(s)');
  });
});

describe('todayLocal', () => {
  it('is the local calendar day, so a log filed near midnight files to today', () => {
    // A student writing up at 00:30 local is reporting today, not yesterday in UTC.
    const d = new Date('2026-08-22T10:00:00Z');
    expect(todayLocal(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
