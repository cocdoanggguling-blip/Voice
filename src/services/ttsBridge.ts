import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type {
  OrientationLockMode,
  ParsedParagraph,
  SentenceSegment,
  SpeechChunk,
  TextReplaceRule,
  TtsEngineCapabilities,
  TtsSettings,
  TtsVoiceInfo,
} from '../types/reader';
import type { BookReplaceContext } from '../utils/textReplace';
import {
  buildSpeechChunksFromOffset,
  estimateChunkDurationMs,
  findLocationAtChapterOffset,
  findSentenceStartForOffset,
  mapChunkLocalOffsetToChapterOffset,
} from '../utils/textSegmentation';
import { isAllowedTtsVoice, isEnglishVoice, isIndonesianVoice } from '../utils/ttsVoices';

export interface NovelVoiceTtsPluginInterface {
  getEngineInfo(): Promise<TtsEngineCapabilities>;
  getVoices(): Promise<{ voices: TtsVoiceInfo[] }>;
  configureSession(options: { voiceURI?: string; rate: number; pitch: number }): Promise<void>;
  speak(options: { text: string; utteranceId: string; queueMode: 0 | 1; volume?: number }): Promise<void>;
  playSilent(options: { durationMs: number; utteranceId: string }): Promise<void>;
  stop(): Promise<void>;
  openTtsSettings(): Promise<{ opened: boolean }>;
  openBatteryOptimizationSettings(): Promise<{ opened: boolean }>;
  setScreenBrightness(options: { brightness: number }): Promise<void>;
  setKeepScreenOn(options: { enabled: boolean }): Promise<void>;
  setOrientationLock(options: { mode: OrientationLockMode }): Promise<void>;
  consumePendingOpenEpub(): Promise<{ fileName?: string; base64?: string; filePath?: string } | null>;
  checkNotificationPermission(): Promise<{ granted: boolean; sdkInt: number }>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  startForegroundService(options: {
    bookTitle: string;
    chapterTitle: string;
    sentencePreview: string;
    isPlaying: boolean;
  }): Promise<void>;
  updateNotification(options: {
    bookTitle: string;
    chapterTitle: string;
    sentencePreview: string;
    isPlaying: boolean;
  }): Promise<void>;
  stopForegroundService(): Promise<void>;
  addListener(
    eventName: 'utteranceStart',
    listenerFunc: (data: { utteranceId: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'rangeStart',
    listenerFunc: (data: { utteranceId: string; start: number; end: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'utteranceDone',
    listenerFunc: (data: { utteranceId: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'mediaAction',
    listenerFunc: (data: { action: 'play' | 'pause' | 'next' | 'prev' | 'stop' }) => void
  ): Promise<PluginListenerHandle>;
}

const NovelVoiceTts = registerPlugin<NovelVoiceTtsPluginInterface>('NovelVoiceTts');

export interface NotificationPermissionStatus {
  granted: boolean;
  sdkInt: number;
  isNative: boolean;
}

export async function getTtsEngineCapabilities(): Promise<TtsEngineCapabilities> {
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await NovelVoiceTts.getEngineInfo();
      return {
        maxSpeechInputLength: info.maxSpeechInputLength > 0 ? info.maxSpeechInputLength : 3500,
        ssmlSupported: Boolean(info.ssmlSupported),
        enginePackage: info.enginePackage,
      };
    } catch {
      return { maxSpeechInputLength: 3500, ssmlSupported: false };
    }
  }
  return { maxSpeechInputLength: 3500, ssmlSupported: false };
}

export async function getSystemVoices(): Promise<TtsVoiceInfo[]> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await NovelVoiceTts.getVoices();
      if (res?.voices?.length) {
        return res.voices.filter((v) => isAllowedTtsVoice(v));
      }
    } catch {
      // Ignore
    }
    return [];
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }

  const readVoices = () =>
    window.speechSynthesis
      .getVoices()
      .map((v) => ({
        voiceURI: v.voiceURI,
        name: v.name,
        lang: v.lang,
        localService: v.localService,
      }))
      .filter((v) => isAllowedTtsVoice(v));

  const immediate = readVoices();
  if (immediate.length > 0) return immediate;

  return new Promise<TtsVoiceInfo[]>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(readVoices());
    };
    const timer = window.setTimeout(finish, 450);
    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(timer);
      finish();
    };
  });
}

export async function previewVoiceSample(
  voiceURI: string,
  rate = 1.0,
  pitch = 1.0,
  volume = 1.0,
  sampleText = 'Halo, ini adalah pratinjau suara NovelVoice untuk membaca buku Anda.'
): Promise<void> {
  const clampedRate = Math.max(0.5, Math.min(3.0, rate));
  const clampedPitch = Math.max(0.5, Math.min(2.0, pitch));
  const clampedVol = Math.max(0.05, Math.min(1.0, volume));

  if (Capacitor.isNativePlatform()) {
    await NovelVoiceTts.stop().catch(() => undefined);
    await NovelVoiceTts.configureSession({
      voiceURI,
      rate: clampedRate,
      pitch: clampedPitch,
    }).catch(() => undefined);
    await NovelVoiceTts.speak({
      text: sampleText,
      utteranceId: `preview_main_${Date.now()}`,
      queueMode: 0,
      volume: clampedVol,
    }).catch(() => undefined);
    return;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(sampleText);
    utt.rate = clampedRate;
    utt.pitch = clampedPitch;
    utt.volume = clampedVol;
    if (voiceURI) {
      const match = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI);
      if (match) {
        utt.voice = match;
        utt.lang = match.lang;
      }
    }
    window.speechSynthesis.speak(utt);
  }
}

export async function openNativeTtsSettings(): Promise<{ opened: boolean; message?: string }> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await NovelVoiceTts.openTtsSettings();
      return { opened: Boolean(res?.opened) };
    } catch {
      return {
        opened: false,
        message: 'Tidak dapat membuka pengaturan TTS perangkat secara otomatis.',
      };
    }
  }
  return {
    opened: false,
    message:
      'Di Android (APK), tombol ini langsung membuka Pengaturan Text-to-Speech sistem (Intent com.android.settings.TTS_SETTINGS) untuk memasang/mengganti mesin seperti Google TTS atau Sherpa.',
  };
}

export async function openBatteryOptimizationSettings(): Promise<{ opened: boolean; message?: string }> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await NovelVoiceTts.openBatteryOptimizationSettings();
      return { opened: Boolean(res?.opened) };
    } catch {
      return {
        opened: false,
        message: 'Buka Setelan Android > Baterai > NovelVoice > Tanpa pembatasan.',
      };
    }
  }
  return {
    opened: false,
    message:
      'Di Android (APK), tombol ini mengarahkan ke pengaturan pengecualian optimasi baterai agar pembacaan TTS latar belakang tidak dihentikan sistem.',
  };
}

export async function syncNativeScreenSettings(options: {
  brightness: number;
  keepScreenOn: boolean;
  orientationLock: OrientationLockMode;
}): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Promise.all([
      NovelVoiceTts.setScreenBrightness({ brightness: options.brightness }).catch(() => undefined),
      NovelVoiceTts.setKeepScreenOn({ enabled: options.keepScreenOn }).catch(() => undefined),
      NovelVoiceTts.setOrientationLock({ mode: options.orientationLock }).catch(() => undefined),
    ]);
    return;
  }

  // Web Screen Orientation Lock & WakeLock best-effort
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && options.keepScreenOn) {
    try {
      await (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<unknown> } }).wakeLock.request('screen');
    } catch {
      // Ignore permission rejection on web
    }
  }
  if (typeof screen !== 'undefined' && 'orientation' in screen) {
    try {
      const orient = screen.orientation as unknown as {
        lock?: (mode: string) => Promise<void>;
        unlock?: () => void;
      };
      if (options.orientationLock === 'auto') {
        orient.unlock?.();
      } else {
        await orient.lock?.(options.orientationLock);
      }
    } catch {
      // Orientation lock requires fullscreen on desktop browsers
    }
  }
}

export async function consumePendingAndroidOpenEpub(): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const res = await NovelVoiceTts.consumePendingOpenEpub();
    if (!res?.base64) return null;
    const bin = atob(res.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new File([bytes], res.fileName || 'Buku-Impor.epub', {
      type: 'application/epub+zip',
    });
  } catch {
    return null;
  }
}

export async function checkAndroidNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!Capacitor.isNativePlatform()) {
    return { granted: true, sdkInt: 0, isNative: false };
  }
  try {
    const res = await NovelVoiceTts.checkNotificationPermission();
    return { granted: res.granted, sdkInt: res.sdkInt, isNative: true };
  } catch {
    return { granted: false, sdkInt: 33, isNative: true };
  }
}

export async function requestAndroidNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const res = await NovelVoiceTts.requestNotificationPermission();
    return Boolean(res.granted);
  } catch {
    return false;
  }
}

export interface TtsPlaybackCallbacks {
  onHighlight: (sentenceIndex: number, wordIndex: number, charOffset: number) => void;
  onPlaybackStateChange: (isPlaying: boolean) => void;
  onChapterComplete: () => void;
  onSleepTimerTick: (remainingSeconds: number | null) => void;
}

const LOOKAHEAD_DEPTH = 2;

export class TtsPlaybackController {
  private paragraphs: ParsedParagraph[] = [];
  private allSentences: SentenceSegment[] = [];
  private availableVoices: TtsVoiceInfo[] = [];
  private settings: TtsSettings;
  private capabilities: TtsEngineCapabilities = {
    maxSpeechInputLength: 3500,
    ssmlSupported: false,
  };
  private bookTitle = '';
  private chapterTitle = '';
  private chapterIndex = 0;
  private bookCtx: BookReplaceContext = { bookId: '' };
  private ttsOnlyRules: TextReplaceRule[] = [];
  private callbacks: TtsPlaybackCallbacks;

  private isPlaying = false;
  private currentCharOffset = 0;
  private currentSentenceIndex = 0;
  private currentWordIndex = 0;
  private sessionToken = 0;

  // Active lookahead queue state
  private chunks: SpeechChunk[] = [];
  private nextEnqueueIdx = 0;
  private activeChunkIdx = 0;
  private utteranceToChunkIdx = new Map<string, number>();
  private sawBoundaryForCurrentChunk = false;
  private webFallbackMode = false;
  private activeSessionVoiceURI = '';
  private effectiveVolumeMultiplier = 1.0;

  // Timers
  private fallbackProgressTimer: number | null = null;
  private webPauseTimer: number | null = null;
  private sleepInterval: number | null = null;
  private sleepRemainingSec: number | null = null;
  private stopAtEndOfChapter = false;

  private nativeListeners: PluginListenerHandle[] = [];

  constructor(settings: TtsSettings, callbacks: TtsPlaybackCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
    void this.initEngineCapabilities();
    void this.setupNativeListeners();
  }

  private async initEngineCapabilities() {
    this.capabilities = await getTtsEngineCapabilities();
  }

  public setCapabilities(caps: TtsEngineCapabilities) {
    this.capabilities = caps;
  }

  public setAvailableVoices(voices: TtsVoiceInfo[]) {
    this.availableVoices = voices;
  }

  private async setupNativeListeners() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const startHandle = await NovelVoiceTts.addListener('utteranceStart', (ev) => {
        if (!this.isPlaying) return;
        const cIdx = this.utteranceToChunkIdx.get(ev.utteranceId);
        if (cIdx === undefined) return;
        const chunk = this.chunks[cIdx];
        if (!chunk) return;
        this.onChunkBecameActive(cIdx, chunk, this.sessionToken);
      });

      const rangeHandle = await NovelVoiceTts.addListener('rangeStart', (ev) => {
        if (!this.isPlaying) return;
        const cIdx = this.utteranceToChunkIdx.get(ev.utteranceId);
        if (cIdx === undefined) return;
        const chunk = this.chunks[cIdx];
        if (!chunk) return;
        this.handleBoundaryOffset(chunk, ev.start);
      });

      const doneHandle = await NovelVoiceTts.addListener('utteranceDone', (ev) => {
        const cIdx = this.utteranceToChunkIdx.get(ev.utteranceId);
        if (cIdx === undefined) return;
        this.utteranceToChunkIdx.delete(ev.utteranceId);
        if (!this.isPlaying) return;
        this.handleChunkFinished(cIdx, this.sessionToken);
      });

      const mediaHandle = await NovelVoiceTts.addListener('mediaAction', (ev) => {
        if (ev.action === 'pause') this.pause();
        else if (ev.action === 'play') this.resume();
        else if (ev.action === 'next') this.nextSentence();
        else if (ev.action === 'prev') this.prevSentence();
        else if (ev.action === 'stop') this.stop();
      });

      this.nativeListeners.push(startHandle, rangeHandle, doneHandle, mediaHandle);
    } catch {
      // Ignore on web
    }
  }

  public setBookContext(
    bookTitle: string,
    chapterTitle: string,
    paragraphs: ParsedParagraph[],
    allSentences: SentenceSegment[],
    initialCharOffset = 0,
    chapterIndex = 0,
    bookCtx?: BookReplaceContext
  ) {
    this.bookTitle = bookTitle;
    this.chapterTitle = chapterTitle;
    this.paragraphs = paragraphs;
    this.allSentences = allSentences;
    this.chapterIndex = chapterIndex;
    if (bookCtx) {
      this.bookCtx = bookCtx;
    }
    this.syncCursorFromOffset(initialCharOffset);
  }

  public setTtsReplaceRules(rules: TextReplaceRule[], bookCtx?: BookReplaceContext) {
    this.ttsOnlyRules = rules.filter((r) => r.ttsOnly && r.enabled);
    if (bookCtx) this.bookCtx = bookCtx;
    if (this.isPlaying) {
      void this.playFromOffset(this.currentCharOffset);
    }
  }

  public getQueuedChunks(): SpeechChunk[] {
    return this.chunks;
  }

  public updateSettings(nextSettings: TtsSettings) {
    const prev = this.settings;
    this.settings = nextSettings;

    if (prev.sleepTimerMinutes !== nextSettings.sleepTimerMinutes) {
      this.configureSleepTimer(nextSettings.sleepTimerMinutes);
    }

    const playbackParamsChanged =
      prev.rate !== nextSettings.rate ||
      prev.pitch !== nextSettings.pitch ||
      prev.volume !== nextSettings.volume ||
      prev.voiceURI !== nextSettings.voiceURI ||
      prev.readingMode !== nextSettings.readingMode ||
      prev.chunkSizeChars !== nextSettings.chunkSizeChars ||
      prev.paragraphPauseMs !== nextSettings.paragraphPauseMs ||
      prev.commaPauseMs !== nextSettings.commaPauseMs ||
      prev.sentencePauseMs !== nextSettings.sentencePauseMs ||
      prev.multiLangAuto !== nextSettings.multiLangAuto ||
      prev.readFootnotes !== nextSettings.readFootnotes ||
      prev.skipHeadersAndFootnotes !== nextSettings.skipHeadersAndFootnotes ||
      prev.skipParentheses !== nextSettings.skipParentheses ||
      prev.skipSymbolsAndQuotes !== nextSettings.skipSymbolsAndQuotes ||
      prev.readChapterTitle !== nextSettings.readChapterTitle ||
      prev.pronunciationDict !== nextSettings.pronunciationDict;

    if (this.isPlaying && playbackParamsChanged) {
      void this.playFromOffset(this.currentCharOffset);
    }
  }

  public configureSleepTimer(minutes: number) {
    this.clearSleepTimer();
    this.stopAtEndOfChapter = false;
    this.effectiveVolumeMultiplier = 1.0;

    if (minutes === -1) {
      this.stopAtEndOfChapter = true;
      this.sleepRemainingSec = null;
      this.callbacks.onSleepTimerTick(null);
      return;
    }

    if (minutes <= 0) {
      this.sleepRemainingSec = null;
      this.callbacks.onSleepTimerTick(null);
      return;
    }

    this.sleepRemainingSec = minutes * 60;
    this.callbacks.onSleepTimerTick(this.sleepRemainingSec);

    this.sleepInterval = window.setInterval(() => {
      if (!this.isPlaying || this.sleepRemainingSec === null) return;
      this.sleepRemainingSec -= 1;
      const rem = Math.max(0, this.sleepRemainingSec);
      this.callbacks.onSleepTimerTick(rem);

      if (this.settings.fadeOutBeforeStop && rem > 0 && rem <= 10) {
        this.effectiveVolumeMultiplier = Math.max(0.15, rem / 10);
      }

      if (rem <= 0) {
        this.clearSleepTimer();
        this.effectiveVolumeMultiplier = 1.0;
        this.pause();
      }
    }, 1000);
  }

  public getPosition(): { charOffset: number; sentenceIndex: number; wordIndex: number } {
    return {
      charOffset: this.currentCharOffset,
      sentenceIndex: this.currentSentenceIndex,
      wordIndex: this.currentWordIndex,
    };
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private resolveVoiceForLang(detectedLang?: 'id' | 'en'): string {
    if (!this.settings.multiLangAuto || !detectedLang) {
      return this.settings.voiceURI;
    }
    const pool = this.availableVoices.filter((v) =>
      detectedLang === 'id' ? isIndonesianVoice(v) : isEnglishVoice(v)
    );
    if (pool.length === 0) return this.settings.voiceURI;
    // Prefer currently selected voice if it already matches target language
    const current = pool.find((v) => v.voiceURI === this.settings.voiceURI);
    if (current) return current.voiceURI;
    const offlineFirst = pool.find((v) => v.localService) ?? pool[0];
    return offlineFirst.voiceURI;
  }

  private getEffectiveVolume(): number {
    const base = typeof this.settings.volume === 'number' ? this.settings.volume : 1.0;
    return Math.max(0.05, Math.min(1.0, base * this.effectiveVolumeMultiplier));
  }

  public async playFromSentence(sentenceIndex: number): Promise<void> {
    if (this.allSentences.length === 0) return;
    const clamped = Math.max(0, Math.min(sentenceIndex, this.allSentences.length - 1));
    const offset = this.allSentences[clamped].chapterStartChar;
    await this.playFromOffset(offset);
  }

  public async playFromOffset(charOffset: number): Promise<void> {
    if (this.paragraphs.length === 0) return;

    this.cancelActiveQueueOnly();
    const token = ++this.sessionToken;
    this.effectiveVolumeMultiplier = 1.0;

    this.syncCursorFromOffset(charOffset);
    this.chunks = buildSpeechChunksFromOffset(this.paragraphs, this.currentCharOffset, {
      readingMode: this.settings.readingMode,
      chunkSizeChars: this.settings.chunkSizeChars,
      maxEngineInputLength: this.capabilities.maxSpeechInputLength,
      paragraphPauseMs: this.settings.paragraphPauseMs,
      commaPauseMs: this.settings.commaPauseMs,
      sentencePauseMs: this.settings.sentencePauseMs,
      ssmlSupported: this.capabilities.ssmlSupported,
      readFootnotes: this.settings.readFootnotes,
      skipHeadersAndFootnotes: this.settings.skipHeadersAndFootnotes,
      readChapterTitle: this.settings.readChapterTitle,
      skipParentheses: this.settings.skipParentheses,
      skipSymbolsAndQuotes: this.settings.skipSymbolsAndQuotes,
      pronunciationDict: this.settings.pronunciationDict,
      ttsOnlyRules: this.ttsOnlyRules,
      chapterIndex: this.chapterIndex,
      bookCtx: this.bookCtx,
    });

    if (this.chunks.length === 0) {
      this.isPlaying = false;
      this.callbacks.onPlaybackStateChange(false);
      return;
    }

    this.nextEnqueueIdx = 0;
    this.activeChunkIdx = 0;
    this.webFallbackMode = false;
    this.isPlaying = true;
    this.callbacks.onPlaybackStateChange(true);
    this.configureSleepTimer(this.settings.sleepTimerMinutes);

    const initialVoice = this.resolveVoiceForLang(this.chunks[0]?.detectedLang);
    this.activeSessionVoiceURI = initialVoice;

    if (Capacitor.isNativePlatform()) {
      await NovelVoiceTts.configureSession({
        voiceURI: initialVoice,
        rate: this.settings.rate,
        pitch: this.settings.pitch,
      }).catch(() => undefined);

      const preview = this.allSentences[this.currentSentenceIndex]?.text ?? '';
      await NovelVoiceTts.startForegroundService({
        bookTitle: this.bookTitle,
        chapterTitle: this.chapterTitle,
        sentencePreview: preview,
        isPlaying: true,
      }).catch(() => undefined);
    }

    if (token !== this.sessionToken || !this.isPlaying) return;

    await this.fillLookaheadQueue(token, true);
  }

  public resume(): void {
    if (this.isPlaying) return;
    const sentenceStart = findSentenceStartForOffset(this.allSentences, this.currentCharOffset);
    void this.playFromOffset(sentenceStart);
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.sessionToken += 1;
    this.cancelActiveQueueOnly();
    this.callbacks.onPlaybackStateChange(false);

    if (Capacitor.isNativePlatform()) {
      const preview = this.allSentences[this.currentSentenceIndex]?.text ?? '';
      void NovelVoiceTts.updateNotification({
        bookTitle: this.bookTitle,
        chapterTitle: this.chapterTitle,
        sentencePreview: preview,
        isPlaying: false,
      }).catch(() => undefined);
    }
  }

  public stop(): void {
    this.isPlaying = false;
    this.sessionToken += 1;
    this.cancelActiveQueueOnly();
    this.clearSleepTimer();
    this.callbacks.onPlaybackStateChange(false);

    if (Capacitor.isNativePlatform()) {
      void NovelVoiceTts.stopForegroundService().catch(() => undefined);
    }
  }

  public nextSentence(): void {
    if (this.allSentences.length === 0) return;
    const nextIdx = Math.min(this.allSentences.length - 1, this.currentSentenceIndex + 1);
    const targetOffset = this.allSentences[nextIdx].chapterStartChar;
    if (this.isPlaying) {
      void this.playFromOffset(targetOffset);
    } else {
      this.syncCursorFromOffset(targetOffset);
    }
  }

  public prevSentence(): void {
    if (this.allSentences.length === 0) return;
    const prevIdx = Math.max(0, this.currentSentenceIndex - 1);
    const targetOffset = this.allSentences[prevIdx].chapterStartChar;
    if (this.isPlaying) {
      void this.playFromOffset(targetOffset);
    } else {
      this.syncCursorFromOffset(targetOffset);
    }
  }

  public nextParagraph(): void {
    if (this.paragraphs.length === 0) return;
    const loc = findLocationAtChapterOffset(this.allSentences, this.currentCharOffset);
    const nextParaIdx = Math.min(this.paragraphs.length - 1, loc.paragraphIndex + 1);
    const targetOffset = this.paragraphs[nextParaIdx].chapterStartChar;
    if (this.isPlaying) {
      void this.playFromOffset(targetOffset);
    } else {
      this.syncCursorFromOffset(targetOffset);
    }
  }

  public prevParagraph(): void {
    if (this.paragraphs.length === 0) return;
    const loc = findLocationAtChapterOffset(this.allSentences, this.currentCharOffset);
    const currentPara = this.paragraphs[loc.paragraphIndex];
    const targetParaIdx =
      this.currentCharOffset > (currentPara?.chapterStartChar ?? 0) + 12
        ? loc.paragraphIndex
        : Math.max(0, loc.paragraphIndex - 1);
    const targetOffset = this.paragraphs[targetParaIdx].chapterStartChar;
    if (this.isPlaying) {
      void this.playFromOffset(targetOffset);
    } else {
      this.syncCursorFromOffset(targetOffset);
    }
  }

  public async previewVoice(voiceURI: string, sampleText: string): Promise<void> {
    this.pause();
    const token = ++this.sessionToken;

    if (Capacitor.isNativePlatform()) {
      await NovelVoiceTts.configureSession({
        voiceURI,
        rate: this.settings.rate,
        pitch: this.settings.pitch,
      }).catch(() => undefined);
      await NovelVoiceTts.speak({
        text: sampleText,
        utteranceId: `preview_${Date.now()}`,
        queueMode: 0,
        volume: this.getEffectiveVolume(),
      }).catch(() => undefined);
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (token !== this.sessionToken) return;
      const utt = this.createWebUtterance(sampleText, voiceURI);
      window.speechSynthesis.speak(utt);
    }
  }

  public async speakAdhocText(text: string, targetLangCode = 'id'): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    this.pause();
    const token = ++this.sessionToken;

    const langPrefix = targetLangCode.toLowerCase().split('-')[0];
    const matchedVoice =
      this.availableVoices.find((v) =>
        langPrefix === 'id' ? isIndonesianVoice(v) : isEnglishVoice(v)
      )?.voiceURI || this.settings.voiceURI;

    if (Capacitor.isNativePlatform()) {
      await NovelVoiceTts.configureSession({
        voiceURI: matchedVoice,
        rate: this.settings.rate,
        pitch: this.settings.pitch,
      }).catch(() => undefined);
      await NovelVoiceTts.speak({
        text: clean,
        utteranceId: `adhoc_${Date.now()}`,
        queueMode: 0,
        volume: this.getEffectiveVolume(),
      }).catch(() => undefined);
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (token !== this.sessionToken) return;
      const utt = this.createWebUtterance(clean, matchedVoice);
      utt.lang = langPrefix === 'id' ? 'id-ID' : langPrefix === 'en' ? 'en-US' : targetLangCode;
      window.speechSynthesis.speak(utt);
    }
  }

  public destroy(): void {
    this.stop();
    this.nativeListeners.forEach((h) => void h.remove());
    this.nativeListeners = [];
  }

  private syncCursorFromOffset(charOffset: number) {
    const loc = findLocationAtChapterOffset(this.allSentences, charOffset);
    this.currentCharOffset = loc.chapterOffset;
    this.currentSentenceIndex = loc.sentenceIndex;
    this.currentWordIndex = loc.wordIndex;
    this.callbacks.onHighlight(loc.sentenceIndex, loc.wordIndex, loc.chapterOffset);
  }

  private async fillLookaheadQueue(token: number, flushFirst: boolean): Promise<void> {
    if (!this.isPlaying || token !== this.sessionToken) return;

    while (
      this.nextEnqueueIdx < this.chunks.length &&
      this.nextEnqueueIdx - this.activeChunkIdx < LOOKAHEAD_DEPTH
    ) {
      const idx = this.nextEnqueueIdx;
      const chunk = this.chunks[idx];
      const useFlush = flushFirst && idx === 0;
      const desiredVoice = this.resolveVoiceForLang(chunk.detectedLang);

      // Avoid mixing voices inside a single queued native session if multiLangAuto switches language
      if (
        Capacitor.isNativePlatform() &&
        this.settings.multiLangAuto &&
        idx > this.activeChunkIdx &&
        desiredVoice !== this.activeSessionVoiceURI
      ) {
        break;
      }

      this.nextEnqueueIdx += 1;

      if (Capacitor.isNativePlatform()) {
        if (desiredVoice !== this.activeSessionVoiceURI) {
          this.activeSessionVoiceURI = desiredVoice;
          await NovelVoiceTts.configureSession({
            voiceURI: desiredVoice,
            rate: this.settings.rate,
            pitch: this.settings.pitch,
          }).catch(() => undefined);
        }

        const uttId = `nv_${token}_${idx}`;
        this.utteranceToChunkIdx.set(uttId, idx);
        await NovelVoiceTts.speak({
          text: chunk.speakText,
          utteranceId: uttId,
          queueMode: useFlush ? 0 : 1,
          volume: this.getEffectiveVolume(),
        }).catch(() => undefined);

        if (chunk.pauseAfterMs > 0) {
          await NovelVoiceTts.playSilent({
            durationMs: chunk.pauseAfterMs,
            utteranceId: `sil_${token}_${idx}`,
          }).catch(() => undefined);
        }
      } else {
        this.enqueueWebChunk(idx, chunk, token, useFlush, desiredVoice);
      }
    }
  }

  private enqueueWebChunk(
    idx: number,
    chunk: SpeechChunk,
    token: number,
    flushFirst: boolean,
    voiceURI: string
  ) {
    if (
      this.webFallbackMode ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window)
    ) {
      if (idx === this.activeChunkIdx) {
        this.runHeadlessFallbackChunk(idx, chunk, token);
      }
      return;
    }

    if (flushFirst) {
      window.speechSynthesis.cancel();
    }

    const plainSpoken = chunk.isSsml
      ? chunk.speakText.replace(/<[^>]+>/g, '')
      : chunk.speakText;
    const utt = this.createWebUtterance(plainSpoken, voiceURI);

    let started = false;
    let finished = false;
    let safetyTimer: number | null = null;
    let initialNoStartTimeout: number | null = null;

    const completeOnce = () => {
      if (finished) return;
      finished = true;
      if (safetyTimer !== null) window.clearTimeout(safetyTimer);
      if (initialNoStartTimeout !== null) window.clearTimeout(initialNoStartTimeout);
      if (!this.isPlaying || token !== this.sessionToken) return;
      this.handleChunkFinished(idx, token);
    };

    utt.onstart = () => {
      started = true;
      if (initialNoStartTimeout !== null) window.clearTimeout(initialNoStartTimeout);
      if (!this.isPlaying || token !== this.sessionToken) return;
      this.onChunkBecameActive(idx, chunk, token);
      const est = estimateChunkDurationMs(plainSpoken, this.settings.rate);
      safetyTimer = window.setTimeout(completeOnce, Math.max(3000, est + 2500));
    };

    utt.onboundary = (ev) => {
      if (!this.isPlaying || token !== this.sessionToken) return;
      if (ev.charIndex >= 0) {
        this.handleBoundaryOffset(chunk, ev.charIndex);
      }
    };

    utt.onend = completeOnce;

    utt.onerror = (ev) => {
      if (!this.isPlaying || token !== this.sessionToken) return;
      const errCode = (ev as unknown as { error?: string }).error;
      if (errCode === 'interrupted' || errCode === 'canceled') {
        return;
      }
      if (!started) {
        this.webFallbackMode = true;
        if (idx === this.activeChunkIdx) {
          this.runHeadlessFallbackChunk(idx, chunk, token);
        }
        return;
      }
      completeOnce();
    };

    if (idx === this.activeChunkIdx) {
      initialNoStartTimeout = window.setTimeout(() => {
        if (!started && this.isPlaying && token === this.sessionToken) {
          this.webFallbackMode = true;
          this.runHeadlessFallbackChunk(idx, chunk, token);
        }
      }, 900);
    }

    window.speechSynthesis.speak(utt);
  }

  private runHeadlessFallbackChunk(idx: number, chunk: SpeechChunk, token: number) {
    this.onChunkBecameActive(idx, chunk, token);
    const plainSpoken = chunk.isSsml
      ? chunk.speakText.replace(/<[^>]+>/g, '')
      : chunk.speakText;
    const estMs = estimateChunkDurationMs(plainSpoken, this.settings.rate);
    this.webPauseTimer = window.setTimeout(() => {
      if (!this.isPlaying || token !== this.sessionToken) return;
      this.handleChunkFinished(idx, token);
    }, estMs);
  }

  private onChunkBecameActive(idx: number, chunk: SpeechChunk, token: number) {
    this.activeChunkIdx = idx;
    this.sawBoundaryForCurrentChunk = false;
    this.syncCursorFromOffset(chunk.chapterStartChar);

    if (Capacitor.isNativePlatform()) {
      const preview = this.allSentences[this.currentSentenceIndex]?.text ?? '';
      void NovelVoiceTts.updateNotification({
        bookTitle: this.bookTitle,
        chapterTitle: this.chapterTitle,
        sentencePreview: preview,
        isPlaying: true,
      }).catch(() => undefined);
    }

    this.startProportionalFallback(chunk, token);
    void this.fillLookaheadQueue(token, false);
  }

  private handleBoundaryOffset(chunk: SpeechChunk, localCharIndex: number) {
    this.sawBoundaryForCurrentChunk = true;
    const chapterOffset = mapChunkLocalOffsetToChapterOffset(chunk, localCharIndex);
    this.syncCursorFromOffset(chapterOffset);
  }

  private handleChunkFinished(idx: number, token: number) {
    if (!this.isPlaying || token !== this.sessionToken) return;
    this.clearProgressTimersOnly();

    const completedChunk = this.chunks[idx];
    if (completedChunk) {
      this.syncCursorFromOffset(completedChunk.chapterEndChar);
    }

    const nextIdx = idx + 1;
    if (nextIdx >= this.chunks.length) {
      if (this.stopAtEndOfChapter) {
        this.stop();
        return;
      }
      this.isPlaying = false;
      this.callbacks.onPlaybackStateChange(false);
      this.callbacks.onChapterComplete();
      return;
    }

    this.activeChunkIdx = nextIdx;

    if (!Capacitor.isNativePlatform() && this.webFallbackMode) {
      const pauseMs = completedChunk?.pauseAfterMs ?? 0;
      const advance = () => {
        if (!this.isPlaying || token !== this.sessionToken) return;
        this.runHeadlessFallbackChunk(nextIdx, this.chunks[nextIdx], token);
      };
      if (pauseMs > 0) {
        this.webPauseTimer = window.setTimeout(advance, pauseMs);
      } else {
        advance();
      }
      return;
    }

    void this.fillLookaheadQueue(token, false);
  }

  private startProportionalFallback(chunk: SpeechChunk, token: number) {
    this.clearProgressTimersOnly();
    const plainSpoken = chunk.isSsml
      ? chunk.speakText.replace(/<[^>]+>/g, '')
      : chunk.speakText;
    const totalLen = Math.max(1, plainSpoken.length);
    const estDurationMs = estimateChunkDurationMs(plainSpoken, this.settings.rate);
    const startedAt = performance.now();
    const tickIntervalMs = Math.max(60, Math.round(120 / Math.max(1, this.settings.rate)));

    this.fallbackProgressTimer = window.setInterval(() => {
      if (!this.isPlaying || token !== this.sessionToken) {
        this.clearProgressTimersOnly();
        return;
      }
      if (this.sawBoundaryForCurrentChunk) {
        this.clearProgressTimersOnly();
        return;
      }
      const elapsed = performance.now() - startedAt;
      const ratio = Math.min(0.98, elapsed / estDurationMs);
      const approxSpoken = Math.floor(ratio * totalLen);
      const chapterOffset = mapChunkLocalOffsetToChapterOffset(chunk, approxSpoken);
      this.syncCursorFromOffset(chapterOffset);
    }, tickIntervalMs);
  }

  private createWebUtterance(text: string, voiceURI: string): SpeechSynthesisUtterance {
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = Math.max(0.5, Math.min(3.0, this.settings.rate));
    utt.pitch = Math.max(0.5, Math.min(2.0, this.settings.pitch));
    utt.volume = this.getEffectiveVolume();

    if (voiceURI && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const match = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI);
      if (match) {
        utt.voice = match;
        utt.lang = match.lang;
      }
    }
    return utt;
  }

  private clearProgressTimersOnly() {
    if (this.fallbackProgressTimer !== null) {
      window.clearInterval(this.fallbackProgressTimer);
      this.fallbackProgressTimer = null;
    }
  }

  private clearSleepTimer() {
    if (this.sleepInterval !== null) {
      window.clearInterval(this.sleepInterval);
      this.sleepInterval = null;
    }
    this.sleepRemainingSec = null;
    this.callbacks.onSleepTimerTick(null);
  }

  private cancelActiveQueueOnly() {
    this.clearProgressTimersOnly();
    if (this.webPauseTimer !== null) {
      window.clearTimeout(this.webPauseTimer);
      this.webPauseTimer = null;
    }
    this.utteranceToChunkIdx.clear();
    if (Capacitor.isNativePlatform()) {
      void NovelVoiceTts.stop().catch(() => undefined);
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}
