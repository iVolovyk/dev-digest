/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract.
   FileCard is exported for route-level composers (Smart Diff) that own their
   own grouping/collapse but reuse a single file's rendering — import it from
   here, never deep-import FileCard/FileCard. */
export { DiffViewer } from "./DiffViewer";
export { FileCard } from "./FileCard";
export type { DiffCommentApi } from "./comments";
/* Auto-expand threshold — part of the module contract now that route-level
   composers (Smart Diff) reimplement the open/closed policy on top of it. */
export { AUTO_EXPAND_MAX_LINES } from "./constants";
