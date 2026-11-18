// Optional editor-only metadata. Fountain serialization uses the visible text.
function updateOffsets(selection, id, transform) {
  for (const key of ['anchor', 'focus']) {
    if (selection[key].id === id) selection[key].offset = transform(selection[key].offset);
  }
}

export function uppercaseForFormat(element, selection, preserveCase) {
  const original = element.text;
  element.text = original.toUpperCase();
  if (preserveCase && original !== element.text) {
    element.autoCase = { original, visible: element.text };
  }
  updateOffsets(selection, element.id, offset => original.slice(0, offset).toUpperCase().length);
}

function caseOffset(original, offset) {
  let visible = 0, source = 0;
  for (const char of original) {
    const length = char.toUpperCase().length;
    if (visible + length > offset) return { source, inside: true };
    visible += length;
    source += char.length;
  }
  return { source, inside: false };
}

export function trackFormattingEdits(element, before, exactRange) {
  if (!before || (before.text === element.text && (!exactRange || exactRange.start === exactRange.end))) return;
  const casing = before.autoCase?.visible === before.text ? before.autoCase : null;
  const brackets = before.autoParens?.visible === before.text && Array.isArray(before.autoParens.offsets) ? before.autoParens : null;
  delete element.autoCase;
  delete element.autoParens;
  if (!casing && !brackets) return;

  const old = before.text, text = element.text;
  let start = 0, oldEnd = old.length, end = text.length;
  if (exactRange && text.startsWith(old.slice(0, exactRange.start)) && text.endsWith(old.slice(exactRange.end))
      && text.length >= exactRange.start + old.length - exactRange.end) {
    start = exactRange.start;
    oldEnd = exactRange.end;
    end = text.length - (old.length - oldEnd);
  } else {
    while (start < Math.min(oldEnd, end) && old[start] === text[start]) start++;
    while (oldEnd > start && end > start && old[oldEnd - 1] === text[end - 1]) { oldEnd--; end--; }
  }
  if (casing) {
    const left = caseOffset(casing.original, start);
    const right = caseOffset(casing.original, oldEnd);
    if (!left.inside && !right.inside) {
      element.autoCase = {
        visible: text,
        original: casing.original.slice(0, left.source) + text.slice(start, end) + casing.original.slice(right.source),
      };
    }
  }
  if (brackets) {
    const offsets = brackets.offsets.flatMap(offset =>
      offset < start ? [offset] : offset >= oldEnd ? [offset + end - oldEnd] : []);
    if (offsets.length) element.autoParens = { visible: text, offsets };
  }
}

export function convertFormatting(element, type, selection) {
  if (element.type === 'parenthetical' && type !== 'parenthetical') {
    if (element.autoParens?.visible === element.text && Array.isArray(element.autoParens.offsets)) {
      const positions = element.autoParens.offsets;
      element.text = element.text.split('').filter((_, index) => !positions.includes(index)).join('');
      updateOffsets(selection, element.id, offset => offset - positions.filter(position => position < offset).length);
    }
    delete element.autoParens;
  }
  if (['character', 'transition'].includes(element.type) && !['character', 'transition'].includes(type)) {
    if (element.autoCase?.visible === element.text) {
      const { original } = element.autoCase;
      element.text = original;
      updateOffsets(selection, element.id, offset => caseOffset(original, offset).source);
    }
    delete element.autoCase;
  }
  if (type === 'parenthetical' && !/^\([\s\S]*\)$/.test(element.text)) {
    const { text } = element;
    element.text = '(' + text + ')';
    element.autoParens = { visible: element.text, offsets: [0, text.length + 1] };
    updateOffsets(selection, element.id, offset => offset + 1);
  }
}
