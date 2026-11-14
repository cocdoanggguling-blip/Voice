const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U']);
const DIPHTHONGS = new Set(['ai', 'au', 'oi', 'ei']);
const DIGRAPHS = new Set(['ng', 'ny', 'kh', 'sy']);

function isVowel(ch: string): boolean {
  return VOWELS.has(ch);
}

/**
 * Splits a single Indonesian word into approximate syllables and joins them
 * with soft hyphens (\u00AD) for clean justified typography without rivers.
 */
export function hyphenateIndonesianWord(word: string): string {
  if (word.length < 5 || !/^[A-Za-zÀ-ÿ]+$/.test(word)) {
    return word;
  }

  const lower = word.toLowerCase();
  const vowelPositions: number[] = [];

  for (let i = 0; i < lower.length; i++) {
    if (isVowel(lower[i])) {
      // Skip second vowel of a diphthong
      if (i > 0 && DIPHTHONGS.has(lower.slice(i - 1, i + 1))) {
        continue;
      }
      vowelPositions.push(i);
    }
  }

  if (vowelPositions.length < 2) {
    return word;
  }

  const breakPoints: number[] = [];

  for (let k = 0; k < vowelPositions.length - 1; k++) {
    const v1 = vowelPositions[k];
    const v2 = vowelPositions[k + 1];
    const v1End =
      v1 + 1 < lower.length && DIPHTHONGS.has(lower.slice(v1, v1 + 2)) ? v1 + 1 : v1;
    const gap = v2 - v1End - 1;

    let splitAt = -1;
    if (gap === 0) {
      splitAt = v2;
    } else if (gap === 1) {
      splitAt = v1End + 1;
    } else if (gap === 2) {
      const pair = lower.slice(v1End + 1, v1End + 3);
      splitAt = DIGRAPHS.has(pair) ? v1End + 1 : v1End + 2;
    } else {
      const pair = lower.slice(v1End + 2, v1End + 4);
      splitAt = DIGRAPHS.has(pair) ? v1End + 2 : v1End + 2;
    }

    if (splitAt >= 2 && splitAt <= word.length - 2) {
      breakPoints.push(splitAt);
    }
  }

  if (breakPoints.length === 0) return word;

  let out = '';
  let prev = 0;
  for (const bp of breakPoints) {
    if (bp > prev) {
      out += word.slice(prev, bp) + '\u00AD';
      prev = bp;
    }
  }
  out += word.slice(prev);
  return out;
}

export function applyIndonesianHyphenation(text: string): string {
  return text.replace(/[A-Za-zÀ-ÿ]{5,}/g, (match) => hyphenateIndonesianWord(match));
}
