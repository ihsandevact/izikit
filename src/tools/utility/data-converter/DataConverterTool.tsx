import { useMemo, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import {
  buildXlsxBlob,
  detectCsvDelimiter,
  formatJson,
  jsonToTable,
  parseCsv,
  parseXlsxBuffer,
  stringifyCsv,
  tableToJson,
  type CsvDelimiter,
  type TableSheet,
} from './data-converter.logic';

interface DataConverterToolProps {
  locale: Locale;
}

type WorkspaceMode = 'table' | 'json';

const SAMPLE_CSV_ID = `Kode,Produk,Kategori,Harga,Stok
PRD-01,Kopi Arabika Gayo,Minuman,45000,32
PRD-02,Teh Hijau Melati,Minuman,28000,50
PRD-03,Kue Nastar Premium,Makanan,85000,14`;

const SAMPLE_CSV_EN = `Code,Product,Category,Price,Stock
PRD-01,Gayo Arabica Coffee,Beverage,12.50,32
PRD-02,Jasmine Green Tea,Beverage,8.00,50
PRD-03,Butter Cookies Box,Bakery,18.00,14`;

const SAMPLE_JSON = `{
  "app": "izikit",
  "privacy": "100% local in browser",
  "features": ["CSV", "XLSX", "JSON"],
  "free": true
}`;

export default function DataConverterTool({ locale }: DataConverterToolProps) {
  const dict = getDictionary(locale);
  const isId = locale === 'id';

  const [mode, setMode] = useState<WorkspaceMode>('table');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasExported, setHasExported] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Table Converter state
  const [sourceName, setSourceName] = useState<string>('data');
  const [sheets, setSheets] = useState<TableSheet[]>(() => [
    parseCsv(isId ? SAMPLE_CSV_ID : SAMPLE_CSV_EN, ','),
  ]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [csvOutputDelimiter, setCsvOutputDelimiter] = useState<CsvDelimiter>(',');
  const [rawPaste, setRawPaste] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  // JSON Formatter state
  const [jsonInput, setJsonInput] = useState(SAMPLE_JSON);
  const [jsonIndent, setJsonIndent] = useState<2 | 4 | '\t'>(2);
  const [jsonSortKeys, setJsonSortKeys] = useState(false);

  const activeSheet = sheets[activeSheetIdx] ?? { name: 'Sheet1', headers: [], rows: [] };
  const previewRows = useMemo(() => activeSheet.rows.slice(0, 100), [activeSheet.rows]);

  const jsonResult = useMemo(
    () => formatJson(jsonInput, { indent: jsonIndent, sortKeys: jsonSortKeys }),
    [jsonInput, jsonIndent, jsonSortKeys],
  );

  const handleFilesSelected = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setErrorMsg(null);

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'data';

    try {
      if (ext === 'xlsx') {
        const buf = await file.arrayBuffer();
        const parsedSheets = await parseXlsxBuffer(buf);
        if (parsedSheets.length === 0 || parsedSheets[0].headers.length === 0) {
          throw new Error(
            isId ? 'File Excel kosong atau tidak memiliki lembar kerja yang terbaca.' : 'Excel file is empty or unreadable.',
          );
        }
        setSheets(parsedSheets);
        setActiveSheetIdx(0);
        setSourceName(baseName);
        setMode('table');
      } else if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        const text = await file.text();
        const detected = detectCsvDelimiter(text);
        const parsed = parseCsv(text, detected);
        setCsvOutputDelimiter(detected);
        setSheets([parsed]);
        setActiveSheetIdx(0);
        setSourceName(baseName);
        setMode('table');
      } else if (ext === 'json') {
        const text = await file.text();
        setJsonInput(text);
        setSourceName(baseName);
        if (mode === 'table') {
          const parsed = jsonToTable(text);
          setSheets([parsed]);
          setActiveSheetIdx(0);
        }
      } else {
        throw new Error(
          isId
            ? 'Format file tidak didukung. Gunakan file .csv, .xlsx, atau .json.'
            : 'Unsupported file format. Please use .csv, .xlsx, or .json.',
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membaca file.');
    }
  };

  const handleParsePasted = () => {
    const trimmed = rawPaste.trim();
    if (!trimmed) return;
    setErrorMsg(null);
    try {
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const sheet = jsonToTable(trimmed);
        setSheets([sheet]);
        setActiveSheetIdx(0);
        setSourceName('pasted-data');
        setShowPasteBox(false);
      } else {
        const sep = detectCsvDelimiter(trimmed);
        const sheet = parseCsv(trimmed, sep);
        setCsvOutputDelimiter(sep);
        setSheets([sheet]);
        setActiveSheetIdx(0);
        setSourceName('pasted-data');
        setShowPasteBox(false);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses teks yang ditempel.');
    }
  };

  const handleExportXlsx = async () => {
    if (activeSheet.headers.length === 0) return;
    setExportingXlsx(true);
    setErrorMsg(null);
    try {
      const blob = await buildXlsxBlob(activeSheet);
      downloadBlob(blob, `${sourceName}.xlsx`);
      setHasExported(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat file Excel (.xlsx).');
    } finally {
      setExportingXlsx(false);
    }
  };

  const handleExportCsv = () => {
    if (activeSheet.headers.length === 0) return;
    const csv = stringifyCsv(activeSheet, csvOutputDelimiter);
    // Add UTF-8 BOM so Microsoft Excel reads Indonesian/UTF-8 characters cleanly
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `${sourceName}.csv`);
    setHasExported(true);
  };

  const handleExportTableJson = () => {
    if (activeSheet.headers.length === 0) return;
    const json = tableToJson(activeSheet, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `${sourceName}.json`);
    setHasExported(true);
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      setErrorMsg(isId ? 'Browser tidak mengizinkan salin otomatis.' : 'Clipboard copy blocked.');
    }
  };

  const handlePrettyJson = () => {
    const res = formatJson(jsonInput, { indent: jsonIndent, sortKeys: jsonSortKeys });
    if (res.valid && res.formatted !== undefined) {
      setJsonInput(res.formatted);
    }
  };

  const handleMinifyJson = () => {
    const res = formatJson(jsonInput, { minify: true, sortKeys: jsonSortKeys });
    if (res.valid && res.formatted !== undefined) {
      setJsonInput(res.formatted);
    }
  };

  const handleOpenJsonAsTable = () => {
    try {
      const sheet = jsonToTable(jsonInput);
      setSheets([sheet]);
      setActiveSheetIdx(0);
      setMode('table');
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengonversi JSON ke tabel.');
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <ErrorAlert
          messages={[errorMsg]}
          dismissLabel={dict.shared.dismissError}
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      {/* Workspace Mode Switcher */}
      <div role="tablist" className="flex flex-wrap gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'table'}
          onClick={() => setMode('table')}
          className={`min-h-10 rounded-xl border px-4 py-2 text-xs font-bold transition-colors sm:text-sm ${
            mode === 'table'
              ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
          }`}
        >
          {isId ? 'Konversi Tabel (CSV ⇄ XLSX ⇄ JSON)' : 'Table Converter (CSV ⇄ XLSX ⇄ JSON)'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'json'}
          onClick={() => setMode('json')}
          className={`min-h-10 rounded-xl border px-4 py-2 text-xs font-bold transition-colors sm:text-sm ${
            mode === 'json'
              ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
          }`}
        >
          {isId ? 'JSON Formatter & Validator' : 'JSON Formatter & Validator'}
        </button>
      </div>

      {mode === 'table' ? (
        <div className="space-y-5">
          {/* Upload or Paste */}
          <div className="space-y-3">
            <Dropzone
              accept=".csv,.xlsx,.json,.tsv"
              multiple={false}
              idleLabel={dict.shared.dropzoneIdle}
              activeLabel={dict.shared.dropzoneActive}
              buttonLabel={dict.shared.dropzoneSelectButton}
              formatsHint={
                isId
                  ? 'File .csv, .xlsx (Excel), atau .json — diproses 100% di browser'
                  : '.csv, .xlsx (Excel), or .json — processed 100% locally'
              }
              onFilesSelected={handleFilesSelected}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowPasteBox((v) => !v)}
                className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                {showPasteBox
                  ? isId
                    ? 'Tutup kotak tempel teks'
                    : 'Hide paste box'
                  : isId
                    ? 'Atau tempel teks CSV / JSON langsung'
                    : 'Or paste raw CSV / JSON directly'}
              </button>

              {sheets.length > 1 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="sheet-select" className="text-xs font-semibold text-[var(--ink-muted)]">
                    Sheet:
                  </label>
                  <select
                    id="sheet-select"
                    value={activeSheetIdx}
                    onChange={(e) => setActiveSheetIdx(Number(e.target.value))}
                    className="rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)]"
                  >
                    {sheets.map((sh, idx) => (
                      <option key={`${sh.name}-${idx}`} value={idx}>
                        {sh.name} ({sh.rows.length})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {showPasteBox && (
              <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                <textarea
                  rows={5}
                  value={rawPaste}
                  onChange={(e) => setRawPaste(e.target.value)}
                  placeholder={
                    isId
                      ? 'Tempel data CSV (koma/titik koma) atau JSON array di sini...'
                      : 'Paste CSV (comma/semicolon) or JSON array here...'
                  }
                  className="font-data w-full rounded-xl border border-[var(--border-control)] bg-[var(--bg-paper)] p-3 text-xs text-[var(--ink-primary)] focus:border-[var(--accent)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleParsePasted}
                  className="btn-primary rounded-lg px-4 py-2 text-xs font-bold"
                >
                  {isId ? 'Muat ke Tabel' : 'Load into Table'}
                </button>
              </div>
            )}
          </div>

          {/* Export Action Bar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-data rounded-md bg-[var(--bg-recess)] px-2 py-1 font-bold text-[var(--ink-primary)]">
                {sourceName}
              </span>
              <span className="font-data text-[var(--ink-muted)]">
                {activeSheet.rows.length} {isId ? 'baris' : 'rows'} · {activeSheet.headers.length}{' '}
                {isId ? 'kolom' : 'cols'}
              </span>
              <label className="ml-1 inline-flex items-center gap-1.5 text-[var(--ink-muted)]">
                <span>CSV:</span>
                <select
                  value={csvOutputDelimiter}
                  onChange={(e) => setCsvOutputDelimiter(e.target.value as CsvDelimiter)}
                  className="rounded-md border border-[var(--border-control)] bg-[var(--bg-paper)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink-primary)]"
                >
                  <option value=",">{isId ? 'Koma (,)' : 'Comma (,)'}</option>
                  <option value=";">{isId ? 'Titik koma (;)' : 'Semicolon (;)'}</option>
                  <option value={'\t'}>Tab (TSV)</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={activeSheet.headers.length === 0 || exportingXlsx}
                onClick={handleExportXlsx}
                className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold disabled:opacity-50"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                <span>{exportingXlsx ? '...' : isId ? 'Unduh .XLSX' : 'Export .XLSX'}</span>
              </button>
              <button
                type="button"
                disabled={activeSheet.headers.length === 0}
                onClick={handleExportCsv}
                className="btn-secondary inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold disabled:opacity-50"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                <span>{isId ? 'Unduh .CSV' : 'Export .CSV'}</span>
              </button>
              <button
                type="button"
                disabled={activeSheet.headers.length === 0}
                onClick={handleExportTableJson}
                className="btn-secondary inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold disabled:opacity-50"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                <span>{isId ? 'Unduh .JSON' : 'Export .JSON'}</span>
              </button>
              <button
                type="button"
                disabled={activeSheet.headers.length === 0}
                onClick={() => copyText(tableToJson(activeSheet, 2), 'table-json')}
                className="btn-secondary inline-flex min-h-9 items-center rounded-xl px-3 text-xs font-semibold disabled:opacity-50"
              >
                {copiedKey === 'table-json'
                  ? isId
                    ? 'JSON Tersalin ✓'
                    : 'JSON Copied ✓'
                  : isId
                    ? 'Salin JSON'
                    : 'Copy JSON'}
              </button>
            </div>
          </div>

          {/* Live Table Preview */}
          <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--bg-recess)] text-[var(--ink-primary)]">
                  <tr>
                    <th className="font-data border-b border-r border-[var(--border-subtle)] px-2.5 py-2 text-[10px] font-bold text-[var(--ink-muted)]">
                      #
                    </th>
                    {activeSheet.headers.map((header, idx) => (
                      <th
                        key={`h-${idx}`}
                        className="border-b border-r border-[var(--border-subtle)] px-3 py-2 font-bold whitespace-nowrap"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rIdx) => (
                    <tr
                      key={`r-${rIdx}`}
                      className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-recess)]/60"
                    >
                      <td className="font-data border-r border-[var(--border-subtle)] px-2.5 py-2 text-[10px] text-[var(--ink-muted)]">
                        {rIdx + 1}
                      </td>
                      {activeSheet.headers.map((_, cIdx) => (
                        <td
                          key={`c-${rIdx}-${cIdx}`}
                          className="border-r border-[var(--border-subtle)] px-3 py-2 text-[var(--ink-primary)] last:border-r-0"
                        >
                          {row[cIdx] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {activeSheet.rows.length > 100 && (
              <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-recess)] px-4 py-2 text-[11px] text-[var(--ink-muted)]">
                {isId
                  ? `Menampilkan 100 baris pertama dari ${activeSheet.rows.length} baris. Semua baris tetap ikut diekspor.`
                  : `Showing first 100 of ${activeSheet.rows.length} rows. All rows are included on export.`}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* JSON Formatter & Validator Tab */
        <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {jsonResult.valid ? (
                <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  ● {isId ? 'JSON Valid' : 'Valid JSON'} ({jsonResult.rootType} · {jsonResult.itemCount})
                </span>
              ) : (
                <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-700 dark:text-rose-300">
                  ✕ {isId ? 'JSON Tidak Valid' : 'Invalid JSON'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={isId ? 'Indentasi JSON' : 'JSON indentation'}
                value={String(jsonIndent)}
                onChange={(e) => {
                  const v = e.target.value;
                  setJsonIndent(v === '\t' ? '\t' : (Number(v) as 2 | 4));
                }}
                className="rounded-lg border border-[var(--border-control)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-primary)]"
              >
                <option value="2">2 {isId ? 'spasi' : 'spaces'}</option>
                <option value="4">4 {isId ? 'spasi' : 'spaces'}</option>
                <option value={'\t'}>Tab</option>
              </select>

              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-primary)]">
                <input
                  type="checkbox"
                  checked={jsonSortKeys}
                  onChange={(e) => setJsonSortKeys(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                <span>{isId ? 'Urutkan key' : 'Sort keys'}</span>
              </label>
            </div>
          </div>

          {!jsonResult.valid && jsonResult.error && (
            <div className="font-data rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-700 dark:text-rose-300">
              {jsonResult.error}
            </div>
          )}

          <textarea
            rows={14}
            spellCheck={false}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            aria-label="JSON Editor"
            className="font-data w-full rounded-xl border border-[var(--border-control)] bg-[var(--bg-paper)] p-3.5 text-xs leading-relaxed text-[var(--ink-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-glow)]"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!jsonResult.valid}
              onClick={handlePrettyJson}
              className="btn-primary rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50"
            >
              {isId ? 'Rapikan (Pretty)' : 'Format (Pretty)'}
            </button>
            <button
              type="button"
              disabled={!jsonResult.valid}
              onClick={handleMinifyJson}
              className="btn-secondary rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-50"
            >
              Minify
            </button>
            <button
              type="button"
              disabled={!jsonResult.valid}
              onClick={handleOpenJsonAsTable}
              className="btn-secondary rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-50"
            >
              {isId ? 'Buka sebagai Tabel / Excel' : 'Open as Table / Excel'}
            </button>
            <button
              type="button"
              disabled={!jsonResult.valid}
              onClick={() => copyText(jsonResult.formatted ?? jsonInput, 'fmt-json')}
              className="btn-secondary rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-50"
            >
              {copiedKey === 'fmt-json'
                ? isId
                  ? 'Tersalin ✓'
                  : 'Copied ✓'
                : isId
                  ? 'Salin'
                  : 'Copy'}
            </button>
            <button
              type="button"
              disabled={!jsonResult.valid}
              onClick={() => {
                const blob = new Blob([jsonResult.formatted ?? jsonInput], {
                  type: 'application/json;charset=utf-8',
                });
                downloadBlob(blob, `${sourceName || 'formatted'}.json`);
                setHasExported(true);
              }}
              className="btn-secondary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-50"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              <span>{isId ? 'Unduh .JSON' : 'Download .JSON'}</span>
            </button>
          </div>
        </div>
      )}

      {hasExported && (
        <SupportCard
          locale={locale}
          heading={dict.shared.supportHeading}
          body={dict.shared.supportBody}
          aboutCta={dict.shared.supportAboutCta}
          dismissLabel={dict.shared.supportDismiss}
        />
      )}
    </div>
  );
}
