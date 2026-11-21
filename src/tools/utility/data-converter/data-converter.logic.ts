import JSZip from 'jszip';

export interface TableSheet {
  name: string;
  headers: string[];
  rows: string[][];
}

export type CsvDelimiter = ',' | ';' | '\t';

export interface JsonValidationResult {
  valid: boolean;
  formatted?: string;
  error?: string;
  itemCount?: number;
  rootType?: 'array' | 'object' | 'primitive';
}

export function detectCsvDelimiter(input: string): CsvDelimiter {
  const firstLine = input
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);
  if (!firstLine) return ',';

  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) {
      counts[ch] += 1;
    }
  }

  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
  return ',';
}

export function parseCsv(input: string, delimiter?: CsvDelimiter): TableSheet {
  const cleaned = input.replace(/^\uFEFF/, '');
  const sep = delimiter ?? detectCsvDelimiter(cleaned);

  const rawRows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === sep) {
        row.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field);
        rawRows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field);
        rawRows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rawRows.push(row);
  }

  const nonEmpty = rawRows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length === 0) {
    return { name: 'Sheet1', headers: [], rows: [] };
  }

  const maxCols = Math.max(...nonEmpty.map((r) => r.length));
  const normalizeRow = (r: string[]): string[] => {
    const out = r.slice();
    while (out.length < maxCols) out.push('');
    return out;
  };

  const headers = normalizeRow(nonEmpty[0]).map((h, idx) => h.trim() || `Column_${idx + 1}`);
  const rows = nonEmpty.slice(1).map(normalizeRow);
  return { name: 'Sheet1', headers, rows };
}

export function stringifyCsv(sheet: TableSheet, delimiter: CsvDelimiter = ','): string {
  const escapeCell = (val: string): string => {
    const s = val ?? '';
    if (
      s.includes(delimiter) ||
      s.includes('"') ||
      s.includes('\n') ||
      s.includes('\r')
    ) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines: string[] = [];
  if (sheet.headers.length > 0) {
    lines.push(sheet.headers.map(escapeCell).join(delimiter));
  }
  for (const r of sheet.rows) {
    lines.push(r.map(escapeCell).join(delimiter));
  }
  return lines.join('\r\n');
}

function sortObjectKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortObjectKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function formatJson(
  raw: string,
  options: { indent?: number | '\t'; minify?: boolean; sortKeys?: boolean } = {},
): JsonValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, error: 'JSON kosong.' };
  }
  try {
    const parsed = JSON.parse(trimmed);
    const data = options.sortKeys ? sortObjectKeysDeep(parsed) : parsed;
    const formatted = options.minify
      ? JSON.stringify(data)
      : JSON.stringify(data, null, options.indent ?? 2);

    const rootType = Array.isArray(parsed)
      ? 'array'
      : parsed !== null && typeof parsed === 'object'
        ? 'object'
        : 'primitive';
    const itemCount =
      rootType === 'array'
        ? (parsed as unknown[]).length
        : rootType === 'object'
          ? Object.keys(parsed as Record<string, unknown>).length
          : 1;

    return { valid: true, formatted, itemCount, rootType };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Format JSON tidak valid.',
    };
  }
}

export function jsonToTable(raw: string): TableSheet {
  const parsed = JSON.parse(raw.trim());
  const records: Record<string, unknown>[] = Array.isArray(parsed)
    ? parsed.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : { value: item },
      )
    : parsed !== null && typeof parsed === 'object'
      ? [parsed as Record<string, unknown>]
      : [{ value: parsed }];

  if (records.length === 0) {
    return { name: 'Data', headers: [], rows: [] };
  }

  const headerSet = new Set<string>();
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      headerSet.add(key);
    }
  }
  const headers = Array.from(headerSet);
  const rows = records.map((rec) =>
    headers.map((key) => {
      const val = rec[key];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    }),
  );

  return { name: 'Data', headers, rows };
}

export function tableToJson(sheet: TableSheet, indent = 2): string {
  const objects = sheet.rows.map((row) => {
    const obj: Record<string, string | number | boolean> = {};
    sheet.headers.forEach((header, idx) => {
      const raw = row[idx] ?? '';
      if (raw === 'true') obj[header] = true;
      else if (raw === 'false') obj[header] = false;
      else if (raw !== '' && !Number.isNaN(Number(raw)) && !/^0\d+/.test(raw)) {
        obj[header] = Number(raw);
      } else {
        obj[header] = raw;
      }
    });
    return obj;
  });
  return JSON.stringify(objects, null, indent);
}

// =========================================================================
// Office Open XML (.xlsx) Reader & Writer using JSZip (0 extra dependencies)
// =========================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function colIndexToLetter(index: number): string {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function colLetterToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, '').trim();
  return (cleaned || 'Sheet1').slice(0, 31);
}

export async function buildXlsxUint8Array(sheet: TableSheet): Promise<Uint8Array> {
  const zip = new JSZip();
  const sheetName = sanitizeSheetName(sheet.name || 'Sheet1');
  const allRows: string[][] =
    sheet.headers.length > 0 ? [sheet.headers, ...sheet.rows] : sheet.rows;

  const rowXmlParts: string[] = [];
  for (let r = 0; r < allRows.length; r++) {
    const rowNum = r + 1;
    const cellsXml: string[] = [];
    const row = allRows[r];
    for (let c = 0; c < row.length; c++) {
      const ref = `${colIndexToLetter(c)}${rowNum}`;
      const val = row[c] ?? '';
      const isHeader = r === 0 && sheet.headers.length > 0;
      const isNumeric =
        !isHeader &&
        val.trim() !== '' &&
        /^-?\d+(\.\d+)?$/.test(val.trim()) &&
        !/^0\d+/.test(val.trim());

      if (isNumeric) {
        cellsXml.push(`<c r="${ref}"><v>${val.trim()}</v></c>`);
      } else {
        const styleAttr = isHeader ? ' s="1"' : '';
        cellsXml.push(
          `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(val)}</t></is></c>`,
        );
      }
    }
    rowXmlParts.push(`<row r="${rowNum}">${cellsXml.join('')}</row>`);
  }

  const worksheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rowXmlParts.join('')}</sheetData>` +
    '</worksheet>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="2">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs>' +
    '</styleSheet>';

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';

  const workbookRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml);
  zip.file('xl/styles.xml', stylesXml);
  zip.file('xl/worksheets/sheet1.xml', worksheetXml);

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function buildXlsxBlob(sheet: TableSheet): Promise<Blob> {
  const bytes = await buildXlsxUint8Array(sheet);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function parseSharedStringsXml(xml: string): string[] {
  const strings: string[] = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRegex.exec(xml)) !== null) {
    const body = match[1];
    const tParts: string[] = [];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(body)) !== null) {
      tParts.push(unescapeXml(tMatch[1]));
    }
    strings.push(tParts.join(''));
  }
  return strings;
}

function parseWorksheetXml(xml: string, sharedStrings: string[], name: string): TableSheet {
  const rawRows: string[][] = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowBody = rowMatch[1];
    const cells: string[] = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    let implicitCol = 0;

    while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
      const attrs = cellMatch[1];
      const cellBody = cellMatch[2];
      const refMatch = /\br="([A-Z]+)\d+"/.exec(attrs);
      const colIdx = refMatch ? colLetterToIndex(refMatch[1]) : implicitCol;
      implicitCol = colIdx + 1;

      const typeMatch = /\bt="([^"]+)"/.exec(attrs);
      const cellType = typeMatch ? typeMatch[1] : '';

      let value = '';
      if (cellType === 'inlineStr') {
        const tParts: string[] = [];
        const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let tMatch: RegExpExecArray | null;
        while ((tMatch = tRegex.exec(cellBody)) !== null) {
          tParts.push(unescapeXml(tMatch[1]));
        }
        value = tParts.join('');
      } else {
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellBody);
        const rawVal = vMatch ? unescapeXml(vMatch[1]) : '';
        if (cellType === 's') {
          const idx = Number(rawVal);
          value = Number.isInteger(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
        } else if (cellType === 'b') {
          value = rawVal === '1' ? 'TRUE' : 'FALSE';
        } else {
          value = rawVal;
        }
      }

      while (cells.length <= colIdx) cells.push('');
      cells[colIdx] = value;
    }

    if (cells.some((c) => c.trim() !== '')) {
      rawRows.push(cells);
    }
  }

  if (rawRows.length === 0) {
    return { name, headers: [], rows: [] };
  }

  const maxCols = Math.max(...rawRows.map((r) => r.length));
  const normalize = (r: string[]) => {
    const out = r.slice();
    while (out.length < maxCols) out.push('');
    return out;
  };

  const headers = normalize(rawRows[0]).map((h, idx) => h.trim() || `Column_${idx + 1}`);
  const rows = rawRows.slice(1).map(normalize);
  return { name, headers, rows };
}

export async function parseXlsxBuffer(buffer: ArrayBuffer | Uint8Array): Promise<TableSheet[]> {
  const zip = await JSZip.loadAsync(buffer);

  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsFile
    ? parseSharedStringsXml(await sharedStringsFile.async('string'))
    : [];

  // Map sheet names from workbook.xml and targets from workbook.xml.rels
  const workbookXml = (await zip.file('xl/workbook.xml')?.async('string')) ?? '';
  const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '';

  const relMap = new Map<string, string>();
  const relRegex = /<Relationship\b([^>]*)\/?\s*>/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relRegex.exec(relsXml)) !== null) {
    const idMatch = /\bId="([^"]+)"/.exec(relMatch[1]);
    const targetMatch = /\bTarget="([^"]+)"/.exec(relMatch[1]);
    if (idMatch && targetMatch) {
      relMap.set(idMatch[1], targetMatch[1].replace(/^\/+/, ''));
    }
  }

  const sheets: TableSheet[] = [];
  const sheetRegex = /<sheet\b([^>]*)\/?\s*>/g;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetRegex.exec(workbookXml)) !== null) {
    const attrs = sheetMatch[1];
    const nameMatch = /\bname="([^"]+)"/.exec(attrs);
    const ridMatch = /\br:id="([^"]+)"/.exec(attrs);
    const name = nameMatch ? unescapeXml(nameMatch[1]) : `Sheet${sheets.length + 1}`;
    const target = ridMatch ? relMap.get(ridMatch[1]) : undefined;
    const fullPath = target
      ? target.startsWith('xl/')
        ? target
        : `xl/${target}`
      : `xl/worksheets/sheet${sheets.length + 1}.xml`;

    const wsFile = zip.file(fullPath);
    if (wsFile) {
      const wsXml = await wsFile.async('string');
      sheets.push(parseWorksheetXml(wsXml, sharedStrings, name));
    }
  }

  if (sheets.length === 0) {
    const fallback = zip.file('xl/worksheets/sheet1.xml');
    if (fallback) {
      sheets.push(parseWorksheetXml(await fallback.async('string'), sharedStrings, 'Sheet1'));
    }
  }

  return sheets;
}
