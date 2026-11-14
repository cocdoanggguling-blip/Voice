import type { TtsVoiceInfo } from '../types/reader';

export type VoiceLangFilter = 'all' | 'id' | 'en_gb' | 'en_us' | 'en_all';

function getLangLower(voice: Pick<TtsVoiceInfo, 'lang' | 'name' | 'voiceURI'>): string {
  return (voice.lang || '').trim().toLowerCase().replace(/_/g, '-');
}

function getNameLower(voice: Pick<TtsVoiceInfo, 'name' | 'voiceURI'>): string {
  return (voice.name || voice.voiceURI || '').trim().toLowerCase();
}

export function isIndonesianVoice(voice: Pick<TtsVoiceInfo, 'lang' | 'name' | 'voiceURI'>): boolean {
  const lang = getLangLower(voice);
  if (
    lang === 'id' ||
    lang.startsWith('id-') ||
    lang === 'in' ||
    lang.startsWith('in-') ||
    lang === 'ind' ||
    lang.startsWith('ind-')
  ) {
    return true;
  }
  if (!lang || lang === 'und') {
    const name = getNameLower(voice);
    return name.startsWith('id-') || name.startsWith('in-') || name.startsWith('ind-');
  }
  return false;
}

export function isEnglishVoice(voice: Pick<TtsVoiceInfo, 'lang' | 'name' | 'voiceURI'>): boolean {
  const lang = getLangLower(voice);
  if (lang === 'en' || lang.startsWith('en-') || lang === 'eng' || lang.startsWith('eng-')) {
    return true;
  }
  if (!lang || lang === 'und') {
    const name = getNameLower(voice);
    return name.startsWith('en-') || name.startsWith('eng-');
  }
  return false;
}

export function isUkEnglishVoice(voice: Pick<TtsVoiceInfo, 'lang' | 'name' | 'voiceURI'>): boolean {
  const lang = getLangLower(voice);
  const name = getNameLower(voice);
  return lang === 'en-gb' || lang.startsWith('en-gb-') || lang.startsWith('eng-gb') || name.startsWith('en-gb-');
}

export function isUsEnglishVoice(voice: Pick<TtsVoiceInfo, 'lang' | 'name' | 'voiceURI'>): boolean {
  const lang = getLangLower(voice);
  const name = getNameLower(voice);
  return lang === 'en-us' || lang.startsWith('en-us-') || lang.startsWith('eng-us') || name.startsWith('en-us-');
}

export function isCoreEnglishVoice(voice: Pick<TtsVoiceInfo, 'lang' | 'name' | 'voiceURI'>): boolean {
  const lang = getLangLower(voice);
  return (
    isUkEnglishVoice(voice) ||
    isUsEnglishVoice(voice) ||
    lang === 'en' ||
    lang === 'eng'
  );
}

export function isAllowedTtsVoice(voice: Pick<TtsVoiceInfo, 'lang' | 'name' | 'voiceURI'>): boolean {
  return isIndonesianVoice(voice) || isEnglishVoice(voice);
}

export function isAllowedTtsVoiceLang(lang: string): boolean {
  return isAllowedTtsVoice({ lang, name: '', voiceURI: '' });
}

export function normalizeVoiceLangFilter(rawFilter: string | undefined): VoiceLangFilter {
  if (
    rawFilter === 'id' ||
    rawFilter === 'en_gb' ||
    rawFilter === 'en_us' ||
    rawFilter === 'en_all'
  ) {
    return rawFilter;
  }
  if (rawFilter === 'en') {
    return 'en_all';
  }
  return 'all';
}

function voiceGroupRank(voice: TtsVoiceInfo): number {
  if (isIndonesianVoice(voice)) return 0;
  if (isUkEnglishVoice(voice)) return 1;
  if (isUsEnglishVoice(voice)) return 2;
  if (isCoreEnglishVoice(voice)) return 3;
  return 4;
}

export function filterAndSortTtsVoices(voices: TtsVoiceInfo[], rawFilter: string): TtsVoiceInfo[] {
  const filter = normalizeVoiceLangFilter(rawFilter);
  const seen = new Set<string>();
  const matched: TtsVoiceInfo[] = [];

  for (const voice of voices) {
    if (!voice?.voiceURI || seen.has(voice.voiceURI)) continue;
    if (!isAllowedTtsVoice(voice)) continue;

    let keep = false;
    if (filter === 'all') {
      keep = isIndonesianVoice(voice) || isCoreEnglishVoice(voice);
    } else if (filter === 'id') {
      keep = isIndonesianVoice(voice);
    } else if (filter === 'en_gb') {
      keep = isUkEnglishVoice(voice);
    } else if (filter === 'en_us') {
      keep = isUsEnglishVoice(voice);
    } else {
      keep = isEnglishVoice(voice);
    }

    if (keep) {
      seen.add(voice.voiceURI);
      matched.push(voice);
    }
  }

  return matched.sort((a, b) => {
    const rankDiff = voiceGroupRank(a) - voiceGroupRank(b);
    if (rankDiff !== 0) return rankDiff;
    if (a.localService !== b.localService) return a.localService ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function formatVoiceEngineLabel(voice: TtsVoiceInfo): string {
  const pkg = (voice.engineName || '').toLowerCase();
  if (pkg.includes('com.google.android.tts')) return 'Google';
  if (pkg.includes('samsung')) return 'Samsung';
  if (pkg.includes('sherpa')) return 'Sherpa';
  return '';
}
