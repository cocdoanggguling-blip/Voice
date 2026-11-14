import test from 'node:test';
import assert from 'node:assert/strict';
import type { TtsVoiceInfo } from '../types/reader';
import { filterAndSortTtsVoices, isAllowedTtsVoice, isIndonesianVoice } from './ttsVoices';

const SAMPLE_VOICES: TtsVoiceInfo[] = [
  { voiceURI: 'fr-fr-x-fra-local', name: 'fr-fr-x-fra-local', lang: 'fr-FR', localService: true },
  { voiceURI: 'ja-jp-x-jac-network', name: 'ja-jp-x-jac-network', lang: 'ja-JP', localService: false },
  { voiceURI: 'en-ng-x-nga-local', name: 'en-ng-x-nga-local', lang: 'en-NG', localService: true },
  { voiceURI: 'en-in-x-end-local', name: 'en-in-x-end-local', lang: 'en-IN', localService: true },
  { voiceURI: 'en-us-x-sfg-local', name: 'en-us-x-sfg-local', lang: 'en-US', localService: true },
  { voiceURI: 'en-gb-x-gba-network', name: 'en-gb-x-gba-network', lang: 'en-GB', localService: false },
  { voiceURI: 'id-id-x-ide-network', name: 'id-id-x-ide-network', lang: 'id-ID', localService: false },
  { voiceURI: 'id-id-x-ide-local', name: 'id-id-x-ide-local', lang: 'id-ID', localService: true },
  { voiceURI: 'id-id-x-idd-local', name: 'id-id-x-idd-local', lang: 'in-ID', localService: true },
  { voiceURI: 'id-id-x-idc-network', name: 'id-id-x-idc-network', lang: 'id-ID', localService: false },
  { voiceURI: 'id-id-x-idd-network', name: 'id-id-x-idd-network', lang: 'id-ID', localService: false },
  { voiceURI: 'id-id-x-dfz-local', name: 'id-id-x-dfz-local', lang: 'id-ID', localService: true },
  { voiceURI: 'id-id-x-dfz-network', name: 'id-id-x-dfz-network', lang: 'und', localService: false },
];

test('keeps all Indonesian Google TTS variants (local + network, id/in/und prefix)', () => {
  const idOnly = filterAndSortTtsVoices(SAMPLE_VOICES, 'id');
  assert.deepEqual(
    idOnly.map((v) => v.voiceURI),
    [
      'id-id-x-dfz-local',
      'id-id-x-idd-local',
      'id-id-x-ide-local',
      'id-id-x-dfz-network',
      'id-id-x-idc-network',
      'id-id-x-idd-network',
      'id-id-x-ide-network',
    ]
  );
  assert.equal(isIndonesianVoice({ voiceURI: 'id-id-x-dfz-network', name: 'id-id-x-dfz-network', lang: 'und' }), true);
});

test('default "all" shows Indonesian + core English (en-GB & en-US) and excludes other regions/languages', () => {
  const core = filterAndSortTtsVoices(SAMPLE_VOICES, 'all');
  const uris = core.map((v) => v.voiceURI);
  assert.equal(uris.includes('fr-fr-x-fra-local'), false);
  assert.equal(uris.includes('ja-jp-x-jac-network'), false);
  assert.equal(uris.includes('en-ng-x-nga-local'), false);
  assert.equal(uris.includes('en-in-x-end-local'), false);
  assert.equal(uris.includes('en-gb-x-gba-network'), true);
  assert.equal(uris.includes('en-us-x-sfg-local'), true);
  assert.equal(uris.includes('id-id-x-ide-network'), true);
});

test('en_all includes all English regional variants while still blocking non-ID/EN languages', () => {
  const allEn = filterAndSortTtsVoices(SAMPLE_VOICES, 'en_all');
  assert.equal(allEn.some((v) => v.voiceURI === 'en-ng-x-nga-local'), true);
  assert.equal(allEn.some((v) => v.voiceURI === 'en-in-x-end-local'), true);
  assert.equal(allEn.some((v) => v.voiceURI === 'id-id-x-ide-local'), false);
  assert.equal(isAllowedTtsVoice({ voiceURI: 'fr-fr-x-fra-local', name: 'fr', lang: 'fr-FR' }), false);
});
