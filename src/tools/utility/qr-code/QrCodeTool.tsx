import { useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { downloadBlob } from '@/lib/download';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import {
  buildVCardPayload,
  buildWhatsAppPayload,
  buildWifiPayload,
  encodeQrMatrix,
  getContrastRatio,
  renderQrPngBlob,
  renderQrSvg,
  type QrEccLevel,
  type QrModuleStyle,
  type QrPresetMode,
  type VCardPayloadInput,
  type WhatsAppPayloadInput,
  type WifiPayloadInput,
} from './qr-code.logic';

interface QrCodeToolProps {
  locale: Locale;
}

const COLOR_PRESETS = [
  { id: 'classic', label: 'Hitam / Putih', labelEn: 'Black / White', fg: '#0B1020', bg: '#FFFFFF' },
  { id: 'indigo', label: 'Indigo', labelEn: 'Indigo', fg: '#3730A3', bg: '#FFFFFF' },
  { id: 'emerald', label: 'Hijau WA', labelEn: 'Emerald', fg: '#065F46', bg: '#FFFFFF' },
  { id: 'inverted', label: 'Mode Gelap', labelEn: 'Dark Mode', fg: '#F8FAFC', bg: '#0B1020' },
] as const;

const PNG_SIZES = [512, 1024, 2048] as const;

export default function QrCodeTool({ locale }: QrCodeToolProps) {
  const dict = getDictionary(locale);
  const isId = locale === 'id';
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<QrPresetMode>('url');
  const [urlValue, setUrlValue] = useState('https://izikit.web.id');
  const [textValue, setTextValue] = useState('');
  const [waInput, setWaInput] = useState<WhatsAppPayloadInput>({
    phone: '081234567890',
    message: isId ? 'Halo, saya tertarik dengan produknya.' : 'Hi, I am interested in your product.',
  });
  const [wifiInput, setWifiInput] = useState<WifiPayloadInput>({
    ssid: 'WiFi-Kantor',
    password: '',
    encryption: 'WPA',
    hidden: false,
  });
  const [vcardInput, setVcardInput] = useState<VCardPayloadInput>({
    firstName: 'Budi',
    lastName: 'Santoso',
    organization: 'izikit Studio',
    phone: '+6281234567890',
    email: 'budi@contoh.id',
    website: 'https://izikit.web.id',
  });

  const [ecc, setEcc] = useState<QrEccLevel>('M');
  const [fgColor, setFgColor] = useState('#0B1020');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [margin, setMargin] = useState(4);
  const [moduleStyle, setModuleStyle] = useState<QrModuleStyle>('square');
  const [pngSize, setPngSize] = useState<(typeof PNG_SIZES)[number]>(1024);

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoScale, setLogoScale] = useState(0.2);

  const [copiedSvg, setCopiedSvg] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasExported, setHasExported] = useState(false);

  const payload = useMemo(() => {
    switch (mode) {
      case 'url':
        return urlValue.trim();
      case 'whatsapp':
        return buildWhatsAppPayload(waInput);
      case 'wifi':
        return buildWifiPayload(wifiInput);
      case 'vcard':
        return buildVCardPayload(vcardInput);
      case 'text':
        return textValue.trim();
    }
  }, [mode, urlValue, waInput, wifiInput, vcardInput, textValue]);

  // Automatically recommend ECC H when a center logo is attached so QR stays scannable
  const effectiveEcc: QrEccLevel = logoDataUrl && (ecc === 'L' || ecc === 'M') ? 'H' : ecc;

  const qrResult = useMemo(() => {
    if (!payload) return { matrix: null, svg: '', error: null as string | null };
    try {
      const matrix = encodeQrMatrix(payload, effectiveEcc);
      const svg = renderQrSvg(matrix, {
        fgColor,
        bgColor,
        margin,
        moduleStyle,
        logoDataUrl,
        logoScale,
      });
      return { matrix, svg, error: null as string | null };
    } catch (err) {
      return {
        matrix: null,
        svg: '',
        error: err instanceof Error ? err.message : 'Gagal membuat QR Code.',
      };
    }
  }, [payload, effectiveEcc, fgColor, bgColor, margin, moduleStyle, logoDataUrl, logoScale]);

  const contrastRatio = useMemo(() => getContrastRatio(fgColor, bgColor), [fgColor, bgColor]);
  const lowContrast = contrastRatio < 3.5;

  const handleLogoUpload = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg(
        isId ? 'Pilih file gambar (PNG, JPG, SVG, atau WEBP) untuk logo.' : 'Please choose an image file for the logo.',
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoDataUrl(reader.result);
        setEcc('H');
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadSvg = () => {
    if (!qrResult.svg) return;
    const blob = new Blob([qrResult.svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `izikit-qr-${mode}.svg`);
    setHasExported(true);
  };

  const handleDownloadPng = async () => {
    if (!qrResult.matrix) return;
    setExportingPng(true);
    setErrorMsg(null);
    try {
      const blob = await renderQrPngBlob(
        qrResult.matrix,
        {
          fgColor,
          bgColor,
          margin,
          moduleStyle,
          logoDataUrl,
          logoScale,
        },
        pngSize,
      );
      downloadBlob(blob, `izikit-qr-${mode}-${pngSize}px.png`);
      setHasExported(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat file PNG.');
    } finally {
      setExportingPng(false);
    }
  };

  const handleCopySvg = async () => {
    if (!qrResult.svg) return;
    try {
      await navigator.clipboard.writeText(qrResult.svg);
      setCopiedSvg(true);
      setTimeout(() => setCopiedSvg(false), 1800);
    } catch {
      setErrorMsg(isId ? 'Browser tidak mengizinkan salin otomatis.' : 'Clipboard copy was blocked by the browser.');
    }
  };

  const modeTabs: { id: QrPresetMode; label: string }[] = [
    { id: 'url', label: 'URL / Link' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'wifi', label: 'WiFi' },
    { id: 'vcard', label: isId ? 'Kontak (vCard)' : 'Contact (vCard)' },
    { id: 'text', label: isId ? 'Teks Bebas' : 'Plain Text' },
  ];

  const inputClass =
    'w-full rounded-xl border border-[var(--border-control)] bg-[var(--bg-paper)] px-3.5 py-2.5 text-sm text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-glow)]';

  return (
    <div className="space-y-6">
      {(errorMsg || qrResult.error) && (
        <ErrorAlert
          messages={[errorMsg ?? qrResult.error ?? '']}
          dismissLabel={dict.shared.dismissError}
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      {/* Mode Tabs */}
      <div
        role="tablist"
        aria-label={isId ? 'Jenis QR Code' : 'QR Code type'}
        className="flex flex-wrap gap-2"
      >
        {modeTabs.map((tab) => {
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(tab.id)}
              className={`min-h-10 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:border-[var(--border-control)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main 2-column workspace */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        {/* Left: Payload & Style Controls */}
        <div className="space-y-5">
          {/* Payload Form Card */}
          <section className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
            <h2 className="font-display m-0 text-sm font-extrabold text-[var(--ink-primary)]">
              {isId ? '1. Isi Konten QR Code' : '1. QR Code Content'}
            </h2>

            {mode === 'url' && (
              <div className="space-y-1.5">
                <label htmlFor="qr-url" className="block text-xs font-semibold text-[var(--ink-muted)]">
                  {isId ? 'Alamat Website / Link' : 'Website URL / Link'}
                </label>
                <input
                  id="qr-url"
                  type="url"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://contoh.id"
                  className={inputClass}
                />
              </div>
            )}

            {mode === 'whatsapp' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="qr-wa-phone" className="block text-xs font-semibold text-[var(--ink-muted)]">
                    {isId ? 'Nomor WhatsApp (otomatis ubah 08 → 628)' : 'WhatsApp Number (with country code)'}
                  </label>
                  <input
                    id="qr-wa-phone"
                    type="tel"
                    value={waInput.phone}
                    onChange={(e) => setWaInput((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="081234567890"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="qr-wa-msg" className="block text-xs font-semibold text-[var(--ink-muted)]">
                    {isId ? 'Pesan Pembuka (Opsional)' : 'Prefilled Message (Optional)'}
                  </label>
                  <textarea
                    id="qr-wa-msg"
                    rows={3}
                    value={waInput.message}
                    onChange={(e) => setWaInput((prev) => ({ ...prev, message: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {mode === 'wifi' && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="qr-wifi-ssid" className="block text-xs font-semibold text-[var(--ink-muted)]">
                      {isId ? 'Nama WiFi (SSID)' : 'Network Name (SSID)'}
                    </label>
                    <input
                      id="qr-wifi-ssid"
                      type="text"
                      value={wifiInput.ssid}
                      onChange={(e) => setWifiInput((prev) => ({ ...prev, ssid: e.target.value }))}
                      placeholder="WiFi-Rumah"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="qr-wifi-enc" className="block text-xs font-semibold text-[var(--ink-muted)]">
                      {isId ? 'Keamanan' : 'Encryption'}
                    </label>
                    <select
                      id="qr-wifi-enc"
                      value={wifiInput.encryption}
                      onChange={(e) =>
                        setWifiInput((prev) => ({
                          ...prev,
                          encryption: e.target.value as WifiPayloadInput['encryption'],
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="WPA">WPA / WPA2 / WPA3</option>
                      <option value="WEP">WEP</option>
                      <option value="nopass">{isId ? 'Tanpa Sandi (Terbuka)' : 'No Password (Open)'}</option>
                    </select>
                  </div>
                </div>
                {wifiInput.encryption !== 'nopass' && (
                  <div className="space-y-1.5">
                    <label htmlFor="qr-wifi-pass" className="block text-xs font-semibold text-[var(--ink-muted)]">
                      {isId ? 'Kata Sandi WiFi' : 'WiFi Password'}
                    </label>
                    <input
                      id="qr-wifi-pass"
                      type="text"
                      value={wifiInput.password}
                      onChange={(e) => setWifiInput((prev) => ({ ...prev, password: e.target.value }))}
                      placeholder={isId ? 'Masukkan password WiFi' : 'Enter WiFi password'}
                      className={inputClass}
                    />
                  </div>
                )}
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--ink-primary)]">
                  <input
                    type="checkbox"
                    checked={wifiInput.hidden}
                    onChange={(e) => setWifiInput((prev) => ({ ...prev, hidden: e.target.checked }))}
                    className="h-4 w-4 rounded accent-[var(--accent)]"
                  />
                  <span>{isId ? 'Jaringan tersembunyi (Hidden SSID)' : 'Hidden network (SSID)'}</span>
                </label>
              </div>
            )}

            {mode === 'vcard' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="qr-vc-fn" className="block text-xs font-semibold text-[var(--ink-muted)]">
                    {isId ? 'Nama Depan' : 'First Name'}
                  </label>
                  <input
                    id="qr-vc-fn"
                    type="text"
                    value={vcardInput.firstName}
                    onChange={(e) => setVcardInput((prev) => ({ ...prev, firstName: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="qr-vc-ln" className="block text-xs font-semibold text-[var(--ink-muted)]">
                    {isId ? 'Nama Belakang' : 'Last Name'}
                  </label>
                  <input
                    id="qr-vc-ln"
                    type="text"
                    value={vcardInput.lastName}
                    onChange={(e) => setVcardInput((prev) => ({ ...prev, lastName: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="qr-vc-org" className="block text-xs font-semibold text-[var(--ink-muted)]">
                    {isId ? 'Perusahaan / Instansi' : 'Organization'}
                  </label>
                  <input
                    id="qr-vc-org"
                    type="text"
                    value={vcardInput.organization}
                    onChange={(e) => setVcardInput((prev) => ({ ...prev, organization: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="qr-vc-tel" className="block text-xs font-semibold text-[var(--ink-muted)]">
                    {isId ? 'Nomor Telepon' : 'Phone'}
                  </label>
                  <input
                    id="qr-vc-tel"
                    type="tel"
                    value={vcardInput.phone}
                    onChange={(e) => setVcardInput((prev) => ({ ...prev, phone: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="qr-vc-email" className="block text-xs font-semibold text-[var(--ink-muted)]">
                    Email
                  </label>
                  <input
                    id="qr-vc-email"
                    type="email"
                    value={vcardInput.email}
                    onChange={(e) => setVcardInput((prev) => ({ ...prev, email: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="qr-vc-web" className="block text-xs font-semibold text-[var(--ink-muted)]">
                    Website
                  </label>
                  <input
                    id="qr-vc-web"
                    type="url"
                    value={vcardInput.website}
                    onChange={(e) => setVcardInput((prev) => ({ ...prev, website: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {mode === 'text' && (
              <div className="space-y-1.5">
                <label htmlFor="qr-plain-text" className="block text-xs font-semibold text-[var(--ink-muted)]">
                  {isId ? 'Teks / Catatan' : 'Plain Text'}
                </label>
                <textarea
                  id="qr-plain-text"
                  rows={4}
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  placeholder={isId ? 'Tulis teks apa saja untuk diubah menjadi QR Code...' : 'Type any text to encode...'}
                  className={inputClass}
                />
              </div>
            )}
          </section>

          {/* Style & Logo Customization Card */}
          <section className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
            <h2 className="font-display m-0 text-sm font-extrabold text-[var(--ink-primary)]">
              {isId ? '2. Warna, Gaya & Logo Tengah' : '2. Color, Style & Center Logo'}
            </h2>

            {/* Quick Color Presets */}
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setFgColor(preset.fg);
                    setBgColor(preset.bg);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)]"
                >
                  <span
                    className="h-3.5 w-3.5 rounded-sm border border-[var(--border-control)]"
                    style={{ backgroundColor: preset.fg }}
                  />
                  <span>{isId ? preset.label : preset.labelEn}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-3 py-2">
                <label htmlFor="qr-fg-color" className="text-xs font-semibold text-[var(--ink-primary)]">
                  {isId ? 'Warna QR' : 'Foreground'}
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-data text-[11px] text-[var(--ink-muted)]">{fgColor}</span>
                  <input
                    id="qr-fg-color"
                    type="color"
                    value={fgColor}
                    onChange={(e) => setFgColor(e.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-3 py-2">
                <label htmlFor="qr-bg-color" className="text-xs font-semibold text-[var(--ink-primary)]">
                  {isId ? 'Warna Latar' : 'Background'}
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-data text-[11px] text-[var(--ink-muted)]">{bgColor}</span>
                  <input
                    id="qr-bg-color"
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </div>
              </div>
            </div>

            {lowContrast && (
              <p className="m-0 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {isId
                  ? `Kontras warna terlalu rendah (${contrastRatio.toFixed(1)}:1). Gunakan kombinasi warna lebih kontras agar QR mudah dipindai kamera.`
                  : `Color contrast is low (${contrastRatio.toFixed(1)}:1). Increase contrast so scanners can read the QR reliably.`}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Module Style */}
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-[var(--ink-muted)]">
                  {isId ? 'Bentuk Modul' : 'Module Style'}
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['square', 'rounded'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setModuleStyle(st)}
                      className={`rounded-lg border py-1.5 text-xs font-semibold ${
                        moduleStyle === st
                          ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-recess)] text-[var(--ink-muted)]'
                      }`}
                    >
                      {st === 'square' ? (isId ? 'Kotak' : 'Square') : isId ? 'Membulat' : 'Rounded'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Correction */}
              <div className="space-y-1.5">
                <label htmlFor="qr-ecc" className="block text-xs font-semibold text-[var(--ink-muted)]">
                  {isId ? 'Koreksi Error (ECC)' : 'Error Correction'}
                </label>
                <select
                  id="qr-ecc"
                  value={effectiveEcc}
                  onChange={(e) => setEcc(e.target.value as QrEccLevel)}
                  className="w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-primary)]"
                >
                  <option value="L">L (7%)</option>
                  <option value="M">M (15%)</option>
                  <option value="Q">Q (25%)</option>
                  <option value="H">H (30% · Logo)</option>
                </select>
              </div>

              {/* Quiet Zone */}
              <div className="space-y-1.5">
                <label htmlFor="qr-margin" className="flex justify-between text-xs font-semibold text-[var(--ink-muted)]">
                  <span>{isId ? 'Margin Tepi' : 'Quiet Zone'}</span>
                  <span className="font-data">{margin}</span>
                </label>
                <input
                  id="qr-margin"
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            </div>

            {/* Optional Center Logo */}
            <div className="space-y-2.5 border-t border-[var(--border-subtle)] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--ink-primary)]">
                  {isId ? 'Logo Tengah (Opsional)' : 'Center Logo (Optional)'}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    {logoDataUrl
                      ? isId
                        ? 'Ganti Logo'
                        : 'Change Logo'
                      : isId
                        ? 'Pilih Logo'
                        : 'Upload Logo'}
                  </button>
                  {logoDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogoDataUrl(null);
                        if (logoInputRef.current) logoInputRef.current.value = '';
                      }}
                      className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-rose-500"
                    >
                      {isId ? 'Hapus' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>

              {logoDataUrl && (
                <div className="flex items-center gap-3">
                  <label htmlFor="qr-logo-scale" className="shrink-0 text-xs text-[var(--ink-muted)]">
                    {isId ? 'Ukuran logo' : 'Logo size'} ({Math.round(logoScale * 100)}%)
                  </label>
                  <input
                    id="qr-logo-scale"
                    type="range"
                    min={0.14}
                    max={0.26}
                    step={0.01}
                    value={logoScale}
                    onChange={(e) => setLogoScale(Number(e.target.value))}
                    className="w-full accent-[var(--accent)]"
                  />
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right: Sticky Live Preview & Export */}
        <aside className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 lg:sticky lg:top-20">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display m-0 text-sm font-extrabold text-[var(--ink-primary)]">
              {isId ? 'Pratinjau QR Code' : 'Live QR Preview'}
            </h2>
            {qrResult.matrix && (
              <span className="font-data rounded-md border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink-muted)]">
                V{qrResult.matrix.version} · {qrResult.matrix.size}×{qrResult.matrix.size} · ECC {effectiveEcc}
              </span>
            )}
          </div>

          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-4">
            {qrResult.svg ? (
              <div
                className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrResult.svg }}
              />
            ) : (
              <p className="m-0 text-center text-xs text-[var(--ink-muted)]">
                {isId
                  ? 'Isi konten di sebelah kiri untuk langsung melihat QR Code.'
                  : 'Enter content on the left to generate your QR code.'}
              </p>
            )}
          </div>

          {/* PNG resolution selector */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--ink-muted)]">
              {isId ? 'Resolusi PNG' : 'PNG Resolution'}
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {PNG_SIZES.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setPngSize(sz)}
                  className={`font-data rounded-lg border py-1.5 text-xs font-semibold ${
                    pngSize === sz
                      ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-recess)] text-[var(--ink-muted)]'
                  }`}
                >
                  {sz}px
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              disabled={!qrResult.matrix || exportingPng}
              onClick={handleDownloadPng}
              className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-50"
            >
              <DownloadIcon className="h-4 w-4" />
              <span>
                {exportingPng
                  ? isId
                    ? 'Menyiapkan PNG...'
                    : 'Generating PNG...'
                  : `${isId ? 'Unduh PNG' : 'Download PNG'} (${pngSize}px)`}
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!qrResult.svg}
                onClick={handleDownloadSvg}
                className="btn-secondary inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold disabled:opacity-50"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                <span>{isId ? 'Unduh SVG' : 'Download SVG'}</span>
              </button>
              <button
                type="button"
                disabled={!qrResult.svg}
                onClick={handleCopySvg}
                className="btn-secondary inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-xs font-bold disabled:opacity-50"
              >
                {copiedSvg
                  ? isId
                    ? 'Tersalin ✓'
                    : 'Copied ✓'
                  : isId
                    ? 'Salin SVG'
                    : 'Copy SVG'}
              </button>
            </div>
          </div>
        </aside>
      </div>

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
