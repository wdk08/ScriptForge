import { orderedSelection } from './editing.js';
import { PAGE } from './pagination.js';

const selectionCommands = new Set(['insert', 'paste', 'enter', 'lineBreak', 'delete', 'backspace']);

export function affectedPageCount(document, selection, command, pages) {
  const ranges = new Map();
  function add(id, start, end) {
    if (end <= start) return;
    if (!ranges.has(id)) ranges.set(id, []);
    ranges.get(id).push({ start, end });
  }
  if (command.type === 'replaceMatches') {
    for (const match of command.matches) {
      if (match.text !== command.replacement) add(match.id, match.start, match.end);
    }
  } else if (command.type === 'restoreVersion') {
    const restored = new Map(command.document.elements.map(el => [el.id, el.text]));
    for (const el of document.elements) {
      const other = restored.get(el.id) ?? '';
      if (other === el.text) continue;
      let start = 0, end = el.text.length, otherEnd = other.length;
      while (start < Math.min(end, otherEnd) && el.text[start] === other[start]) start++;
      while (end > start && otherEnd > start && el.text[end - 1] === other[otherEnd - 1]) {
        end--; otherEnd--;
      }
      add(el.id, start, end);
    }
  } else if (selectionCommands.has(command.type)) {
    const { elements, first, last, start, end } = orderedSelection(document, selection);
    if (first === last && start.offset === end.offset) return 0;
    for (let i = first; i <= last; i++) {
      const el = elements[i];
      add(el.id, i === first ? start.offset : 0, i === last ? end.offset : el.text.length);
    }
  }
  if (!ranges.size) return 0;

  for (const [id, intervals] of ranges) {
    const merged = [];
    for (const interval of intervals.sort((a, b) => a.start - b.start)) {
      const previous = merged.at(-1);
      if (previous && previous.end >= interval.start) previous.end = Math.max(previous.end, interval.end);
      else merged.push(interval);
    }
    ranges.set(id, merged);
  }
  const coverage = line => {
    if (!line || line.start === line.end) return 0;
    const removed = (ranges.get(line.id) ?? []).reduce((sum, interval) =>
      sum + Math.max(0, Math.min(line.end, interval.end) - Math.max(line.start, interval.start)), 0);
    return removed / (line.end - line.start);
  };
  let height = 0;
  for (const page of pages) {
    let previousFull = false;
    for (const item of page.items) {
      let full = true, touched = false;
      const rows = Math.max(0, ...item.columns.map(column => column.length));
      for (let row = 0; row < rows; row++) {
        const sides = item.columns.map(column => column[row]).filter(line => line && line.end > line.start);
        const amounts = sides.map(coverage);
        const amount = Math.max(0, ...amounts);
        height += amount * PAGE.lineHeight;
        touched ||= amount > 0;
        full &&= amounts.every(value => value === 1);
      }
      if (touched && full && previousFull) height += item.gap;
      previousFull = touched && full;
    }
  }
  return height / PAGE.contentHeight;
}

export function confirmLargeDeletion(pages, copyCut) {
  const dialog = document.getElementById('large-deletion-dialog');
  const approve = document.getElementById('large-deletion-confirm');
  document.getElementById('large-deletion-description').textContent =
    'This edit will remove approximately ' + pages.toFixed(1) + ' pages of screenplay content.';
  approve.textContent = copyCut ? 'Cut' : 'Delete';
  dialog.returnValue = 'cancel';
  const form = dialog.querySelector('form');
  return new Promise((resolve, reject) => {
    form.onsubmit = copyCut ? event => {
      if (event.submitter !== approve) return;
      event.preventDefault();
      approve.disabled = true;
      // Start the write inside the trusted submit event for Safari and WebKit.
      let write;
      try { write = copyCut(); } catch (error) { write = Promise.reject(error); }
      Promise.resolve(write).then(() => {
        if (dialog.open) dialog.close('delete');
      }).catch(error => {
        reject(error);
        if (dialog.open) dialog.close('cancel');
      });
    } : null;
    dialog.addEventListener('close', () => {
      form.onsubmit = null;
      approve.disabled = false;
      resolve(dialog.returnValue === 'delete');
    }, { once: true });
    dialog.showModal();
    approve.focus();
  });
}
