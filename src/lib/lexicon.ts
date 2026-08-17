// Semantic colouring for study text.
//
// One colour per concept class, applied identically in the reader, on flashcards,
// in questions and in notes — so a drug always reads as a drug and a number always
// reads as a number. Three sources feed it:
//   1. the authored glossary of every loaded chapter (term + kind + definition),
//   2. a built-in medical lexicon of high-frequency terms,
//   3. shape rules for things no list can cover (doses, durations, drug suffixes).
//
// Everything happens in ONE regex pass over the text nodes of already-rendered,
// already-escaped HTML, so no match can ever land inside a tag or nest inside
// another highlight.

import type { TermKind } from '../content/schema';
import { renderMarkdown } from './markdown';

export type { TermKind };

/* ---------------------------------------------------------------- built-ins */

const BUILTIN: Record<TermKind, string[]> = {
  drug: [
    'adrenaline', 'amoxicillin', 'analgesia', 'antibiotic', 'antibiotics', 'anticoagulant',
    'aspirin', 'benzylpenicillin', 'ceftriaxone', 'chlorhexidine', 'ciprofloxacin',
    'clindamycin', 'co-amoxiclav', 'corticosteroid', 'corticosteroids', 'flucloxacillin',
    'gentamicin', 'heparin', 'ibuprofen', 'insulin', 'lidocaine', 'metronidazole',
    'morphine', 'NSAID', 'NSAIDs', 'paracetamol', 'penicillin', 'povidone-iodine',
    'steroid', 'steroids', 'vancomycin', 'warfarin',
  ],
  organism: [
    'anaerobes', 'Bacteroides', 'Candida', 'Clostridium', 'Clostridium perfringens',
    'Clostridium tetani', 'E. coli', 'Enterococcus', 'Escherichia coli', 'MRSA',
    'Pasteurella', 'Pseudomonas', 'Pseudomonas aeruginosa', 'Staphylococcus',
    'Staphylococcus aureus', 'Streptococcus', 'Streptococcus pyogenes',
  ],
  cell: [
    'basal cells', 'basophil', 'endothelial cells', 'eosinophil', 'erythrocyte',
    'fibroblast', 'fibroblasts', 'keratinocyte', 'keratinocytes', 'leucocyte',
    'lymphocyte', 'lymphocytes', 'macrophage', 'macrophages', 'mast cell', 'mast cells',
    'monocyte', 'monocytes', 'myofibroblast', 'myofibroblasts', 'neutrophil',
    'neutrophils', 'osteoblast', 'osteoclast', 'platelet', 'platelets', 'stem cells',
  ],
  mediator: [
    'bradykinin', 'collagen', 'collagenase', 'complement', 'cytokine', 'cytokines',
    'elastin', 'fibrin', 'fibronectin', 'growth factor', 'growth factors', 'histamine',
    'interleukin', 'nitric oxide', 'prostaglandin', 'prostaglandins', 'proteoglycans',
    'serotonin', 'thrombin', 'EGF', 'FGF', 'GM-CSF', 'PDGF', 'VEGF',
  ],
  condition: [
    'abscess', 'cellulitis', 'contracture', 'diabetes', 'diabetes mellitus', 'granuloma',
    'haematoma', 'hypertrophic scar', 'infection', 'keloid', 'malignancy', 'malnutrition',
    'oedema', 'pressure sore', 'pressure ulcer', 'scar', 'sinus', 'ulcer', 'ulcers',
    'varicose veins', 'venous insufficiency',
  ],
  test: [
    'ABPI', 'ABG', 'biopsy', 'blood culture', 'C-reactive protein', 'CRP', 'CT',
    'culture', 'Doppler', 'ESR', 'FBC', 'full blood count', 'histology', 'MRI',
    'radiograph', 'swab', 'ultrasound', 'U&E', 'X-ray',
  ],
  procedure: [
    'amputation', 'anastomosis', 'closure', 'debridement', 'delayed primary closure',
    'dressing', 'dressings', 'drainage', 'excision', 'flap', 'graft', 'incision',
    'irrigation', 'laparotomy', 'primary closure', 'skin graft', 'split-thickness graft',
    'suture', 'sutures', 'suturing', 'tension-free closure', 'toilet', 'wound toilet',
  ],
  structure: [
    'basement membrane', 'capillary', 'dermis', 'endothelium', 'epidermis',
    'epithelium', 'extracellular matrix', 'fascia', 'granulation tissue', 'lymphatics',
    'mucosa', 'muscle', 'nerve', 'periosteum', 'peritoneum', 'subcutaneous tissue',
    'tendon', 'vessel', 'vessels',
  ],
  value: ['first intention', 'second intention', 'third intention', 'stage I', 'stage II', 'grade'],
  warning: [
    'anaphylaxis', 'compartment syndrome', 'dehiscence', 'gangrene', 'haemorrhage',
    'ischaemia', 'necrosis', 'necrotising fasciitis', 'rabies', 'sepsis', 'septicaemia',
    'shock', 'tetanus',
  ],
};

/** Words whose ending matches a class rule but which are not that class. */
const STOP = new Set([
  'diagnosis', 'prognosis', 'osmosis', 'hypothesis', 'analysis', 'basis', 'emphasis',
  'anastomosis', 'this', 'gross', 'across', 'loss', 'process', 'thus', 'plus', 'versus',
  'photo', 'auto', 'trauma', 'stroma', 'sarcoma', 'aroma', 'coma', 'comma', 'schema',
  'formula', 'plasma', 'dogma', 'oedema', 'apathy', 'empathy',
]);

/* --------------------------------------------------------------- shape rules */

// A number with a clinical unit, a percentage, a ratio or a plain duration.
const VALUE_RE =
  '\\d+(?:[.,·]\\d+)?(?:\\s?[–\\-]\\s?\\d+(?:[.,·]\\d+)?)?\\s*' +
  '(?:%|mg\\/kg|mg|mcg|µg|g\\/dL|g|kg|mL\\/min|mL|L\\/min|L|mmol\\/L|mmol|mEq\\/L|mmHg|cmH2O|' +
  'cm|mm|m²|IU|units?|kcal|°C|hours?|hrs?|h\\b|days?|weeks?|wks?|months?|years?|yrs?|' +
  'minutes?|mins?|seconds?|secs?)';

// Drug-name endings that are reliable across classes.
const DRUG_RE =
  '\\b[A-Za-z]{3,}(?:cillins?|mycins?|micins?|cyclines?|azoles?|prazoles?|sartans?|' +
  'prils?|olols?|statins?|dipines?|floxacins?|parins?|coxibs?|triptans?|tidines?|' +
  'semide|thiazides?|caine|fentanil)\\b';

// Cell endings.
const CELL_RE = '\\b[A-Za-z]{3,}(?:blasts?|cytes?|phages?|phils?|clasts?)\\b';

// Disease/process endings.
const COND_RE =
  '\\b[A-Za-z]{3,}(?:itis|osis|aemia|emia|opathy|pathy|omas?|plasia|trophy|ectasis|algia)\\b';

// Cytokine / mediator shapes.
const MED_RE = '\\b(?:IL-\\d+|TNF-?(?:α|alpha)?|TGF-?(?:β|beta)?|IFN-?(?:γ|gamma)?|VEGF|PDGF|EGF|FGF)\\b';

/* -------------------------------------------------------------------- index */

export interface LexEntry {
  term: string;
  kind: TermKind;
  def?: string;
}

export interface LexIndex {
  re: RegExp | null;
  kindOf: Map<string, TermKind>;
  defOf: Map<string, string>;
  /** entries for a glossary panel, sorted alphabetically */
  entries: LexEntry[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build a lookup + one master regex from authored entries plus the built-ins. */
export function buildIndex(
  authored: Array<{ term: string; kind?: TermKind; def?: string; aliases?: string[] }> = []
): LexIndex {
  const kindOf = new Map<string, TermKind>();
  const defOf = new Map<string, string>();
  const entries: LexEntry[] = [];

  for (const kind of Object.keys(BUILTIN) as TermKind[]) {
    for (const t of BUILTIN[kind]) kindOf.set(t.toLowerCase(), kind);
  }
  // authored entries win over built-ins
  for (const g of authored) {
    if (!g.term) continue;
    const kind = g.kind || 'condition';
    const all = [g.term, ...(g.aliases || [])];
    for (const t of all) {
      const key = t.toLowerCase();
      kindOf.set(key, kind);
      if (g.def) defOf.set(key, g.def);
    }
    entries.push({ term: g.term, kind, def: g.def });
  }

  const terms = [...kindOf.keys()]
    .filter((t) => t.length > 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 900)
    .map(escapeRe);

  const parts = [
    `(${VALUE_RE})`, // 1 value
    terms.length ? `\\b(${terms.join('|')})\\b` : null, // 2 known term
    `(${MED_RE})`, // 3 mediator shape
    `(${DRUG_RE})`, // 4 drug shape
    `(${CELL_RE})`, // 5 cell shape
    `(${COND_RE})`, // 6 condition shape
  ].filter(Boolean) as string[];

  let re: RegExp | null = null;
  try {
    re = new RegExp(parts.join('|'), 'gi');
  } catch {
    re = null;
  }
  entries.sort((a, b) => a.term.localeCompare(b.term));
  return { re, kindOf, defOf, entries };
}

/** The index built from the built-in lexicon only. */
export const BASE_INDEX = buildIndex();

/* ----------------------------------------------------------------- decorate */

const SKIP_OPEN = /^<(code|pre|a|h[1-6])\b/i;
const SKIP_CLOSE = /^<\/(code|pre|a|h[1-6])>/i;

function wrap(text: string, kind: TermKind, def?: string): string {
  const title = def ? ` title="${def.replace(/"/g, '&quot;')}"` : '';
  return `<span class="t t-${kind}"${title}>${text}</span>`;
}

/**
 * Colour concept terms inside already-rendered, already-escaped HTML.
 * Only text between tags is touched, and headings, links and code are left alone.
 */
export function decorate(html: string, index: LexIndex = BASE_INDEX): string {
  if (!index.re) return html;
  const chunks = html.split(/(<[^>]+>)/);
  let depth = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    if (c.startsWith('<')) {
      if (SKIP_OPEN.test(c) && !c.endsWith('/>')) depth++;
      else if (SKIP_CLOSE.test(c)) depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0 || !c.trim()) continue;
    index.re.lastIndex = 0;
    chunks[i] = c.replace(
      index.re,
      (m, value, term, med, drug, cell, cond): string => {
        const lower = m.toLowerCase();
        if (value) return wrap(m, 'value');
        if (term) return wrap(m, index.kindOf.get(lower) || 'condition', index.defOf.get(lower));
        if (STOP.has(lower)) return m;
        if (med) return wrap(m, 'mediator');
        if (drug) return wrap(m, 'drug');
        if (cell) return wrap(m, 'cell');
        if (cond) return wrap(m, 'condition');
        return m;
      }
    );
  }
  return chunks.join('');
}

/** Markdown → safe HTML → semantically coloured HTML. */
export function renderRich(src: string, index: LexIndex = BASE_INDEX): string {
  return decorate(renderMarkdown(src ?? ''), index);
}

/** Same, for a single line: no wrapping paragraph. */
export function renderInline(src: string, index: LexIndex = BASE_INDEX): string {
  const html = renderMarkdown(src ?? '')
    .replace(/^<p class="md-p">/, '')
    .replace(/<\/p>$/, '');
  return decorate(html, index);
}

/** Human label for a concept class (used by the reader's colour key). */
export const KIND_LABEL: Record<TermKind, string> = {
  drug: 'Drugs & agents',
  organism: 'Organisms',
  cell: 'Cells & tissues',
  mediator: 'Mediators & proteins',
  condition: 'Conditions',
  test: 'Investigations',
  procedure: 'Procedures',
  structure: 'Anatomy',
  value: 'Numbers & values',
  warning: 'Red flags',
};
