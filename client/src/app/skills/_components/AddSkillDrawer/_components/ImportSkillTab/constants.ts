/** Hard client-side ceiling on an uploaded skill file (2 MB). */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Extensions the importer knows how to read. Anything else is refused here. */
export const ALLOWED_EXTENSIONS = [".md", ".markdown", ".txt", ".zip"] as const;

/** `accept` attribute of the file input, derived from the same list. */
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.join(",");

/** DOM id linking the "Choose a file" label to its input. */
export const FILE_INPUT_ID = "skill-import-file";
