import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type {
  ParsedParagraph,
  SentenceSegment,
  SpeechChunk,
  TtsEngineCapabilities,
  TtsSettings,
  TtsVoiceInfo,
} from '../types/reader';
import {
  buildSpeechChunksFromOffset,
  estimateChunkDurationMs,
  findLocationAtChapterOffset,
  findSentenceStartForOffset,
  mapChunkLocalOffsetToChapterOffset,
} from '../utils/textSegmentation';

export interface NovelVoiceTtsPluginInterface {
  getEngineInfo(): Promise<TtsEngineCapabilities>;
  getVoices(): Promise<{ voices: TtsVoiceInfo[] }>;
  configureSession(options: { voiceURI?: string; rate: number; pitch: number }): Promise<void>;
  speak(options: { text: string; utteranceId: string; queueMode: 0 | 1 }): Promise<void>;
  playSilent(options: { durationMs: number; utteranceId: string }): Promise<void>;
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
      if (res?.voices?.length) return res.voices;
    } catch {
      // Ignore
    }
    return [];
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
      'Di Android (APK), tombol ini langsung membuka Pengaturan Text-to-Speech sistem (Intent com.android.settings.TTS_SETTINGS) untuk memasang/mengganti mesin seperti Google TTS atau Sherpa.',
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
  onHighlight: (sentenceIndex: number, wordIndex: number, charOffset: number) => void;
  onPlaybackStateChange: (isPlaying: boolean) => void;
  onChapterComplete: () => void;
  onSleepTimerTick: (remainingSeconds: number | null) => void;
}

const LOOKAHEAD_DEPTH = 2;

/**
 * Flowing TTS Controller that decouples Speech Units (large paragraph/merged chunks
 * queued gaplessly via QUEUE_ADD) from Highlight Units (word & sentence derived from
 * chapter character offset via onRangeStart/onboundary + proportional fallback).
 */
export class TtsPlaybackController {
  private paragraphs: ParsedParagraph[] = [];
  private allSentences: SentenceSegment[] = [];
  private settings: TtsSettings;
  private capabilities: TtsEngineCapabilities = {
    maxSpeechInputLength: 3500,
    ssmlSupported: false,
  };
  private bookTitle = '';
  private chapterTitle = '';
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
    initialCharOffset = 0
  ) {
    this.bookTitle = bookTitle;
    this.chapterTitle = chapterTitle;
    this.paragraphs = paragraphs;
    this.allSentences = allSentences;
    this.syncCursorFromOffset(initialCharOffset);
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
      prev.voiceURI !== nextSettings.voiceURI ||
      prev.readingMode !== nextSettings.readingMode ||
      prev.chunkSizeChars !== nextSettings.chunkSizeChars ||
      prev.paragraphPauseMs !== nextSettings.paragraphPauseMs ||
      prev.commaPauseMs !== nextSettings.commaPauseMs ||
      prev.sentencePauseMs !== nextSettings.sentencePauseMs;

    if (this.isPlaying && playbackParamsChanged) {
      // Immediately rebuild queue from exact current charOffset without waiting for chunk end
      void this.playFromOffset(this.currentCharOffset);
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
      if (!this.isPlaying || this.sleepRemainingSec === null) return;
      this.sleepRemainingSec -= 1;
      this.callbacks.onSleepTimerTick(Math.max(0, this.sleepRemainingSec));
      if (this.sleepRemainingSec <= 0) {
        this.clearSleepTimer();
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

    this.syncCursorFromOffset(charOffset);
    this.chunks = buildSpeechChunksFromOffset(this.paragraphs, this.currentCharOffset, {
      readingMode: this.settings.readingMode,
      chunkSizeChars: this.settings.chunkSizeChars,
      maxEngineInputLength: this.capabilities.maxSpeechInputLength,
      paragraphPauseMs: this.settings.paragraphPauseMs,
      commaPauseMs: this.settings.commaPauseMs,
      sentencePauseMs: this.settings.sentencePauseMs,
      ssmlSupported: this.capabilities.ssmlSupported,
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

    if (Capacitor.isNativePlatform()) {
      await NovelVoiceTts.configureSession({
        voiceURI: this.settings.voiceURI,
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

    // Enqueue initial lookahead window (first chunk FLUSH, following chunks QUEUE_ADD)
    await this.fillLookaheadQueue(token, true);
  }

  public resume(): void {
    if (this.isPlaying) return;
    // Snap cleanly to start of the sentence containing last saved charOffset
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
      this.nextEnqueueIdx += 1;

      if (Capacitor.isNativePlatform()) {
        const uttId = `nv_${token}_${idx}`;
        this.utteranceToChunkIdx.set(uttId, idx);
        await NovelVoiceTts.speak({
          text: chunk.speakText,
          utteranceId: uttId,
          queueMode: useFlush ? 0 : 1,
        }).catch(() => undefined);

        // Inter-paragraph silence via QUEUE_ADD without flushing or resetting prosody
        if (chunk.pauseAfterMs > 0) {
          await NovelVoiceTts.playSilent({
            durationMs: chunk.pauseAfterMs,
            utteranceId: `sil_${token}_${idx}`,
          }).catch(() => undefined);
        }
      } else {
        this.enqueueWebChunk(idx, chunk, token, useFlush);
      }
    }
  }

  private enqueueWebChunk(idx: number, chunk: SpeechChunk, token: number, flushFirst: boolean) {
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

    const utt = this.createWebUtterance(chunk.text, this.settings.voiceURI);

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
      const est = estimateChunkDurationMs(chunk.text, this.settings.rate);
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
        if (initialNoStartTimeout !== null) window.clearTimeout(initialNoStartTimeout);
        finished = true;
        if (this.activeChunkIdx === idx) {
          this.runHeadlessFallbackChunk(idx, chunk, token);
        }
        return;
      }
      completeOnce();
    };

    initialNoStartTimeout = window.setTimeout(() => {
      if (!started && !finished && this.isPlaying && token === this.sessionToken) {
        this.webFallbackMode = true;
        finished = true;
        if (this.activeChunkIdx === idx) {
          this.runHeadlessFallbackChunk(idx, chunk, token);
        }
      }
    }, 350);

    try {
      window.speechSynthesis.speak(utt);
    } catch {
      this.webFallbackMode = true;
      if (initialNoStartTimeout !== null) window.clearTimeout(initialNoStartTimeout);
      if (this.activeChunkIdx === idx) {
        this.runHeadlessFallbackChunk(idx, chunk, token);
      }
    }
  }

  private runHeadlessFallbackChunk(idx: number, chunk: SpeechChunk, token: number) {
    this.onChunkBecameActive(idx, chunk, token);
    const est = estimateChunkDurationMs(chunk.text, this.settings.rate);
    this.webPauseTimer = window.setTimeout(() => {
      if (!this.isPlaying || token !== this.sessionToken) return;
      this.handleChunkFinished(idx, token);
    }, est);
  }

  private onChunkBecameActive(idx: number, chunk: SpeechChunk, token: number) {
    this.activeChunkIdx = idx;
    this.sawBoundaryForCurrentChunk = false;
    this.syncCursorFromOffset(chunk.chapterStartChar);
    this.startFallbackProgressTimer(chunk, token);

    if (Capacitor.isNativePlatform()) {
      const preview = this.allSentences[this.currentSentenceIndex]?.text ?? chunk.text.slice(0, 80);
      void NovelVoiceTts.updateNotification({
        bookTitle: this.bookTitle,
        chapterTitle: this.chapterTitle,
        sentencePreview: preview,
        isPlaying: true,
      }).catch(() => undefined);
    }
  }

  private handleBoundaryOffset(chunk: SpeechChunk, localCharOffset: number) {
    this.sawBoundaryForCurrentChunk = true;
    this.clearFallbackProgressTimer();
    const chapterOffset = mapChunkLocalOffsetToChapterOffset(chunk, localCharOffset);
    this.syncCursorFromOffset(chapterOffset);
  }

  private handleChunkFinished(idx: number, token: number) {
    if (!this.isPlaying || token !== this.sessionToken) return;
    this.clearFallbackProgressTimer();

    const finishedChunk = this.chunks[idx];
    if (finishedChunk) {
      // Snap visual cursor to end of finished chunk before advancing
      const nextChunk = this.chunks[idx + 1];
      if (nextChunk) {
        this.syncCursorFromOffset(nextChunk.chapterStartChar);
      }
    }

    if (idx >= this.chunks.length - 1) {
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

    this.activeChunkIdx = idx + 1;
    if (this.webFallbackMode && this.activeChunkIdx < this.chunks.length) {
      this.nextEnqueueIdx = Math.max(this.nextEnqueueIdx, this.activeChunkIdx + 1);
      this.runHeadlessFallbackChunk(this.activeChunkIdx, this.chunks[this.activeChunkIdx], token);
      return;
    }
    // Prefetch next chunk into QUEUE_ADD without flushing audio
    void this.fillLookaheadQueue(token, false);
  }

  private startFallbackProgressTimer(chunk: SpeechChunk, token: number) {
    this.clearFallbackProgressTimer();
    const totalMs = estimateChunkDurationMs(chunk.text, this.settings.rate);
    const startTs = performance.now();
    const totalLen = Math.max(1, chunk.text.length);

    this.fallbackProgressTimer = window.setInterval(() => {
      if (!this.isPlaying || token !== this.sessionToken || this.sawBoundaryForCurrentChunk) {
        this.clearFallbackProgressTimer();
        return;
      }
      const elapsed = performance.now() - startTs;
      const ratio = Math.min(0.98, elapsed / totalMs);
      const approxLocal = Math.floor(ratio * totalLen);
      const chapterOffset = mapChunkLocalOffsetToChapterOffset(chunk, approxLocal);
      this.syncCursorFromOffset(chapterOffset);
    }, 160);
  }

  private createWebUtterance(text: string, voiceURI: string): SpeechSynthesisUtterance {
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = Math.max(0.5, Math.min(3.0, this.settings.rate));
    utt.pitch = Math.max(0.5, Math.min(1.8, this.settings.pitch));

    const voices = window.speechSynthesis.getVoices();
    const matched = voiceURI
      ? voices.find((v) => v.voiceURI === voiceURI)
      : voices.find((v) => v.lang.toLowerCase().startsWith('id')) || voices[0];
    if (matched) {
      utt.voice = matched;
      utt.lang = matched.lang;
    }
    return utt;
  }

  private cancelActiveQueueOnly() {
    this.clearFallbackProgressTimer();
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

  private clearFallbackProgressTimer() {
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
}
