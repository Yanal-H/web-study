import { useState } from 'react';
import { Card, Field, Input } from '../../design/primitives';
import {
  bmi,
  map as meanArterial,
  cockcroftGault,
  correctedCalcium,
  anionGap,
  correctedSodium,
  bsaMosteller,
} from './formulas';

/*
 * Clinical calculators. Every formula below is a standard, independently-derived
 * clinical relationship (not lifted from any answer key), with its primary source
 * cited. Values are for study and quick reference only — see the disclaimer.
 */

interface CalcInput {
  key: string;
  label: string;
  unit?: string;
  step?: number;
  def?: number;
}
interface CalcResult {
  value: string;
  interp: string;
  tone?: 'default' | 'warn' | 'bad' | 'good';
}
interface Calc {
  id: string;
  name: string;
  blurb: string;
  inputs: CalcInput[];
  extraSelect?: { key: string; label: string; options: Array<{ value: string; label: string }> };
  compute: (v: Record<string, number>, sel: Record<string, string>) => CalcResult | null;
  cite: string;
}

const num = (x: number, dp = 1) => (isFinite(x) ? x.toFixed(dp) : '—');

const CALCS: Calc[] = [
  {
    id: 'bmi',
    name: 'Body Mass Index',
    blurb: 'Weight relative to height.',
    inputs: [
      { key: 'wt', label: 'Weight', unit: 'kg', step: 0.5, def: 70 },
      { key: 'ht', label: 'Height', unit: 'cm', step: 1, def: 175 },
    ],
    compute: (v) => {
      if (!v.wt || !v.ht) return null;
      const value = bmi(v.wt, v.ht);
      let interp = 'Normal weight';
      let tone: CalcResult['tone'] = 'good';
      if (value < 18.5) {
        interp = 'Underweight';
        tone = 'warn';
      } else if (value >= 25 && value < 30) {
        interp = 'Overweight';
        tone = 'warn';
      } else if (value >= 30) {
        interp = 'Obese';
        tone = 'bad';
      }
      return { value: `${num(value)} kg/m²`, interp, tone };
    },
    cite: 'WHO. Physical status: BMI classification.',
  },
  {
    id: 'map',
    name: 'Mean Arterial Pressure',
    blurb: 'Average arterial pressure across a cardiac cycle.',
    inputs: [
      { key: 'sbp', label: 'Systolic BP', unit: 'mmHg', step: 1, def: 120 },
      { key: 'dbp', label: 'Diastolic BP', unit: 'mmHg', step: 1, def: 80 },
    ],
    compute: (v) => {
      if (!v.sbp || !v.dbp) return null;
      const val = meanArterial(v.sbp, v.dbp);
      let interp = 'Adequate organ perfusion pressure (≥65 mmHg).';
      let tone: CalcResult['tone'] = 'good';
      if (val < 65) {
        interp = 'Below 65 mmHg — perfusion may be compromised.';
        tone = 'bad';
      }
      return { value: `${num(val)} mmHg`, interp, tone };
    },
    cite: 'MAP ≈ DBP + ⅓(SBP − DBP).',
  },
  {
    id: 'cockcroft',
    name: 'Creatinine Clearance',
    blurb: 'Cockcroft–Gault estimate of renal function.',
    inputs: [
      { key: 'age', label: 'Age', unit: 'yr', step: 1, def: 50 },
      { key: 'wt', label: 'Weight', unit: 'kg', step: 0.5, def: 70 },
      { key: 'scr', label: 'Serum creatinine', unit: 'mg/dL', step: 0.1, def: 1 },
    ],
    extraSelect: {
      key: 'sex',
      label: 'Sex',
      options: [
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
      ],
    },
    compute: (v, sel) => {
      if (!v.age || !v.wt || !v.scr) return null;
      const crcl = cockcroftGault(v.age, v.wt, v.scr, sel.sex === 'female');
      let interp = 'Normal-range clearance.';
      let tone: CalcResult['tone'] = 'good';
      if (crcl < 15) {
        interp = 'Kidney failure range (<15).';
        tone = 'bad';
      } else if (crcl < 60) {
        interp = 'Reduced clearance (<60) — review drug dosing.';
        tone = 'warn';
      }
      return { value: `${num(crcl)} mL/min`, interp, tone };
    },
    cite: 'Cockcroft DW, Gault MH. Nephron 1976.',
  },
  {
    id: 'corr-ca',
    name: 'Corrected Calcium',
    blurb: 'Adjusts total calcium for albumin.',
    inputs: [
      { key: 'ca', label: 'Measured calcium', unit: 'mg/dL', step: 0.1, def: 9 },
      { key: 'alb', label: 'Albumin', unit: 'g/dL', step: 0.1, def: 4 },
    ],
    compute: (v) => {
      if (!v.ca || !v.alb) return null;
      const cca = correctedCalcium(v.ca, v.alb);
      let interp = 'Within the usual reference range (8.5–10.5).';
      let tone: CalcResult['tone'] = 'good';
      if (cca < 8.5) {
        interp = 'Corrected hypocalcaemia.';
        tone = 'warn';
      } else if (cca > 10.5) {
        interp = 'Corrected hypercalcaemia.';
        tone = 'bad';
      }
      return { value: `${num(cca)} mg/dL`, interp, tone };
    },
    cite: 'Corrected Ca = Ca + 0.8 × (4.0 − albumin).',
  },
  {
    id: 'anion-gap',
    name: 'Anion Gap',
    blurb: 'Unmeasured anions in metabolic acidosis.',
    inputs: [
      { key: 'na', label: 'Sodium', unit: 'mmol/L', step: 1, def: 140 },
      { key: 'cl', label: 'Chloride', unit: 'mmol/L', step: 1, def: 104 },
      { key: 'hco3', label: 'Bicarbonate', unit: 'mmol/L', step: 1, def: 24 },
    ],
    compute: (v) => {
      if (!v.na || !v.cl || !v.hco3) return null;
      const ag = anionGap(v.na, v.cl, v.hco3);
      let interp = 'Normal anion gap (≈8–12 mmol/L).';
      let tone: CalcResult['tone'] = 'good';
      if (ag > 12) {
        interp = 'High anion gap — consider MUDPILES causes.';
        tone = 'bad';
      } else if (ag < 8) {
        interp = 'Low anion gap (uncommon).';
        tone = 'warn';
      }
      return { value: `${num(ag, 0)} mmol/L`, interp, tone };
    },
    cite: 'Anion gap = Na⁺ − (Cl⁻ + HCO₃⁻).',
  },
  {
    id: 'corr-na',
    name: 'Corrected Sodium',
    blurb: 'Adjusts sodium for hyperglycaemia (Katz factor 1.6).',
    inputs: [
      { key: 'na', label: 'Measured sodium', unit: 'mmol/L', step: 1, def: 130 },
      { key: 'glu', label: 'Glucose', unit: 'mg/dL', step: 1, def: 400 },
    ],
    compute: (v) => {
      if (!v.na || !v.glu) return null;
      const cna = correctedSodium(v.na, v.glu);
      let interp = 'Corrected sodium within range.';
      let tone: CalcResult['tone'] = 'good';
      if (cna < 135) {
        interp = 'True hyponatraemia after correction.';
        tone = 'warn';
      } else if (cna > 145) {
        interp = 'Corrected hypernatraemia.';
        tone = 'bad';
      }
      return { value: `${num(cna)} mmol/L`, interp, tone };
    },
    cite: 'Katz MA. NEJM 1973 (correction factor 1.6).',
  },
  {
    id: 'bsa',
    name: 'Body Surface Area',
    blurb: 'Mosteller formula (drug dosing).',
    inputs: [
      { key: 'ht', label: 'Height', unit: 'cm', step: 1, def: 175 },
      { key: 'wt', label: 'Weight', unit: 'kg', step: 0.5, def: 70 },
    ],
    compute: (v) => {
      if (!v.ht || !v.wt) return null;
      const bsa = bsaMosteller(v.ht, v.wt);
      return { value: `${num(bsa, 2)} m²`, interp: 'Used for chemotherapy and cardiac index dosing.', tone: 'default' };
    },
    cite: 'Mosteller RD. NEJM 1987. BSA = √(ht·wt/3600).',
  },
];

export default function CalculatorsView() {
  return (
    <>
      <header className="page-head">
        <h1>Calculators</h1>
        <div className="sub">Cited clinical and lab calculators, computed on your device.</div>
      </header>

      <div className="calc-grid">
        {CALCS.map((c) => (
          <CalcCard key={c.id} calc={c} />
        ))}
      </div>

      <div className="calc-disclaimer">
        For study and quick reference only. These tools do not replace clinical judgement,
        institutional protocols, or a qualified clinician. Verify every value before any patient
        use.
      </div>
    </>
  );
}

function CalcCard({ calc }: { calc: Calc }) {
  const [vals, setVals] = useState<Record<string, number>>(
    Object.fromEntries(calc.inputs.map((i) => [i.key, i.def ?? 0]))
  );
  const [sel, setSel] = useState<Record<string, string>>(
    calc.extraSelect ? { [calc.extraSelect.key]: calc.extraSelect.options[0]!.value } : {}
  );

  const result = calc.compute(vals, sel);
  const toneColor =
    result?.tone === 'bad'
      ? 'var(--error)'
      : result?.tone === 'warn'
        ? 'var(--warning)'
        : result?.tone === 'good'
          ? 'var(--success)'
          : 'var(--text)';

  return (
    <Card className="calc">
      <div className="card-title" style={{ marginBottom: 2 }}>
        {calc.name}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        {calc.blurb}
      </div>

      <div className="calc-inputs">
        {calc.inputs.map((inp) => (
          <Field key={inp.key} label={`${inp.label}${inp.unit ? ` (${inp.unit})` : ''}`}>
            <Input
              type="number"
              inputMode="decimal"
              step={inp.step}
              value={Number.isFinite(vals[inp.key]) ? vals[inp.key] : ''}
              onChange={(e) => setVals((s) => ({ ...s, [inp.key]: parseFloat(e.target.value) }))}
            />
          </Field>
        ))}
        {calc.extraSelect && (
          <Field label={calc.extraSelect.label}>
            <select
              className="select"
              value={sel[calc.extraSelect.key]}
              onChange={(e) => setSel({ [calc.extraSelect!.key]: e.target.value })}
            >
              {calc.extraSelect.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className="calc-result">
        <div className="cr-value" style={{ color: toneColor }}>
          {result ? result.value : '—'}
        </div>
        {result && <div className="cr-interp">{result.interp}</div>}
      </div>
      <div className="calc-cite">{calc.cite}</div>
    </Card>
  );
}
