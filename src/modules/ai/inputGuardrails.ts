/**
 * Cheap TS input guards ($0 libs). Block obvious prompt-injection / abuse
 * before user free-text is stored or can reach Claude.
 */

export class InputGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputGuardError';
  }
}

const DEFAULT_MAX = 2000;

/** Patterns that look like instruction override / jailbreak (case-insensitive). */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(all\s+)?(previous|prior|your)\s+(instructions?|rules?)/i,
  /you\s+are\s+now\s+(a|an|in)\b/i,
  /new\s+system\s+prompt/i,
  /system\s*:\s*/i,
  /<\s*\/?\s*system\s*>/i,
  /\[\[\s*system\s*\]\]/i,
  /\bDAN\b.*\bjailbreak\b/i,
  /jailbreak/i,
  /do\s+not\s+follow\s+(your|the)\s+(rules?|instructions?)/i,
  /override\s+(your|the)\s+(safety|instructions?|rules?)/i,
  /developer\s+mode\s+enabled/i,
  /ignore\s+the\s+above/i,
  /забудь\s+(все\s+)?(предыдущие|свои)\s+(инструкции|правила)/i,
  /игнорируй\s+(все\s+)?(предыдущие|свои)\s+(инструкции|правила)/i,
  /ты\s+теперь\s+(должен|будешь|бот|ассистент|ии|ai)\b/i,
  /новый\s+системный\s+промпт/i,
];

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export interface GuardTextOptions {
  maxLength?: number;
  field?: string;
}

export interface GuardOk {
  ok: true;
  text: string;
}

export interface GuardFail {
  ok: false;
  error: string;
}

export type GuardResult = GuardOk | GuardFail;

/** Normalize and validate user free-text. Does not call any paid API. */
export function guardUserText(raw: string, options: GuardTextOptions = {}): GuardResult {
  const maxLength = options.maxLength ?? DEFAULT_MAX;
  const field = options.field ?? 'text';

  if (typeof raw !== 'string') {
    return { ok: false, error: `${field}: must be a string` };
  }

  const text = raw.replace(CONTROL_CHARS, '').trim();
  if (text.length === 0) {
    return { ok: false, error: `${field}: empty` };
  }
  if (text.length > maxLength) {
    return { ok: false, error: `${field}: max ${maxLength} characters` };
  }

  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) {
      return {
        ok: false,
        error: `${field}: rejected — looks like prompt injection`,
      };
    }
  }

  return { ok: true, text };
}

/** Throw InputGuardError on failure (handy in handlers). */
export function assertSafeUserText(raw: string, options?: GuardTextOptions): string {
  const result = guardUserText(raw, options);
  if (!result.ok) throw new InputGuardError(result.error);
  return result.text;
}
