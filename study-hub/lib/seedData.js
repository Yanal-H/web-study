'use strict';
/**
 * Foundational seed content. Short stub overviews + topic checklists per
 * subject so the platform isn't empty on day one. Everything here is
 * community-editable once the server is running.
 */

const COLORS = ['#8b9eff', '#ff9ec9', '#7be0d6', '#ffb454', '#56d4a0', '#c4a7ff', '#ff7a93', '#6db3ff', '#f2d06b', '#a3e635', '#ff9d5c', '#63d2ff'];

function topics(names) {
  return names.map((name) => ({ name }));
}

const RAW_SUBJECTS = [
  {
    name: 'Anatomy',
    notes: `# Anatomy — foundations

Gross structure of the human body, organized by system and by region.

- Learn systems first (what each organ does), then regions (what sits next to what) — you need both views.
- Palpate and sketch. Anatomy rewards drawing far more than re-reading.
- Pair every structure with its blood supply, innervation, and one clinical correlate.`,
    topics: topics([
      'Skeletal system overview', 'Muscular system overview', 'Cardiovascular system (heart & great vessels)',
      'Respiratory system', 'Nervous system — CNS', 'Nervous system — peripheral & autonomic',
      'Digestive system', 'Urinary system', 'Endocrine glands', 'Reproductive system (male & female)',
      'Integumentary system (skin)', 'Lymphatic & immune structures', 'Special senses — eye', 'Special senses — ear',
      'Head & neck', 'Upper limb', 'Lower limb', 'Thorax', 'Abdomen & pelvis', 'Back & spinal cord'
    ])
  },
  {
    name: 'Histology & Embryology',
    notes: `# Histology & Embryology — foundations

The microscopic architecture behind gross anatomy, and how it forms.

- Four basic tissue types: epithelial, connective, muscle, nervous — everything is built from these.
- For embryology, learn the three germ layers and what each becomes; most syndromes map to a stage gone wrong.`,
    topics: topics([
      'Epithelial tissue', 'Connective tissue', 'Muscle tissue (skeletal/cardiac/smooth)', 'Nervous tissue',
      'Gametogenesis & fertilization', 'Germ layers (ectoderm/mesoderm/endoderm)', 'Early development & implantation',
      'Placenta & fetal membranes', 'Organogenesis overview', 'Common congenital malformations'
    ])
  },
  {
    name: 'Physiology',
    notes: `# Physiology — foundations

How the systems you mapped in anatomy actually function, moment to moment.

- Every organ system reduces to a few controlling variables — find the "dial" the body is regulating (pressure, volume, pH, glucose…).
- Draw the feedback loop before memorizing the numbers.`,
    topics: topics([
      'Cell physiology & membrane transport', 'Cardiovascular physiology', 'Respiratory physiology',
      'Renal physiology', 'GI physiology', 'Endocrine physiology', 'Neurophysiology',
      'Musculoskeletal physiology', 'Reproductive physiology', 'Acid–base & fluid balance'
    ])
  },
  {
    name: 'Biochemistry & Genetics',
    notes: `# Biochemistry & Genetics — foundations

Molecular machinery: metabolism, gene expression, and inheritance.

- Metabolism: know inputs, outputs, rate-limiting enzymes, and where regulation happens for each pathway.
- Genetics: master inheritance patterns first, then layer on exceptions (imprinting, mosaicism, anticipation).`,
    topics: topics([
      'Glycolysis & gluconeogenesis', 'TCA cycle & oxidative phosphorylation', 'Lipid metabolism',
      'Amino acid & protein metabolism', 'Vitamins & cofactors', 'DNA replication & repair',
      'Transcription & translation', 'Enzyme kinetics & regulation', 'Mendelian inheritance patterns',
      'Chromosomal & molecular genetic disorders'
    ])
  },
  {
    name: 'Immunology',
    notes: `# Immunology — foundations

The system that tells self from non-self, and what happens when it misfires.

- Learn innate vs. adaptive as two timelines, not two separate topics — they hand off to each other.
- Hypersensitivity types (I–IV) are a favorite exam anchor: know one classic example per type cold.`,
    topics: topics([
      'Innate immunity', 'Adaptive immunity overview', 'Cells of the immune system', 'Antibody structure & function',
      'MHC class I & II', 'Complement system', 'Hypersensitivity reactions (I–IV)', 'Primary immunodeficiencies',
      'Autoimmunity basics', 'Vaccines & immunologic memory'
    ])
  },
  {
    name: 'Microbiology',
    notes: `# Microbiology — foundations

Bugs, and the drugs that fight them.

- For each organism: Gram stain/shape, key virulence factor, classic disease, and first-line treatment.
- Learn antimicrobial classes by mechanism, not by memorizing drug lists in isolation.`,
    topics: topics([
      'Bacterial structure & classification', 'Gram-positive bacteria', 'Gram-negative bacteria',
      'Virology basics & major viral families', 'Fungal infections', 'Parasitology (protozoa & helminths)',
      'Antibacterial mechanisms & resistance', 'Antiviral & antifungal agents', 'Normal flora',
      'Lab identification methods'
    ])
  },
  {
    name: 'Pathology',
    notes: `# Pathology — foundations

How tissue responds to injury — the shared vocabulary behind every disease.

- Cell injury → reversible or irreversible (necrosis vs. apoptosis) is the root of almost everything else.
- Learn the phases of inflammation and repair before diving into organ-specific pathology.`,
    topics: topics([
      'Cell injury, adaptation & death', 'Acute & chronic inflammation', 'Tissue repair & healing',
      'Hemodynamic disorders (edema, thrombosis, embolism, infarction)', 'Neoplasia basics',
      'Genetic & pediatric pathology intro', 'Immunopathology', 'Environmental & nutritional pathology'
    ])
  },
  {
    name: 'Pharmacology',
    notes: `# Pharmacology — foundations

What drugs do to the body, and what the body does to drugs.

- Split every drug into pharmacokinetics (ADME) and pharmacodynamics (mechanism, effect) — don't blend them.
- Learn autonomic pharmacology deeply; it's the scaffolding for a huge share of the drug list.`,
    topics: topics([
      'Pharmacokinetics (ADME)', 'Pharmacodynamics & receptor theory', 'Autonomic pharmacology (cholinergic/adrenergic)',
      'Cardiovascular drugs', 'CNS drugs', 'Antimicrobial pharmacology', 'Endocrine drugs',
      'Toxicology & overdose management', 'Adverse drug reactions & interactions'
    ])
  },
  {
    name: 'Neuroscience',
    notes: `# Neuroscience — foundations

Structure and signaling of the nervous system.

- Localize first: know which tract/nucleus/lobe does what before layering on disease.
- Neurotransmitters: pair each with its main pathway and one classic drug or disease.`,
    topics: topics([
      'Neuroanatomy — brain overview', 'Spinal cord tracts', 'Neurotransmitters & synaptic transmission',
      'Cranial nerves', 'Reflexes', 'Sensory & motor pathways', 'Autonomic nervous system',
      'Neurodevelopment basics'
    ])
  },
  {
    name: 'Behavioral Science & Biostatistics',
    notes: `# Behavioral Science & Biostatistics — foundations

The human and quantitative side of medicine.

- Statistics: know sensitivity/specificity/PPV/NPV cold, and when to use each study design.
- Behavioral science: defense mechanisms and psychiatric criteria show up constantly — build a comparison table.`,
    topics: topics([
      'Study designs (cohort, case-control, RCT)', 'Sensitivity, specificity, PPV/NPV', 'Bias & confounding',
      'Ethics & informed consent', 'Human development stages', 'Defense mechanisms', 'Sleep & stress physiology'
    ])
  },
  {
    name: 'Internal Medicine',
    notes: `# Internal Medicine — foundations

Adult disease, organized system by system, from presentation to management.

- Build one-page approach sheets per chief complaint (e.g. "chest pain", "dyspnea") that branch to differentials.`,
    topics: topics([
      'Cardiology essentials', 'Pulmonology essentials', 'Gastroenterology essentials', 'Nephrology essentials',
      'Endocrinology essentials', 'Hematology & oncology essentials', 'Rheumatology essentials', 'Infectious disease essentials'
    ])
  },
  {
    name: 'Surgery',
    notes: `# Surgery — foundations

Pre-op, intra-op, and post-op reasoning, plus the core operative differentials.

- Know the post-op fever timeline (the 5 W's) and the acute abdomen differential by quadrant cold.`,
    topics: topics([
      'Pre-operative assessment', 'Fluid & electrolyte management', 'Wound healing & surgical site infection',
      'Acute abdomen differentials', 'Trauma primary/secondary survey', 'Post-operative complications'
    ])
  },
  {
    name: 'Pediatrics',
    notes: `# Pediatrics — foundations

Growth, development, and disease presentations unique to children.

- Milestones by age band, immunization schedule, and growth curve interpretation are the recurring exam anchors.`,
    topics: topics([
      'Growth & developmental milestones', 'Immunization schedule', 'Neonatal jaundice & common neonatal issues',
      'Common pediatric infections', 'Congenital heart defects overview', 'Pediatric emergencies'
    ])
  },
  {
    name: 'OB/GYN',
    notes: `# OB/GYN — foundations

Pregnancy, labor, and gynecologic health.

- Normal antenatal timeline first (trimester-by-trimester), then layer on complications by trimester.`,
    topics: topics([
      'Normal pregnancy physiology', 'Antenatal care & screening', 'Labor & delivery stages',
      'Common pregnancy complications', 'Menstrual cycle physiology', 'Contraception methods', 'Common gynecologic conditions'
    ])
  },
  {
    name: 'Psychiatry',
    notes: `# Psychiatry — foundations

Diagnostic criteria and first-line management for major psychiatric conditions.

- Build a comparison grid: mood disorders vs. anxiety disorders vs. psychotic disorders — duration & key criteria side by side.`,
    topics: topics([
      'Mood disorders', 'Anxiety disorders', 'Psychotic disorders', 'Personality disorders',
      'Substance use disorders', 'Psychopharmacology basics', 'Mental status exam'
    ])
  },
  {
    name: 'Emergency Medicine',
    notes: `# Emergency Medicine — foundations

Rapid stabilization and time-critical differentials.

- ABCDE approach first, always. Then pattern-match the "can't miss" diagnosis for each chief complaint.`,
    topics: topics([
      'Primary survey (ABCDE)', 'Chest pain differentials', 'Shock — types & management',
      'Airway management basics', 'Toxidromes', 'Common ED procedures'
    ])
  }
];

function buildSeedSubjects() {
  return RAW_SUBJECTS.map((s, i) => ({
    id: 'subj_' + i.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    name: s.name,
    color: COLORS[i % COLORS.length],
    topics: s.topics.map((t) => ({
      id: 'top_' + Math.random().toString(36).slice(2, 10),
      name: t.name
    })),
    notes: s.notes,
    notesUpdatedBy: null,
    notesUpdatedAt: null
  }));
}

module.exports = { buildSeedSubjects, COLORS };
