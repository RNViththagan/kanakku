import type { Document, LineCounter } from 'yaml';

export type Path = ReadonlyArray<PropertyKey>;

export function formatPath(path: Path): string {
  return path
    .map((part, index) =>
      typeof part === 'number' ? `[${part}]` : `${index > 0 ? '.' : ''}${String(part)}`,
    )
    .join('');
}

export function lineOf(doc: Document, lines: LineCounter, path: Path): number | undefined {
  for (let size = path.length; size >= 0; size -= 1) {
    const node = size === 0 ? doc.contents : doc.getIn(path.slice(0, size), true);
    if (node && typeof node === 'object' && 'range' in node && Array.isArray(node.range)) {
      return lines.linePos(node.range[0]).line;
    }
  }
  return undefined;
}
