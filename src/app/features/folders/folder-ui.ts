import { FolderInventory, MusicInputs } from '../../core/music/models';
export const folderRoot = '/inventario/carpetas';
export function folderReturn(value: string | null): string {
  return value && /^\/inventario\/carpetas(?:\?[^#]*)?$/.test(value)
    ? value
    : folderRoot;
}
export function folderStatus(row: FolderInventory): string {
  return row.archived
    ? 'Archivada'
    : row.usable
      ? 'Utilizable'
      : 'No utilizable';
}
export function folderPayload(
  row: FolderInventory,
): MusicInputs['FOLDER_SAVE'] {
  return {
    code: row.code,
    repertoire_code: row.repertoire_code,
    voice_id: row.voice_id,
    notes: row.notes,
    manually_blocked: row.manually_blocked,
    archived: row.archived,
  };
}
// Keep a request identity when retrying an unchanged operation after a lost response.
export class StableRequest {
  private fingerprint = '';
  private id = '';
  for(payload: unknown) {
    const next = JSON.stringify(payload);
    if (next !== this.fingerprint) {
      this.fingerprint = next;
      this.id = crypto.randomUUID();
    }
    return this.id;
  }
}
