import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/parse/csv';

describe('parseCsv', () => {
  it('splits rows and keeps quoted commas', () => {
    expect(parseCsv('a,b\n1,"2,3"\n')).toEqual([
      ['a', 'b'],
      ['1', '2,3'],
    ]);
  });

  it('keeps newlines inside quotes', () => {
    expect(parseCsv('x,"l1\nl2",y')).toEqual([['x', 'l1\nl2', 'y']]);
  });

  it('reads doubled quotes as one quote', () => {
    expect(parseCsv('"he said ""hi""",z')).toEqual([['he said "hi"', 'z']]);
  });

  it('drops a byte order mark and accepts CRLF', () => {
    expect(parseCsv('\uFEFFa,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('accepts old Mac line endings', () => {
    expect(parseCsv('a\rb')).toEqual([['a'], ['b']]);
  });

  it('keeps empty cells', () => {
    expect(parseCsv(',,')).toEqual([['', '', '']]);
  });

  it('keeps empty rows in the middle', () => {
    expect(parseCsv('a\n\nb')).toEqual([['a'], [''], ['b']]);
  });

  it('keeps cells untrimmed', () => {
    expect(parseCsv('Date, Ref.No')).toEqual([['Date', ' Ref.No']]);
  });

  it('keeps a row that holds only an empty quoted cell', () => {
    expect(parseCsv('""')).toEqual([['']]);
  });

  it('returns nothing for empty text', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
