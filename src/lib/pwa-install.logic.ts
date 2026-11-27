export type PwaInstallMode = 'native-prompt' | 'ios-guide' | 'hidden';

export interface PwaInstallDetectionInput {
  isStandalone: boolean;
  hasDeferredPrompt: boolean;
  userAgent: string;
  maxTouchPoints?: number;
}

/**
 * Detects Safari on iOS/iPadOS (excluding Chrome/Firefox/Edge on iOS, which do not
 * expose the Safari "Add to Home Screen" share flow in the same way).
 */
export function isIosSafariUserAgent(userAgent: string, maxTouchPoints = 0): boolean {
  const ua = userAgent || '';
  const isIphoneOrIpod = /iPhone|iPod/i.test(ua);
  const isIpad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  if (!isIphoneOrIpod && !isIpad) return false;

  const isWebKit = /WebKit/i.test(ua);
  const isThirdPartyIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isWebKit && !isThirdPartyIosBrowser;
}

/**
 * Resolves whether the Install App button should trigger the native browser prompt,
 * show the 2-step iOS Safari guide, or remain hidden (already installed or unsupported).
 */
export function resolvePwaInstallMode(input: PwaInstallDetectionInput): PwaInstallMode {
  if (input.isStandalone) {
    return 'hidden';
  }
  if (input.hasDeferredPrompt) {
    return 'native-prompt';
  }
  if (isIosSafariUserAgent(input.userAgent, input.maxTouchPoints ?? 0)) {
    return 'ios-guide';
  }
  return 'hidden';
}
