import { parseDocument, type Document } from './parse/document.ts';
import { renderHtml, type HtmlOptions } from './render/html.ts';
import type { Diagnostic } from './model.ts';

export { parseDocument, renderDocument } from './parse/document.ts';
export { formatDiagnostic } from './diagnostics.ts';
export { renderHtml } from './render/html.ts';
export type * from './model.ts';
export type { Document, Figure, Weave } from './parse/document.ts';
export type { HtmlOptions } from './render/html.ts';

export interface BuildResult {
  html: string;
  diagnostics: Diagnostic[];
  document: Document;
}

export function parse(source: string): Document {
  return parseDocument(source);
}

export function check(source: string): Diagnostic[] {
  return parseDocument(source).diagnostics;
}

export function build(source: string, options: HtmlOptions = {}): BuildResult {
  const document = parseDocument(source);
  return { html: renderHtml(document, options), diagnostics: document.diagnostics, document };
}
