/**
 * CSV cell escaping helpers.
 *
 * Defends against:
 *  - CSV/spreadsheet formula injection (CWE-1236) where cells starting with
 *    `=`, `+`, `-`, `@`, TAB or CR are interpreted as formulas by Excel /
 *    LibreOffice / Google Sheets. We prefix such values with a single quote
 *    (`'`) to neutralise execution while remaining human-readable.
 *  - Embedded delimiters and line breaks: any cell containing `,`, `"`, `\n`
 *    or `\r` is wrapped in double quotes with internal quotes doubled.
 */

const FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@', '\t', '\r', '\v'];

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = typeof value === 'string' ? value : String(value);

  if (str.length > 0 && FORMULA_TRIGGER_CHARS.includes(str.charAt(0))) {
    str = `'${str}`;
  }

  const needsQuoting =
    str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r');

  if (needsQuoting) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Joins a row of cells into a CSV-safe line.
 * Each cell is passed through {@link escapeCsvCell}.
 */
export function buildCsvRow(cells: ReadonlyArray<string | number | null | undefined>): string {
  return cells.map(escapeCsvCell).join(',');
}
