// Public API.
import { parseDocument, type PressDocument } from './parse/document.ts';
import { renderHtml, type HtmlOptions } from './render/html.ts';
import type { Diagnostic } from './model.ts';

export { parseDocument, formatDiagnostic } from './parse/document.ts';
export { renderHtml } from './render/html.ts';
export type * from './model.ts';
export type { PressDocument } from './parse/document.ts';

export interface BuildResult {
  html: string;
  diagnostics: Diagnostic[];
  document: PressDocument;
}

export function build(source: string, options: HtmlOptions = {}): BuildResult {
  const document = parseDocument(source);
  return { html: renderHtml(document, options), diagnostics: document.diagnostics, document };
}
