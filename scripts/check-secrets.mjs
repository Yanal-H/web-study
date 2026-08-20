import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const findings = [];
const patterns = [
  { name: 'Supabase personal access token', regex: /sbp_[a-zA-Z0-9]{20,}/g },
  { name: 'Anthropic API key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  {
    name: 'Supabase service-role assignment',
    regex: /SUPABASE_(?:SERVICE|SERVICE_ROLE)_KEY\s*[:=]\s*["']?(?!YOUR[-_<]|<|CHANGE|REPLACE)[a-zA-Z0-9._-]{20,}/g,
  },
];

for (const file of tracked) {
  if (/^\.env(?:\.|$)/.test(file) && file !== '.env.example') {
    findings.push(`${file}: tracked environment file`);
    continue;
  }
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // binary file
  }
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) findings.push(`${file}: ${pattern.name}`);
    pattern.regex.lastIndex = 0;
  }
}

if (findings.length) {
  console.error('Potential committed secret(s) found:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Secret scan passed (${tracked.length} repository files).`);
