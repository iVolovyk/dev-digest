import { ALLOWED_EXTENSIONS, MAX_IMPORT_BYTES } from "./constants";

/** i18n key suffix under `skills.import` for a refused upload. */
export type ImportRejection = "tooLarge" | "badType";

/**
 * Guard an upload BEFORE it is read or sent: a 2 MB cap (the whole file is
 * base64'd into a JSON body, so this is also the request-size guard) and an
 * extension allow-list. Returns null when the file may be previewed.
 */
export function rejectImportFile(file: File): ImportRejection | null {
  if (file.size > MAX_IMPORT_BYTES) return "tooLarge";
  const name = file.name.toLowerCase();
  const known = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
  return known ? null : "badType";
}
