export const selectionLimit = 8000;

// This session deliberately has no storage or network dependency. Only explicit
// Save note / Add word actions may persist a selection translation.
export class SelectionSession {
  snapshot = { collecting: false, fragments: [], entry: null };

  get busy() { return this.snapshot.entry?.status === 'running'; }

  select(input, blocked = false) {
    if (blocked || this.busy) return 'busy';
    const text = String(input.text || '').trim();
    if (!text) return 'empty';
    if (text.length > selectionLimit) return 'limit';
    const fragment = { text, page: input.page, rects: input.rects || [] };
    if (this.snapshot.collecting) {
      if (this.snapshot.fragments.some(f => f.page === fragment.page && f.text === text)) return 'duplicate';
      const fragments = [...this.snapshot.fragments, fragment];
      if (joinedSelection(fragments).text.length > selectionLimit) return 'limit';
      this.snapshot = { ...this.snapshot, fragments };
    } else {
      this.snapshot = { collecting: false, fragments: [], entry: this.makeEntry([fragment]) };
    }
    return 'accepted';
  }

  toggle(blocked = false) {
    if (blocked || this.busy) return 'busy';
    const { collecting, fragments } = this.snapshot;
    this.snapshot = collecting
      ? { collecting: false, fragments: [], entry: fragments.length ? this.makeEntry(fragments) : null }
      : { collecting: true, fragments: [], entry: null };
    return 'accepted';
  }

  makeEntry(fragments) {
    return { id: crypto.randomUUID(), ...joinedSelection(fragments), status: 'queued', text: '', error: '' };
  }

  begin() {
    const entry = this.snapshot.entry;
    if (this.snapshot.collecting || entry?.status !== 'queued') return null;
    this.patch(entry.id, { status: 'running' });
    return this.snapshot.entry;
  }

  patch(id, changes) {
    if (this.snapshot.entry?.id !== id) return false;
    this.snapshot = { ...this.snapshot, entry: { ...this.snapshot.entry, ...changes } };
    return true;
  }

  clear(blocked = false) {
    if (blocked || this.busy) return 'busy';
    this.snapshot = { collecting: false, fragments: [], entry: null };
    return 'accepted';
  }
}

export function joinedSelection(fragments) {
  const pages = [...new Set(fragments.map(f => f.page))];
  // Keep exact selection boundaries. The model receives both pages as context;
  // joining with a space also preserves a hyphen at a page boundary for review.
  const text = fragments.map(f => f.text).join('\n\n');
  return { original: text, text, page: pages[0], pages, rects: fragments.length === 1 ? fragments[0].rects : [], fragments };
}
