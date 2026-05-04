/**
 * Per-user invoice numbering (manual vs automatic). User is responsible for fiscal compliance.
 */
export type InvoiceNumberingMode = 'manual' | 'auto';

export type InvoiceNumberingState = {
  mode: InvoiceNumberingMode;
  /** Text before the numeric part (e.g. "INV-"). */
  prefix: string;
  /** Text after the numeric part. */
  suffix: string;
  /** 0 = no zero-padding; otherwise left-pad count with zeros (e.g. 4 → 0042). */
  padLength: number;
  /** If true, inserts `${year}-` after prefix and before the padded sequence. */
  includeYearInNumber: boolean;
  /** If true, reset sequence to 1 when the calendar year changes. */
  resetCounterEachYear: boolean;
  /** Next value to use for the numeric segment (before increment after assign). */
  nextSequence: number;
  /** Year the current nextSequence applies to (used when resetCounterEachYear is true). */
  sequenceYear: number | null;
};

export function defaultInvoiceNumbering(): InvoiceNumberingState {
  return {
    mode: 'auto',
    prefix: '',
    suffix: '',
    padLength: 0,
    includeYearInNumber: false,
    resetCounterEachYear: false,
    nextSequence: 1,
    sequenceYear: null,
  };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function normalizeInvoiceNumberingRaw(raw: unknown): InvoiceNumberingState {
  const d = defaultInvoiceNumbering();
  if (raw === null || raw === undefined) return d;
  if (typeof raw !== 'object' || Array.isArray(raw)) return d;
  const o = raw as Record<string, unknown>;

  if (o.mode === 'manual' || o.mode === 'auto') {
    d.mode = o.mode;
  }
  if (typeof o.prefix === 'string') d.prefix = o.prefix.slice(0, 32);
  if (typeof o.suffix === 'string') d.suffix = o.suffix.slice(0, 32);
  if (typeof o.padLength === 'number') d.padLength = clampInt(o.padLength, 0, 12);
  else if (typeof o.padLength === 'string')
    d.padLength = clampInt(parseInt(o.padLength, 10), 0, 12);
  if (typeof o.includeYearInNumber === 'boolean') d.includeYearInNumber = o.includeYearInNumber;
  if (typeof o.resetCounterEachYear === 'boolean') d.resetCounterEachYear = o.resetCounterEachYear;
  if (typeof o.nextSequence === 'number') d.nextSequence = Math.max(1, Math.trunc(o.nextSequence));
  else if (typeof o.nextSequence === 'string') {
    const p = parseInt(o.nextSequence, 10);
    if (Number.isFinite(p)) d.nextSequence = Math.max(1, p);
  }
  if (o.sequenceYear === null) d.sequenceYear = null;
  else if (typeof o.sequenceYear === 'number') d.sequenceYear = Math.trunc(o.sequenceYear);
  else if (typeof o.sequenceYear === 'string') {
    const y = parseInt(o.sequenceYear, 10);
    d.sequenceYear = Number.isFinite(y) ? y : null;
  }

  return d;
}

/** Align sequence with issue year when yearly reset is enabled. */
function stateForIssueDate(
  state: InvoiceNumberingState,
  issueDate: Date,
): InvoiceNumberingState {
  const y = issueDate.getFullYear();
  const s: InvoiceNumberingState = { ...state };
  if (s.resetCounterEachYear) {
    if (s.sequenceYear === null) {
      s.sequenceYear = y;
    } else if (s.sequenceYear !== y) {
      s.nextSequence = 1;
      s.sequenceYear = y;
    }
  }
  return s;
}

function formatNumericPart(state: InvoiceNumberingState, issueDate: Date): string {
  const s = stateForIssueDate(state, issueDate);
  const y = issueDate.getFullYear();
  const n = s.nextSequence;
  const numeric =
    s.padLength > 0 ? String(n).padStart(s.padLength, '0') : String(n);
  const yearPart = s.includeYearInNumber ? `${y}-` : '';
  return `${s.prefix}${yearPart}${numeric}${s.suffix}`;
}

/** Next number string without consuming (auto mode only). */
export function peekNextInvoiceNumber(raw: unknown, issueDate: Date): string | null {
  const norm = normalizeInvoiceNumberingRaw(raw);
  if (norm.mode !== 'auto') return null;
  return formatNumericPart(norm, issueDate);
}

/** Assign one number and return updated numbering JSON for persistence (auto mode only). */
export function consumeNextInvoiceNumber(
  raw: unknown,
  issueDate: Date,
): { invoiceNumber: string; updatedState: InvoiceNumberingState } | null {
  const norm = normalizeInvoiceNumberingRaw(raw);
  if (norm.mode !== 'auto') return null;

  const aligned = stateForIssueDate(norm, issueDate);
  const invoiceNumber = formatNumericPart(aligned, issueDate);
  const y = issueDate.getFullYear();

  const updatedState: InvoiceNumberingState = {
    ...aligned,
    nextSequence: aligned.nextSequence + 1,
    sequenceYear: aligned.sequenceYear ?? y,
  };

  return { invoiceNumber, updatedState };
}

/** Validate body from API before save (throws message key for Nest). */
export function assertInvoiceNumberingStateValid(state: InvoiceNumberingState): void {
  if (state.mode !== 'manual' && state.mode !== 'auto') {
    throw new Error('INVALID_NUMBERING_MODE');
  }
  if (state.padLength < 0 || state.padLength > 12) throw new Error('INVALID_PAD_LENGTH');
  if (state.nextSequence < 1) throw new Error('INVALID_NEXT_SEQUENCE');
  if (state.prefix.length > 32 || state.suffix.length > 32) {
    throw new Error('INVALID_PREFIX_SUFFIX');
  }
}
