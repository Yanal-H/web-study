export interface RosterInput {
  email: string;
  academicYear: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a tablet-friendly roster: one email per line, optionally followed by a
 * comma/tab and academic year. Duplicates are collapsed before any API usage.
 */
export function parseRoster(text: string): { rows: RosterInput[]; errors: string[] } {
  const rows: RosterInput[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const [emailPart = '', ...yearParts] = line.split(/[\t,]/);
    const email = emailPart.trim().toLowerCase();
    const academicYear = yearParts.join(',').trim();
    if (!EMAIL.test(email)) {
      errors.push(`Line ${index + 1}: invalid email`);
      return;
    }
    if (!seen.has(email)) rows.push({ email, academicYear });
    seen.add(email);
  });
  return { rows, errors };
}

