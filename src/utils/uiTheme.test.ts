import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUiThemeVars,
  DEFAULT_UI_COLOR,
  getContrastRatio,
  getReadableTextColor,
  normalizeHexColor,
} from './uiTheme';

test('normalizeHexColor normalizes shorthand and falls back to Cyan default', () => {
  assert.equal(DEFAULT_UI_COLOR, '#06b6d4');
  assert.equal(normalizeHexColor('#0af'), '#00aaff');
  assert.equal(normalizeHexColor('  #22D3EE '), '#22d3ee');
  assert.equal(normalizeHexColor('not-a-color'), DEFAULT_UI_COLOR);
  assert.equal(normalizeHexColor(undefined), DEFAULT_UI_COLOR);
});

test('getReadableTextColor ensures accessible contrast on light and dark backgrounds', () => {
  assert.equal(getReadableTextColor('#22d3ee'), '#07171c');
  assert.equal(getReadableTextColor('#f5b800'), '#07171c');
  assert.equal(getReadableTextColor('#0e7490'), '#ffffff');
  assert.equal(getReadableTextColor('#1e1b4b'), '#ffffff');
  assert.ok(getContrastRatio(getReadableTextColor('#0891b2'), '#0891b2') >= 4.5);
});

test('buildUiThemeVars defaults to Cyan and satisfies contrast across themes', () => {
  const twilightVars = buildUiThemeVars(DEFAULT_UI_COLOR, 'twilight');
  assert.ok(twilightVars['--nv-teal'].startsWith('#'));
  assert.ok(
    getContrastRatio(twilightVars['--nv-teal-text'], twilightVars['--nv-teal']) >= 4.5,
    'Bar text must have >= 4.5:1 contrast'
  );
  assert.ok(
    getContrastRatio(
      twilightVars['--nv-ui-accent-text'],
      twilightVars['--nv-ui-accent']
    ) >= 4.5,
    'Accent button text must have >= 4.5:1 contrast'
  );

  const lightVars = buildUiThemeVars(DEFAULT_UI_COLOR, 'light');
  assert.ok(
    getContrastRatio(lightVars['--nv-ui-accent-text'], lightVars['--nv-ui-accent']) >= 4.5,
    'Light mode accent text must have >= 4.5:1 contrast'
  );
  assert.ok(
    getContrastRatio('#ffffff', lightVars['--nv-ui-accent']) >= 4.5,
    'Light mode colored accent should remain readable on white surfaces'
  );
});

test('buildUiThemeVars adapts cleanly for arbitrary custom colors (rose, amber, neutral)', () => {
  const roseVars = buildUiThemeVars('#e11d48', 'dark');
  const amberVars = buildUiThemeVars('#f59e0b', 'light');
  const grayVars = buildUiThemeVars('#94a3b8', 'twilight');

  for (const vars of [roseVars, amberVars, grayVars]) {
    assert.ok(getContrastRatio(vars['--nv-teal-text'], vars['--nv-teal']) >= 4.5);
    assert.ok(
      getContrastRatio(vars['--nv-ui-accent-text'], vars['--nv-ui-accent']) >= 4.5
    );
    assert.ok(
      getContrastRatio(
        vars['--nv-ui-bar-highlight-text'],
        vars['--nv-ui-bar-highlight']
      ) >= 4.5
    );
  }
  const sepiaVars = buildUiThemeVars('#06b6d4', 'sepia');
  assert.ok(sepiaVars['--nv-accent-soft']?.startsWith('rgba('));
  assert.ok(grayVars['--nv-accent-soft']?.startsWith('rgba('));
});
