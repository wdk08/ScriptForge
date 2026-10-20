import config from './playwright.config.js';
export default {
  ...config,
  testMatch: ['**/updates.spec.js', '**/drafting.spec.js', '**/editor-stability.spec.js', '**/scene-number-gutter.spec.js', '**/active-element.spec.js', '**/element-margins.spec.js', '**/page-continuations.spec.js', '**/format-profile.spec.js', '**/scene-spacing.spec.js', '**/export-compatibility.spec.js', '**/final-features.spec.js', '**/pdf-repair.spec.js', '**/editor-fixes.spec.js', '**/title-paste.spec.js', '**/library-workflows.spec.js', '**/startup.spec.js', '**/transitions.spec.js', '**/folders.spec.js', '**/local-helper.spec.js', '**/library-actions.spec.js', '**/pdf-save.spec.js', '**/screenplay-settings.spec.js', '**/table-read.spec.js', '**/character-rename.spec.js', '**/scene-autocomplete.spec.js', '**/save-performance.spec.js', '**/onnx-voices.spec.js', '**/piper-proof.spec.js'],
  use: { ...config.use, channel: undefined, browserName: 'webkit' },
};
