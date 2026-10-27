import type { Diagnostic, Diagram, Html, Ref } from './model.ts';

export interface Figure {
  domId: string;
  diagram: Diagram;
  refs: Ref[];
}

export interface Document {
  title?: string;
  figures: Figure[];
  refs: Ref[];
  diagnostics: Diagnostic[];
}

export interface Weave {
  figure(figure: Figure): Html;
  refOpen(ref: Ref, figure: Figure): Html;
}

export declare function parseDocument(source: string): Document;
export declare function renderDocument(document: Document, weave: Weave): Html;
