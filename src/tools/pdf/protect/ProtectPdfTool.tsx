import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes, sanitizeFilename } from '@/lib/format';
import { validatePdfFiles } from '@/lib/file-validation';
import { runWorkerTask } from '@/lib/worker-client';
import { downloadBlob } from '@/lib/download';
import { useFileHandoff } from '@/lib/use-file-handoff';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import HandoffChainBar from '@/components/shared/HandoffChainBar';
import HandoffNotice from '@/components/shared/HandoffNotice';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import {
  validateProtectOptions,
  validateUnlockOptions,
  type ProtectPdfMode,
} from './plan';
import type {
  ProtectInspectResponse,
  ProtectWorkerRequest,
  ProtectWorkerResponse,
} from './protect.worker';

interface ProtectPdfToolProps {
  locale: Locale;
}

interface ProtectOutputState {
  filename: string;
  pageCount: number;
  modeUsed: ProtectPdfMode;
  blob: Blob;
}

function createProtectWorker(): Worker {
  return new Worker(new URL('./protect.worker.ts', import.meta.url), { type: 'module' });
}

export default function ProtectPdfTool({ locale }: ProtectPdfToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.protectPdf;

  const userPassId = useId();
  const confirmPassId = useId();
  const ownerPassId = useId();
  const unlockPassId = useId();
  const showPassId = useId();
  const allowPrintId = useId();
  const allowCopyId = useId();
  const allowModifyId = useId();
  const outputNameId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [inspectInfo, setInspectInfo] = useState<ProtectInspectResponse | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const [mode, setMode] = useState<ProtectPdfMode>('protect');
  const [userPassword, setUserPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(false);
  const [allowModifying, setAllowModifying] = useState(false);
  const [outputName, setOutputName] = useState('');

  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [output, setOutput] = useState<ProtectOutputState | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const updateDefaultOutputName = (rawFileName: string, targetMode: ProtectPdfMode) => {
    const stem = rawFileName.replace(/\.pdf$/i, '') || 'izikit-document';
    setOutputName(`${stem}-${targetMode === 'protect' ? 'protected' : 'unlocked'}.pdf`);
  };

  const handleFileSelected = async (incoming: File[]) => {
    const selected = incoming[0];
    if (!selected) return;

    setErrors([]);
    setOutput(null);

    try {
      const { accepted, errors: validationErrors } = await validatePdfFiles([selected], {
        tooLarge: copy.errors.tooLarge,
        notPdf: copy.errors.notPdf,
        generic: copy.errors.corrupt,
      });
      if (validationErrors.length > 0 || accepted.length === 0) {
        setErrors(
          validationErrors.length > 0
            ? validationErrors
            : [`${copy.errors.corrupt} ${selected.name}`],
        );
        return;
      }

      setFile(selected);
      setInspectInfo(null);
      setInspecting(true);

      const buffer = await selected.arrayBuffer();
      const info = await runWorkerTask<ProtectWorkerRequest, ProtectInspectResponse>(
        createProtectWorker,
        { action: 'inspect', buffer },
        { transfer: [buffer] },
      );

      setInspectInfo(info);
      const suggestedMode: ProtectPdfMode = info.isEncrypted ? 'unlock' : 'protect';
      setMode(suggestedMode);
      updateDefaultOutputName(selected.name, suggestedMode);
    } catch {
      setFile(null);
      setErrors([`${copy.errors.corrupt} ${selected.name}`]);
    } finally {
      setInspecting(false);
    }
  };

  const { handoffSource, handoffMeta, dismissHandoffNotice } = useFileHandoff((incomingFiles) =>
    handleFileSelected(incomingFiles),
  );

  const resetAll = () => {
    abortRef.current?.abort();
    setFile(null);
    setInspectInfo(null);
    setInspecting(false);
    setUserPassword('');
    setConfirmPassword('');
    setOwnerPassword('');
    setUnlockPassword('');
    setErrors([]);
    setOutput(null);
    setIsProcessing(false);
    setProgress({ percent: 0, detail: '' });
  };

  const validationIssue = useMemo<string | null>(() => {
    if (!inspectInfo) return null;

    if (mode === 'protect') {
      if (inspectInfo.isEncrypted) return copy.errors.alreadyEncrypted;
      if (!userPassword) return copy.errors.emptyPassword;
      if (userPassword !== confirmPassword) return copy.errors.passwordMismatch;
      try {
        validateProtectOptions({
          userPassword,
          confirmPassword,
          ownerPassword,
          allowPrinting,
          allowCopying,
          allowModifying,
        });
      } catch {
        return copy.errors.generic;
      }
      return null;
    }

    if (!inspectInfo.isEncrypted) return copy.errors.notEncrypted;
    try {
      validateUnlockOptions({ password: unlockPassword });
    } catch {
      return copy.errors.generic;
    }
    return null;
  }, [
    allowCopying,
    allowModifying,
    allowPrinting,
    confirmPassword,
    copy.errors,
    inspectInfo,
    mode,
    ownerPassword,
    unlockPassword,
    userPassword,
  ]);

  const mapErrorCode = (code?: string): string => {
    switch (code) {
      case 'ALREADY_ENCRYPTED':
        return copy.errors.alreadyEncrypted;
      case 'NOT_ENCRYPTED':
        return copy.errors.notEncrypted;
      case 'WRONG_PASSWORD':
        return copy.errors.wrongPassword;
      case 'EMPTY_PASSWORD':
        return copy.errors.emptyPassword;
      case 'PASSWORD_MISMATCH':
        return copy.errors.passwordMismatch;
      case 'CORRUPT':
        return copy.errors.corrupt;
      default:
        return copy.errors.generic;
    }
  };

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !inspectInfo) return;
    if (validationIssue) {
      setErrors([validationIssue]);
      return;
    }

    setErrors([]);
    setOutput(null);
    setIsProcessing(true);
    setProgress({
      percent: 10,
      detail: mode === 'protect' ? copy.progressProtecting : copy.progressUnlocking,
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const buffer = await file.arrayBuffer();
      const request: ProtectWorkerRequest =
        mode === 'protect'
          ? {
              action: 'protect',
              buffer,
              options: {
                userPassword,
                confirmPassword,
                ownerPassword,
                allowPrinting,
                allowCopying,
                allowModifying,
              },
            }
          : {
              action: 'unlock',
              buffer,
              options: {
                password: unlockPassword,
              },
            };

      const response = await runWorkerTask<ProtectWorkerRequest, ProtectWorkerResponse>(
        createProtectWorker,
        request,
        {
          transfer: [buffer],
          signal: controller.signal,
          onProgress: (evt) => {
            setProgress({
              percent: evt.percent,
              detail: mode === 'protect' ? copy.progressProtecting : copy.progressUnlocking,
            });
          },
        },
      );

      const fallbackName =
        mode === 'protect' ? 'izikit-protected.pdf' : 'izikit-unlocked.pdf';
      const safeFilename = sanitizeFilename(outputName || fallbackName, fallbackName);
      const finalName = safeFilename.toLowerCase().endsWith('.pdf')
        ? safeFilename
        : `${safeFilename}.pdf`;

      setOutput({
        filename: finalName,
        pageCount: response.pageCount,
        modeUsed: mode,
        blob: new Blob([response.buffer], { type: 'application/pdf' }),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const code = (err as Error & { code?: string }).code;
      setErrors([mapErrorCode(code)]);
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="space-y-5">
      <HandoffNotice
        sourceRoute={handoffSource}
        locale={locale}
        onDismiss={dismissHandoffNotice}
      />
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {!file ? (
        <Dropzone
          accept=".pdf,application/pdf"
          multiple={false}
          disabled={isProcessing}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleFileSelected}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Selected PDF Header + Encryption Status */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="m-0 truncate text-sm font-semibold text-[var(--ink-primary)]">
                  {file.name}
                </p>
                {inspectInfo && (
                  <span
                    className={`font-data inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                      inspectInfo.isEncrypted
                        ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                        : 'border-[var(--border-control)] bg-[var(--bg-card)] text-[var(--ink-muted)]'
                    }`}
                  >
                    {inspectInfo.isEncrypted
                      ? copy.statusLockedBadge
                      : copy.statusUnlockedBadge}
                  </span>
                )}
              </div>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {formatBytes(file.size)}
                {inspecting
                  ? ` · ${copy.inspectingFile}`
                  : inspectInfo?.pageCount
                    ? ` · ${inspectInfo.pageCount} ${dict.shared.pagesUnit}`
                    : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={resetAll}
              disabled={isProcessing}
              className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-xs font-medium"
            >
              {copy.changeFileButton}
            </button>
          </div>

          <fieldset
            disabled={isProcessing || inspecting}
            className="m-0 space-y-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
          >
            <legend className="px-1 text-sm font-semibold text-[var(--ink-primary)]">
              {copy.modeHeading}
            </legend>

            {/* Mode Cards */}
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  {
                    value: 'protect' as const,
                    title: copy.modeProtectTitle,
                    description: copy.modeProtectDesc,
                  },
                  {
                    value: 'unlock' as const,
                    title: copy.modeUnlockTitle,
                    description: copy.modeUnlockDesc,
                  },
                ]
              ).map((opt) => {
                const selected = mode === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex flex-col gap-1 rounded-lg border p-3.5 transition-colors ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent-tint)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-control)]'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-primary)]">
                      <input
                        type="radio"
                        name="protect-pdf-mode"
                        value={opt.value}
                        checked={selected}
                        onChange={() => {
                          setMode(opt.value);
                          setOutput(null);
                          setErrors([]);
                          updateDefaultOutputName(file.name, opt.value);
                        }}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>{opt.title}</span>
                    </span>
                    <span className="pl-6 text-xs leading-relaxed text-[var(--ink-muted)]">
                      {opt.description}
                    </span>
                  </label>
                );
              })}
            </div>

            {mode === 'protect' ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={userPassId}
                      className="block text-sm font-medium text-[var(--ink-primary)]"
                    >
                      {copy.passwordLabel}
                    </label>
                    <input
                      id={userPassId}
                      type={showPasswords ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={userPassword}
                      onChange={(e) => {
                        setUserPassword(e.target.value);
                        setOutput(null);
                      }}
                      placeholder={copy.passwordPlaceholder}
                      className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor={confirmPassId}
                      className="block text-sm font-medium text-[var(--ink-primary)]"
                    >
                      {copy.confirmPasswordLabel}
                    </label>
                    <input
                      id={confirmPassId}
                      type={showPasswords ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setOutput(null);
                      }}
                      placeholder={copy.confirmPasswordPlaceholder}
                      className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={ownerPassId}
                    className="block text-sm font-medium text-[var(--ink-primary)]"
                  >
                    {copy.ownerPasswordLabel}
                  </label>
                  <input
                    id={ownerPassId}
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={ownerPassword}
                    onChange={(e) => {
                      setOwnerPassword(e.target.value);
                      setOutput(null);
                    }}
                    placeholder={copy.ownerPasswordPlaceholder}
                    className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                  <span className="block text-xs font-semibold text-[var(--ink-primary)]">
                    {copy.permissionsHeading}
                  </span>
                  <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-4">
                    <label
                      htmlFor={allowPrintId}
                      className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--ink-primary)]"
                    >
                      <input
                        id={allowPrintId}
                        type="checkbox"
                        checked={allowPrinting}
                        onChange={(e) => setAllowPrinting(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>{copy.allowPrintingLabel}</span>
                    </label>
                    <label
                      htmlFor={allowCopyId}
                      className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--ink-primary)]"
                    >
                      <input
                        id={allowCopyId}
                        type="checkbox"
                        checked={allowCopying}
                        onChange={(e) => setAllowCopying(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>{copy.allowCopyingLabel}</span>
                    </label>
                    <label
                      htmlFor={allowModifyId}
                      className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--ink-primary)]"
                    >
                      <input
                        id={allowModifyId}
                        type="checkbox"
                        checked={allowModifying}
                        onChange={(e) => setAllowModifying(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>{copy.allowModifyingLabel}</span>
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label
                  htmlFor={unlockPassId}
                  className="block text-sm font-medium text-[var(--ink-primary)]"
                >
                  {copy.unlockPasswordLabel}
                </label>
                <input
                  id={unlockPassId}
                  type={showPasswords ? 'text' : 'password'}
                  autoComplete="off"
                  value={unlockPassword}
                  onChange={(e) => {
                    setUnlockPassword(e.target.value);
                    setOutput(null);
                  }}
                  placeholder={copy.unlockPasswordPlaceholder}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                />
              </div>
            )}

            <div className="space-y-4">
              <label
                htmlFor={showPassId}
                className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--ink-primary)]"
              >
                <input
                  id={showPassId}
                  type="checkbox"
                  checked={showPasswords}
                  onChange={(e) => setShowPasswords(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>{copy.showPasswordsLabel}</span>
              </label>

              <div className="space-y-1.5 border-t border-[var(--border-subtle)] pt-4">
                <label
                  htmlFor={outputNameId}
                  className="block text-sm font-medium text-[var(--ink-primary)]"
                >
                  {copy.outputNameLabel}
                </label>
                <input
                  id={outputNameId}
                  type="text"
                  value={outputName}
                  onChange={(e) => setOutputName(e.target.value)}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                />
              </div>
            </div>

            {validationIssue && (
              <p className="m-0 text-xs font-medium text-[var(--danger)]">{validationIssue}</p>
            )}

            <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
              <button
                type="submit"
                disabled={isProcessing || inspecting || !inspectInfo || Boolean(validationIssue)}
                className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-lg px-6 text-sm font-semibold sm:w-auto"
              >
                {mode === 'protect' ? copy.protectButton : copy.unlockButton}
              </button>
            </div>
          </fieldset>
        </form>
      )}

      {isProcessing && (
        <ProgressBanner
          title={dict.shared.processingTitle}
          detail={progress.detail}
          percent={progress.percent}
          cancelLabel={dict.shared.cancelAction}
          onCancel={() => abortRef.current?.abort()}
        />
      )}

      {output && !isProcessing && (
        <div className="space-y-4 rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                {output.modeUsed === 'protect'
                  ? copy.resultProtectedTitle
                  : copy.resultUnlockedTitle}
              </h3>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {output.filename} · {output.pageCount} {dict.shared.pagesUnit} ·{' '}
                {formatBytes(output.blob.size)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => downloadBlob(output.blob, output.filename)}
              className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
            >
              <DownloadIcon className="h-4 w-4" />
              <span>{copy.downloadButton}</span>
            </button>
          </div>

          <HandoffChainBar
            locale={locale}
            sourceRoute="/protect-pdf"
            originSource={handoffSource}
            originMeta={handoffMeta}
            getFiles={() => [
              new File([output.blob], output.filename, { type: 'application/pdf' }),
            ]}
            actions={
              output.modeUsed === 'unlock'
                ? [
                    {
                      label: locale === 'id' ? 'Kompres PDF < 1 MB' : 'Compress PDF < 1 MB',
                      href: '/compress-pdf?preset=1mb',
                    },
                  ]
                : []
            }
          />

          <SupportCard
            locale={locale}
            heading={dict.shared.supportHeading}
            body={dict.shared.supportBody}
            aboutCta={dict.shared.supportAboutCta}
            dismissLabel={dict.shared.supportDismiss}
          />
        </div>
      )}
    </div>
  );
}
