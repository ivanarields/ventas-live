export type NameMatchKind = 'empty' | 'exact' | 'same_words' | 'contained_words' | 'initials' | 'weak';

export interface NameMatchResult {
  score: number;
  kind: NameMatchKind;
  sharedWords: number;
}

const STOP_WORDS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y']);

export function normalizePersonName(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitName(raw: unknown) {
  const parts = normalizePersonName(raw).split(' ').filter(Boolean);
  const words = parts.filter(part => part.length >= 3 && !STOP_WORDS.has(part));
  const initials = parts.filter(part => part.length === 1);
  return { normalized: parts.join(' '), words, initials };
}

function sameWordSet(a: string[], b: string[]) {
  if (a.length !== b.length || a.length < 2) return false;
  const setB = new Set(b);
  return a.every(word => setB.has(word));
}

function containsAll(shortWords: string[], longWords: string[]) {
  const setLong = new Set(longWords);
  return shortWords.every(word => setLong.has(word));
}

function initialsMatch(initials: string[], words: string[]) {
  if (initials.length === 0) return true;
  const available = [...words];
  return initials.every(initial => {
    const index = available.findIndex(word => word.startsWith(initial));
    if (index < 0) return false;
    available.splice(index, 1);
    return true;
  });
}

export function scorePersonName(a: unknown, b: unknown): NameMatchResult {
  const left = splitName(a);
  const right = splitName(b);
  if (!left.normalized || !right.normalized) return { score: 0, kind: 'empty', sharedWords: 0 };
  if (left.normalized === right.normalized) return { score: 1, kind: 'exact', sharedWords: left.words.length };

  const shared = left.words.filter(word => right.words.includes(word)).length;
  const minWords = Math.min(left.words.length, right.words.length);

  if (sameWordSet(left.words, right.words)) {
    return { score: 0.98, kind: 'same_words', sharedWords: shared };
  }

  if (minWords >= 2) {
    const shorter = left.words.length <= right.words.length ? left.words : right.words;
    const longer = left.words.length > right.words.length ? left.words : right.words;
    if (containsAll(shorter, longer)) {
      return { score: 0.88, kind: 'contained_words', sharedWords: shared };
    }
  }

  const oneSideHasInitials = left.initials.length > 0 || right.initials.length > 0;
  if (oneSideHasInitials && shared >= 1) {
    const initialsOk = initialsMatch(left.initials, right.words) && initialsMatch(right.initials, left.words);
    if (initialsOk && shared + left.initials.length + right.initials.length >= 3) {
      return { score: 0.78, kind: 'initials', sharedWords: shared };
    }
  }

  if (minWords > 0 && shared > 0) {
    return { score: shared / Math.max(left.words.length, right.words.length), kind: 'weak', sharedWords: shared };
  }

  return { score: 0, kind: 'weak', sharedWords: 0 };
}

export function isStrongNameMatch(a: unknown, b: unknown): boolean {
  const result = scorePersonName(a, b);
  return result.score >= 0.96 || (result.kind === 'contained_words' && result.sharedWords >= 2);
}

export function isContextualNameMatch(a: unknown, b: unknown): boolean {
  const result = scorePersonName(a, b);
  return result.score >= 0.78 && result.sharedWords >= 1;
}
