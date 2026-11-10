import { builtInDialogueTags } from './character-cues.js';
import { isBuiltInTransition } from './transitions.js';
import { deletionThreshold, normalizeWritingRule, ruleKey, saveWritingPreferences, watchWritingPreferences, writingPreferences } from './writing-preferences.js';
import { analyzeProfanity, defaultProfanityGroups, variationKey } from './profanity.js';

const $ = id => document.getElementById(id);
function node(tag, text = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}
function button(text, action) {
  const control = node('button', text);
  control.type = 'button';
  control.onclick = action;
  return control;
}
function field(label, value, change, type = 'text') {
  const wrapper = node('label', label + ' ');
  const input = node('input');
  input.type = type;
  if (type === 'checkbox') input.checked = value;
  else input.value = value;
  input.onchange = () => change(type === 'checkbox' ? input.checked : input.value);
  wrapper.append(input);
  return wrapper;
}

export function setupWritingRules() {
  const status = $('writing-rules-status');
  const report = change => value => {
    try { change(value); status.textContent = 'Preference saved.'; }
    catch (error) { status.textContent = error.message; }
  };
  for (const [kind, label, builtIn] of [
    ['transitions', 'Transition', isBuiltInTransition],
    ['tags', 'Dialogue tag', value => builtInDialogueTags.includes(ruleKey(value))],
  ]) {
    const list = $(kind + '-rules');
    const form = $(kind + '-train');
    function update(input, index) {
      const rules = [...writingPreferences()[kind]];
      const value = normalizeWritingRule(kind, input);
      if (builtIn(value) || rules.some((rule, i) => i !== index && rule === value)) throw new Error('This rule already exists.');
      if (index === undefined) rules.push(value);
      else rules[index] = value;
      saveWritingPreferences({ [kind]: rules });
    }
    function render() {
      list.replaceChildren();
      writingPreferences()[kind].forEach((value, index) => {
        const row = node('li');
        row.append(field(label + ' ' + (index + 1), value, report(input => update(input, index))),
          button('Remove', report(() => saveWritingPreferences({ [kind]: writingPreferences()[kind].filter((_, i) => i !== index) }))));
        list.append(row);
      });
    }
    form.onsubmit = event => {
      event.preventDefault();
      const input = form.querySelector('input');
      report(value => { update(value); input.value = ''; })(input.value);
    };
    watchWritingPreferences(render);
    render();
  }
  const threshold = $('large-deletion-pages');
  threshold.value = deletionThreshold();
  threshold.onchange = () => report(value => {
    const pages = Number(value);
    if (!Number.isFinite(pages) || pages < .25 || pages > 1000) {
      threshold.value = deletionThreshold();
      throw new Error('Enter a threshold between 0.25 and 1,000 pages.');
    }
    saveWritingPreferences({ deletionPages: pages });
  })(threshold.value);
  watchWritingPreferences(() => { threshold.value = deletionThreshold(); });
}

export function setupProfanityAnalyzer({ getDocument, navigate }) {
  const dialog = $('profanity-dialog'), dictionary = $('profanity-dictionary');
  const groupFilter = $('profanity-group'), variationFilter = $('profanity-variation'), sceneFilter = $('profanity-scene');
  const status = $('profanity-status');
  let groups, analyzedGroups, analyzedDocument, analysis, timer, visibleCount = 100;

  function change(edit, structural = true) {
    try {
      const next = structuredClone(groups);
      edit(next);
      // Preserve focus while editing fields. Structural edits rebuild the list.
      groups = next;
      try { saveWritingPreferences({ profanityGroups: next }); }
      catch (error) { groups = writingPreferences().profanityGroups ?? defaultProfanityGroups(); throw error; }
      if (structural) renderDictionary();
      status.textContent = '';
      refresh();
      return true;
    } catch (error) { status.textContent = error.message; return false; }
  }

  function checkedLabel(label, checked, edit) {
    const wrapper = field(label, checked, () => {}, 'checkbox');
    const input = wrapper.querySelector('input');
    input.onchange = () => { if (!change(next => edit(next, input.checked), false)) input.checked = !input.checked; };
    return wrapper;
  }

  function textField(label, value, edit) {
    const wrapper = field(label, value, () => {});
    const input = wrapper.querySelector('input');
    input.maxLength = 120;
    let saved = value;
    input.onchange = () => {
      if (change(next => edit(next, input.value), false)) saved = input.value;
      else input.value = saved;
    };
    return wrapper;
  }

  function term(value) {
    const cleaned = value.trim();
    if (!cleaned || cleaned.length > 120) throw new Error('Enter a name or phrase of up to 120 characters.');
    return cleaned;
  }

  function updateVariation(next, gi, vi, value) {
    const variants = next[gi].variations, text = term(value);
    if (variants.some((item, i) => i !== vi && variationKey(item.text) === variationKey(text))) throw new Error('This variation already exists in the group.');
    if (vi === undefined) variants.push({ text, enabled: true });
    else variants[vi].text = text;
  }

  function renderDictionary() {
    dictionary.replaceChildren();
    groups.forEach((group, gi) => {
      const section = node('fieldset');
      section.append(node('legend', group.name),
        textField('Group name', group.name, (next, value) => {
          next[gi].name = term(value);
          section.querySelector('legend').textContent = next[gi].name;
        }),
        checkedLabel('Enabled', group.enabled, (next, checked) => { next[gi].enabled = checked; }),
        button('Delete group', () => change(next => next.splice(gi, 1))));
      group.variations.forEach((variation, vi) => {
        const row = node('div');
        row.append(textField('Variation ' + (vi + 1), variation.text, (next, value) => updateVariation(next, gi, vi, value)),
          checkedLabel('Enabled', variation.enabled, (next, checked) => { next[gi].variations[vi].enabled = checked; }),
          button('Remove variation', () => change(next => next[gi].variations.splice(vi, 1))));
        section.append(row);
      });
      const entry = node('input');
      entry.maxLength = 120;
      entry.setAttribute('aria-label', 'New variation for ' + group.name);
      section.append(entry, button('Add variation', () => change(next => updateVariation(next, gi, undefined, entry.value))));
      dictionary.append(section);
    });
  }

  function fillOptions(select, all, entries) {
    const selected = select.value;
    select.replaceChildren(new Option(all, ''), ...entries.map(([value, label]) => new Option(label, value)));
    select.value = entries.some(([value]) => value === selected) ? selected : '';
  }

  function refresh() {
    if (!dialog.open) return;
    const doc = getDocument();
    if (doc !== analyzedDocument || groups !== analyzedGroups) {
      analysis = analyzeProfanity(doc, groups);
      analyzedDocument = doc;
      analyzedGroups = groups;
    }
    fillOptions(groupFilter, 'All groups', groups.map((group, i) => [String(i), group.name]));
    fillOptions(variationFilter, 'All variations', groups.flatMap((group, i) => groupFilter.value && groupFilter.value !== String(i) ? [] :
      group.variations.map((variant, j) => [i + ':' + j, group.name + ' · ' + variant.text])));
    fillOptions(sceneFilter, 'All scenes', analysis.scenes.map(scene => [scene.id || 'front', scene.label]));
    const matches = analysis.matches.filter(match =>
      (!groupFilter.value || groupFilter.value === String(match.groupIndex)) &&
      (!variationFilter.value || variationFilter.value === match.groupIndex + ':' + match.variationIndex) &&
      (!sceneFilter.value || sceneFilter.value === (match.sceneId || 'front')));
    $('profanity-totals').textContent = analysis.matches.length + ' occurrences · ' + analysis.unique + ' unique variations · ' + matches.length + ' shown by filters';
    const expanded = new Set([...$('profanity-counts').querySelectorAll('details[open]')].map(item => item.dataset.group));
    $('profanity-counts').replaceChildren(...groups.map((group, i) => {
      const counts = analysis.variationCounts[i];
      const list = node('ul');
      list.append(...group.variations.map((variant, j) => node('li', variant.text + ' · ' + counts[j] + (variant.enabled ? '' : ' (off)'))));
      const row = node('details');
      row.dataset.group = group.name;
      row.open = expanded.has(group.name);
      row.append(node('summary', group.name + ' · ' + counts.reduce((a, b) => a + b, 0) + (group.enabled ? '' : ' (off)')), list);
      return row;
    }));
    const sceneCounts = new Map();
    for (const match of matches) sceneCounts.set(match.sceneId, (sceneCounts.get(match.sceneId) ?? 0) + 1);
    const breakdown = new Map(analysis.scenes.map(scene => [scene.id, scene.label]));
    $('profanity-scene-counts').replaceChildren(...[...sceneCounts].map(([id, count]) => node('li', breakdown.get(id) + ' · ' + count)));
    $('profanity-occurrences').replaceChildren(...matches.slice(0, visibleCount).map(match => {
      const row = node('li');
      row.append(button(match.text + ' · ' + breakdown.get(match.sceneId), () => {
        if (getDocument() !== analyzedDocument) { refresh(); return; }
        navigate(match);
      }));
      return row;
    }));
    $('profanity-more').hidden = visibleCount >= matches.length;
  }

  groups = writingPreferences().profanityGroups ?? defaultProfanityGroups();
  watchWritingPreferences(() => {
    const next = writingPreferences().profanityGroups;
    if (next && groups !== next) { groups = next; if (dialog.open) renderDictionary(); }
    refresh();
  });
  $('profanity-analyzer').onclick = () => {
    if (!dialog.open) { dialog.show(); renderDictionary(); }
    refresh();
  };
  $('profanity-close').onclick = () => dialog.close();
  $('profanity-add-group').onclick = () => {
    const input = $('profanity-new-group');
    if (change(next => next.push({ name: term(input.value), enabled: true, variations: [] }))) input.value = '';
  };
  $('profanity-reset').onclick = () => { $('profanity-reset-confirm').showModal(); };
  $('profanity-reset-yes').onclick = () => {
    change(next => next.splice(0, next.length, ...defaultProfanityGroups()));
    $('profanity-reset-confirm').close();
  };
  for (const filter of [groupFilter, variationFilter, sceneFilter]) filter.onchange = () => { visibleCount = 100; refresh(); };
  $('profanity-more').onclick = () => { visibleCount += 100; refresh(); };
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') dialog.close(); });
  return () => {
    if (!dialog.open) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 200);
  };
}
