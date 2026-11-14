import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import type { CommaChunk, SentenceSegment, TtsSettings, TtsVoiceInfo } from '../types/reader';
import {
  estimateWordDurationMs,
  findWordIndexAtCharOffset,
  splitSentenceIntoCommaChunks,
} from '../utils/textSegmentation';

export interface NovelVoiceTtsPluginInterface {
  getVoices(): Promise<{ voices: TtsVoiceInfo[] }>;
  speak(options: {
    text: string;
    voiceURI?: string;
    rate: number;
    pitch: number;
    utteranceId: string;
    bookTitle?: string;
    chapterTitle?: string;
    sentencePreview?: string;
  }): Promise<void>;
  stop(): Promise<void>;
  openTtsSettings(): Promise<{ opened: boolean }>;
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

export async function getSystemVoices(): Promise<TtsVoiceInfo[]> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await NovelVoiceTts.getVoices();
      if (res?.voices?.length) return res.voices;
    } catch {
      // Fallback to community TTS plugin if custom plugin unavailable
    }
    try {
      const res = await TextToSpeech.getSupportedVoices();
      return (res.voices || []).map((v) => ({
        voiceURI: v.voiceURI,
        name: v.name,
        lang: v.lang,
        localService: v.localService,
      }));
    } catch {
      return [];
    }
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }

  const readVoices = () =>
    window.speechSynthesis.getVoices().map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      localService: v.localService,
    }));

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
      'Di Android (APK), tombol ini langsung membuka Pengaturan Text-to-Speech sistem (Intent com.android.settings.TTS_SETTINGS) untuk mengganti mesin seperti Google TTS atau Sherpa.',
  };
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
  onHighlight: (sentenceIndex: number, wordIndex: number) => void;
  onPlaybackStateChange: (isPlaying: boolean) => void;
  onChapterComplete: () => void;
  onSleepTimerTick: (remainingSeconds: number | null) => void;
}

/**
 * Orchestrates sentence-by-sentence and comma-chunk playback with:
 * - Natural configurable pauses at commas/semicolons/colons (0-500ms)
 * - Synced sentence + word highlighting (native onRangeStart / Web onboundary + duration fallback)
 * - Exact sentence & word resume after pause/stop
 * - Foreground MediaSession notification sync on Android
 * - Sleep timer (minutes or end-of-chapter)
 */
export class TtsPlaybackController {
  private sentences: SentenceSegment[] = [];
  private settings: TtsSettings;
  private bookTitle = '';
  private chapterTitle = '';
  private callbacks: TtsPlaybackCallbacks;

  private isPlaying = false;
  private currentSentenceIndex = 0;
  private currentWordIndex = 0;
  private runToken = 0;

  private fallbackWordTimer: number | null = null;
  private pauseTimer: number | null = null;
  private sleepInterval: number | null = null;
  private sleepRemainingSec: number | null = null;
  private stopAtEndOfChapter = false;

  private nativeListeners: PluginListenerHandle[] = [];
  private activeUtteranceId = '';
  private activeChunkResolve: (() => void) | null = null;
  private activeChunk: CommaChunk | null = null;
  private activeSentence: SentenceSegment | null = null;
  private sawBoundaryForChunk = false;

  constructor(settings: TtsSettings, callbacks: TtsPlaybackCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
    void this.setupNativeListeners();
  }

  private async setupNativeListeners() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const rangeHandle = await NovelVoiceTts.addListener('rangeStart', (ev) => {
        if (!this.isPlaying || ev.utteranceId !== this.activeUtteranceId) return;
        if (!this.activeChunk || !this.activeSentence) return;
        this.sawBoundaryForChunk = true;
        this.clearFallbackWordTimer();
        const sentenceCharOffset = this.activeChunk.startCharOffset + ev.start;
        const wordIdx = findWordIndexAtCharOffset(this.activeSentence.words, sentenceCharOffset);
        this.currentWordIndex = wordIdx;
        this.callbacks.onHighlight(this.currentSentenceIndex, wordIdx);
      });

      const doneHandle = await NovelVoiceTts.addListener('utteranceDone', (ev) => {
        if (ev.utteranceId === this.activeUtteranceId && this.activeChunkResolve) {
          const resolve = this.activeChunkResolve;
          this.activeChunkResolve = null;
          resolve();
        }
      });

      const mediaHandle = await NovelVoiceTts.addListener('mediaAction', (ev) => {
        if (ev.action === 'pause') this.pause();
        else if (ev.action === 'play') this.resume();
        else if (ev.action === 'next') this.nextSentence();
        else if (ev.action === 'prev') this.prevSentence();
        else if (ev.action === 'stop') this.stop();
      });

      this.nativeListeners.push(rangeHandle, doneHandle, mediaHandle);
    } catch {
      // Ignore on web or if plugin isn't registered
    }
  }

  public setBookContext(
    bookTitle: string,
    chapterTitle: string,
    sentences: SentenceSegment[],
    initialSentenceIndex = 0,
    initialWordIndex = 0
  ) {
    this.bookTitle = bookTitle;
    this.chapterTitle = chapterTitle;
    this.sentences = sentences;
    this.currentSentenceIndex = Math.max(0, Math.min(initialSentenceIndex, Math.max(0, sentences.length - 1)));
    this.currentWordIndex = Math.max(0, initialWordIndex);
  }

  public updateSettings(nextSettings: TtsSettings) {
    const prevSleep = this.settings.sleepTimerMinutes;
    this.settings = nextSettings;
    if (prevSleep !== nextSettings.sleepTimerMinutes) {
      this.configureSleepTimer(nextSettings.sleepTimerMinutes);
    }
  }

  public configureSleepTimer(minutes: number) {
    this.clearSleepTimer();
    this.stopAtEndOfChapter = false;

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
      if (!this.isPlaying) return;
      if (this.sleepRemainingSec === null) return;
      this.sleepRemainingSec -= 1;
      this.callbacks.onSleepTimerTick(Math.max(0, this.sleepRemainingSec));
      if (this.sleepRemainingSec <= 0) {
        this.clearSleepTimer();
        this.pause();
      }
    }, 1000);
  }

  public getPosition(): { sentenceIndex: number; wordIndex: number } {
    return {
      sentenceIndex: this.currentSentenceIndex,
      wordIndex: this.currentWordIndex,
    };
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public async playFrom(sentenceIndex: number, wordIndex = 0): Promise<void> {
    if (this.sentences.length === 0) return;
    this.cancelActiveSpeechOnly();
    this.currentSentenceIndex = Math.max(0, Math.min(sentenceIndex, this.sentences.length - 1));
    this.currentWordIndex = Math.max(0, wordIndex);
    this.isPlaying = true;
    this.callbacks.onPlaybackStateChange(true);
    this.configureSleepTimer(this.settings.sleepTimerMinutes);

    if (Capacitor.isNativePlatform()) {
      const preview = this.sentences[this.currentSentenceIndex]?.text ?? '';
      await NovelVoiceTts.startForegroundService({
        bookTitle: this.bookTitle,
        chapterTitle: this.chapterTitle,
        sentencePreview: preview,
        isPlaying: true,
      }).catch(() => undefined);
    }

    void this.runLoop();
  }

  public resume(): void {
    if (this.isPlaying) return;
    void this.playFrom(this.currentSentenceIndex, this.currentWordIndex);
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.runToken += 1;
    this.cancelActiveSpeechOnly();
    this.callbacks.onPlaybackStateChange(false);

    if (Capacitor.isNativePlatform()) {
      const preview = this.sentences[this.currentSentenceIndex]?.text ?? '';
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
    this.runToken += 1;
    this.cancelActiveSpeechOnly();
    this.clearSleepTimer();
    this.callbacks.onPlaybackStateChange(false);

    if (Capacitor.isNativePlatform()) {
      void NovelVoiceTts.stopForegroundService().catch(() => undefined);
    }
  }

  public nextSentence(): void {
    if (this.sentences.length === 0) return;
    const nextIdx = Math.min(this.sentences.length - 1, this.currentSentenceIndex + 1);
    if (this.isPlaying) {
      void this.playFrom(nextIdx, 0);
    } else {
      this.currentSentenceIndex = nextIdx;
      this.currentWordIndex = 0;
      this.callbacks.onHighlight(nextIdx, 0);
    }
  }

  public prevSentence(): void {
    if (this.sentences.length === 0) return;
    const prevIdx = Math.max(0, this.currentSentenceIndex - 1);
    if (this.isPlaying) {
      void this.playFrom(prevIdx, 0);
    } else {
      this.currentSentenceIndex = prevIdx;
      this.currentWordIndex = 0;
      this.callbacks.onHighlight(prevIdx, 0);
    }
  }

  public async previewVoice(voiceURI: string, sampleText: string): Promise<void> {
    this.pause();
    const token = ++this.runToken;
    await this.speakSingleUtterance(sampleText, voiceURI, token, () => undefined);
  }

  public destroy(): void {
    this.stop();
    this.nativeListeners.forEach((handle) => void handle.remove());
    this.nativeListeners = [];
  }

  private async runLoop(): Promise<void> {
    const token = ++this.runToken;

    while (this.isPlaying && this.runToken === token) {
      if (this.currentSentenceIndex >= this.sentences.length) {
        this.isPlaying = false;
        this.callbacks.onPlaybackStateChange(false);
        if (this.stopAtEndOfChapter) {
          this.stopAtEndOfChapter = false;
          this.stop();
        } else {
          this.callbacks.onChapterComplete();
        }
        return;
      }

      const sentence = this.sentences[this.currentSentenceIndex];
      const startWord = this.currentWordIndex;
      this.callbacks.onHighlight(sentence.globalIndex, startWord);

      if (Capacitor.isNativePlatform()) {
        void NovelVoiceTts.updateNotification({
          bookTitle: this.bookTitle,
          chapterTitle: this.chapterTitle,
          sentencePreview: sentence.text,
          isPlaying: true,
        }).catch(() => undefined);
      }

      const chunks = splitSentenceIntoCommaChunks(
        sentence.text,
        this.settings.commaPauseMs,
        startWord
      );

      for (const chunk of chunks) {
        if (!this.isPlaying || this.runToken !== token) return;

        this.activeChunk = chunk;
        this.activeSentence = sentence;
        this.sawBoundaryForChunk = false;

        // Highlight first word of chunk right away
        const chunkFirstWord = findWordIndexAtCharOffset(sentence.words, chunk.startCharOffset);
        this.currentWordIndex = chunkFirstWord;
        this.callbacks.onHighlight(sentence.globalIndex, chunkFirstWord);

        this.startFallbackWordTimer(sentence, chunk, token);

        await this.speakSingleUtterance(
          chunk.text,
          this.settings.voiceURI,
          token,
          (localCharOffset) => {
            if (!this.isPlaying || this.runToken !== token) return;
            this.sawBoundaryForChunk = true;
            this.clearFallbackWordTimer();
            const wordIdx = findWordIndexAtCharOffset(
              sentence.words,
              chunk.startCharOffset + localCharOffset
            );
            this.currentWordIndex = wordIdx;
            this.callbacks.onHighlight(sentence.globalIndex, wordIdx);
          }
        );

        this.clearFallbackWordTimer();
        if (!this.isPlaying || this.runToken !== token) return;

        if (chunk.pauseAfterMs > 0) {
          await this.waitMs(chunk.pauseAfterMs, token);
        }
      }

      if (!this.isPlaying || this.runToken !== token) return;

      // Natural inter-sentence breath pause
      await this.waitMs(300, token);
      if (!this.isPlaying || this.runToken !== token) return;

      this.currentSentenceIndex += 1;
      this.currentWordIndex = 0;
    }
  }

  private startFallbackWordTimer(sentence: SentenceSegment, chunk: CommaChunk, token: number) {
    this.clearFallbackWordTimer();
    const chunkWords = sentence.words.filter(
      (w) => w.startChar >= chunk.startCharOffset && w.startChar < chunk.endCharOffset
    );
    if (chunkWords.length <= 1) return;

    let idx = 0;
    const scheduleNext = () => {
      if (!this.isPlaying || this.runToken !== token || this.sawBoundaryForChunk) return;
      if (idx >= chunkWords.length - 1) return;
      const currentW = chunkWords[idx];
      const delay = estimateWordDurationMs(currentW.text, this.settings.rate);
      this.fallbackWordTimer = window.setTimeout(() => {
        if (!this.isPlaying || this.runToken !== token || this.sawBoundaryForChunk) return;
        idx += 1;
        const nextWord = chunkWords[idx];
        this.currentWordIndex = nextWord.wordIndex;
        this.callbacks.onHighlight(sentence.globalIndex, nextWord.wordIndex);
        scheduleNext();
      }, delay);
    };

    scheduleNext();
  }

  private speakSingleUtterance(
    text: string,
    voiceURI: string,
    token: number,
    onBoundary: (charOffset: number) => void
  ): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      return new Promise<void>((resolve) => {
        const utteranceId = `utt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        this.activeUtteranceId = utteranceId;
        this.activeChunkResolve = resolve;

        NovelVoiceTts.speak({
          text,
          voiceURI,
          rate: this.settings.rate,
          pitch: this.settings.pitch,
          utteranceId,
          bookTitle: this.bookTitle,
          chapterTitle: this.chapterTitle,
          sentencePreview: this.activeSentence?.text ?? text,
        }).catch(() => {
          // Fallback to @capacitor-community/text-to-speech if needed
          TextToSpeech.speak({
            text,
            rate: this.settings.rate,
            pitch: this.settings.pitch,
          })
            .catch(() => undefined)
            .finally(() => {
              if (this.activeChunkResolve === resolve) {
                this.activeChunkResolve = null;
              }
              resolve();
            });
        });
      });
    }

    // Web Speech API path (Browser preview)
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      const approxMs = Math.max(600, Math.round((text.split(/\s+/).length * 310) / this.settings.rate));
      return this.waitMs(approxMs, token);
    }

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(safetyTimeout);
        resolve();
      };

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.settings.rate;
      utterance.pitch = this.settings.pitch;

      const voices = window.speechSynthesis.getVoices();
      const matchedVoice = voiceURI
        ? voices.find((v) => v.voiceURI === voiceURI)
        : voices.find((v) => v.lang.toLowerCase().startsWith('id')) || voices[0];
      if (matchedVoice) {
        utterance.voice = matchedVoice;
        utterance.lang = matchedVoice.lang;
      }

      utterance.onboundary = (ev) => {
        if (ev.name === 'word' || ev.charIndex >= 0) {
          onBoundary(ev.charIndex);
        }
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      // Safety fallback in headless browsers where speechSynthesis may stall silently
      const estimatedTotalMs = Math.max(
        1800,
        Math.round((text.split(/\s+/).length * 460) / Math.max(0.5, this.settings.rate)) + 1500
      );
      const safetyTimeout = window.setTimeout(finish, estimatedTotalMs);

      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    });
  }

  private waitMs(ms: number, token: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.pauseTimer = window.setTimeout(() => {
        this.pauseTimer = null;
        if (this.runToken === token) resolve();
        else resolve();
      }, ms);
    });
  }

  private cancelActiveSpeechOnly() {
    this.clearFallbackWordTimer();
    if (this.pauseTimer !== null) {
      window.clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    if (this.activeChunkResolve) {
      const resolve = this.activeChunkResolve;
      this.activeChunkResolve = null;
      resolve();
    }
    if (Capacitor.isNativePlatform()) {
      void NovelVoiceTts.stop().catch(() => undefined);
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  private clearFallbackWordTimer() {
    if (this.fallbackWordTimer !== null) {
      window.clearTimeout(this.fallbackWordTimer);
      this.fallbackWordTimer = null;
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
}
