export const selectionLimit: number;
export type Fragment = {text: string; page: number; rects: number[][]};
export type SelectionEntry = {id: string; original: string; text: string; page: number; pages: number[]; rects: number[][]; fragments: Fragment[]; status: 'queued'|'running'|'done'|'error'; error: string; researchId?: string; model?: string; vocabulary?: import('./ai-types').Vocabulary|null; wordSaved?: boolean; wordError?: string};
export type SelectionSnapshot = {collecting: boolean; fragments: Fragment[]; entry: SelectionEntry|null};
export class SelectionSession {
 snapshot: SelectionSnapshot;
 get busy(): boolean;
 select(input: Fragment, blocked?: boolean): string;
 toggle(blocked?: boolean): string;
 begin(): SelectionEntry|null;
 patch(id: string, changes: Partial<SelectionEntry>): boolean;
 clear(blocked?: boolean): string;
}
export function joinedSelection(fragments: Fragment[]): {original:string; text:string; page:number; pages:number[]; rects:number[][]; fragments:Fragment[]};
