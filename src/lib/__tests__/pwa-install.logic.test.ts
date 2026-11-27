import { describe, expect, it } from 'vitest';
import { isIosSafariUserAgent, resolvePwaInstallMode } from '../pwa-install.logic';

describe('pwa-install.logic', () => {
  it('hides install button when app is already running in standalone mode', () => {
    expect(
      resolvePwaInstallMode({
        isStandalone: true,
        hasDeferredPrompt: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      }),
    ).toBe('hidden');
  });

  it('uses native-prompt when browser deferred prompt is available', () => {
    expect(
      resolvePwaInstallMode({
        isStandalone: false,
        hasDeferredPrompt: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
      }),
    ).toBe('native-prompt');
  });

  it('shows ios-guide on iPhone/iPad Safari but hides on Chrome iOS or desktop Firefox', () => {
    const iosSafari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    const ipadDesktopUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    const chromeIos =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1';

    expect(isIosSafariUserAgent(iosSafari)).toBe(true);
    expect(isIosSafariUserAgent(ipadDesktopUa, 5)).toBe(true);
    expect(isIosSafariUserAgent(ipadDesktopUa, 0)).toBe(false);
    expect(isIosSafariUserAgent(chromeIos)).toBe(false);

    expect(
      resolvePwaInstallMode({
        isStandalone: false,
        hasDeferredPrompt: false,
        userAgent: iosSafari,
      }),
    ).toBe('ios-guide');

    expect(
      resolvePwaInstallMode({
        isStandalone: false,
        hasDeferredPrompt: false,
        userAgent: chromeIos,
      }),
    ).toBe('hidden');
  });
});
