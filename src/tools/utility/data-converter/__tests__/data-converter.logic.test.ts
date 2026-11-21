import { describe, expect, it } from 'vitest';
import {
  buildXlsxUint8Array,
  detectCsvDelimiter,
  formatJson,
  jsonToTable,
  parseCsv,
  parseXlsxBuffer,
  stringifyCsv,
  tableToJson,
} from '../data-converter.logic';

describe('data-converter.logic', () => {
  it('detects semicolon and comma delimiters accurately', () => {
    expect(detectCsvDelimiter('nama;kota;jumlah\nBudi;Jakarta;10')).toBe(';');
    expect(detectCsvDelimiter('name,city,qty\nBudi,Jakarta,10')).toBe(',');
    expect(detectCsvDelimiter('name\tcity\tqty\nBudi\tJakarta\t10')).toBe('\t');
  });

  it('parses RFC-4180 CSV with quoted commas, escaped quotes, and multiline fields', () => {
    const csv = 'Nama,Alamat,Catatan\n"Budi, S.T.","Jl. ""Merdeka"" No. 1","Baris 1\nBaris 2"';
    const sheet = parseCsv(csv, ',');
    expect(sheet.headers).toEqual(['Nama', 'Alamat', 'Catatan']);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0]).toEqual(['Budi, S.T.', 'Jl. "Merdeka" No. 1', 'Baris 1\nBaris 2']);
  });

  it('round-trips CSV stringify and parse cleanly', () => {
    const original = {
      name: 'Sheet1',
      headers: ['Produk', 'Harga', 'Catatan'],
      rows: [
        ['Kopi Tubruk', '15000', 'Panas, gula terpisah'],
        ['Teh Tarik', '12000', 'Dingin'],
      ],
    };
    const serialized = stringifyCsv(original, ',');
    const parsed = parseCsv(serialized, ',');
    expect(parsed.headers).toEqual(original.headers);
    expect(parsed.rows).toEqual(original.rows);
  });

  it('validates, formats, minifies, and sorts keys in JSON', () => {
    const res = formatJson('{"b":2,"a":1}', { indent: 2, sortKeys: true });
    expect(res.valid).toBe(true);
    expect(res.rootType).toBe('object');
    expect(res.itemCount).toBe(2);
    expect(res.formatted).toBe('{\n  "a": 1,\n  "b": 2\n}');

    const minified = formatJson('{\n  "a": 1\n}', { minify: true });
    expect(minified.formatted).toBe('{"a":1}');

    const bad = formatJson('{"a": }');
    expect(bad.valid).toBe(false);
    expect(bad.error).toBeTruthy();
  });

  it('converts between JSON array of objects and tabular sheet', () => {
    const json = '[{"nama":"Ani","umur":28,"aktif":true},{"nama":"Budi","umur":31,"aktif":false}]';
    const sheet = jsonToTable(json);
    expect(sheet.headers).toEqual(['nama', 'umur', 'aktif']);
    expect(sheet.rows).toEqual([
      ['Ani', '28', 'true'],
      ['Budi', '31', 'false'],
    ]);

    const backToJson = tableToJson(sheet, 0);
    expect(JSON.parse(backToJson)).toEqual([
      { nama: 'Ani', umur: 28, aktif: true },
      { nama: 'Budi', umur: 31, aktif: false },
    ]);
  });

  it('round-trips Office Open XML (.xlsx) via JSZip without external xlsx library', async () => {
    const sheet = {
      name: 'Laporan 2026',
      headers: ['Kode', 'Nama Item', 'Total'],
      rows: [
        ['001', 'Kertas A4 & Map', '45000'],
        ['002', 'Tinta Printer <Hitam>', '120500.5'],
      ],
    };
    const bytes = await buildXlsxUint8Array(sheet);
    expect(bytes.byteLength).toBeGreaterThan(200);

    const parsedSheets = await parseXlsxBuffer(bytes);
    expect(parsedSheets).toHaveLength(1);
    expect(parsedSheets[0].name).toBe('Laporan 2026');
    expect(parsedSheets[0].headers).toEqual(sheet.headers);
    expect(parsedSheets[0].rows).toEqual(sheet.rows);
  });
});
