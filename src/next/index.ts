import type { Diagnostic } from './model.ts';
import type { Document } from './document.ts';

export interface BuildOptions {
  embedFonts?: boolean;
}

export declare function parse(source: string): Document;
export declare function check(source: string): Diagnostic[];
export declare function build(source: string, options?: BuildOptions): { html: string; diagnostics: Diagnostic[] };
export { formatDiagnostic } from './diagnostics.ts';

export type * from './model.ts';
export type { Document, Figure } from './document.ts';
