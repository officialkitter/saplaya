const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'theme.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(javascript, context);
const { colors, volumeTheme } = context.exports;

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('shopping modes retain their colors, white surfaces and readable text', () => {
  const buttons = {
    retail: colors.green,
    wholesale: colors.yellow,
    bulk: colors.bulk,
    mega_bulk: colors.megaBulk,
  };
  for (const [mode, button] of Object.entries(buttons)) {
    const theme = volumeTheme(mode);
    assert.equal(theme.button, button, `${mode} button color`);
    assert.equal(theme.surface, colors.white, `${mode} surface`);
    assert.ok(contrast(theme.button, theme.buttonText) >= 4.5, `${mode} button contrast`);
    assert.ok(contrast(theme.accent, theme.soft) >= 4.5, `${mode} accent contrast`);
    assert.ok(contrast(theme.accent, theme.surface) >= 4.5, `${mode} accent on white`);
  }
});
