const BYTE_ORDER_MARK = 0xfeff;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text;
}

export function parseCsv(text: string): string[][] {
  const input = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let started = false;
  let i = 0;

  const endRow = () => {
    row.push(cell);
    rows.push(row);
    row = [];
    cell = '';
    started = false;
  };

  while (i < input.length) {
    const char = input[i];
    if (char !== '\r' && char !== '\n') started = true;
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' || char === '\n') {
      endRow();
      if (char === '\r' && input[i + 1] === '\n') i += 1;
    } else {
      cell += char;
    }
    i += 1;
  }

  if (started) endRow();
  return rows;
}
