import { describe, it, expect, vi } from 'vitest';
import { formatTimestamp, isProtectedUrl, scaleToDPR, downloadDataUrl } from '../../../src/shared/utils';

describe('Shared Utilities', () => {
  it('formats timestamp as YYYY-MM-DD_HH-MM-SS', () => {
    const fixedDate = new Date(2026, 10, 5, 14, 30, 45); // Month is 0-indexed: 10 = Nov
    const formatted = formatTimestamp(fixedDate);
    expect(formatted).toBe('2026-11-05_14-30-45');
  });

  it('correctly identifies protected Chrome URLs', () => {
    expect(isProtectedUrl('chrome://settings')).toBe(true);
    expect(isProtectedUrl('chrome-extension://someid/popup.html')).toBe(true);
    expect(isProtectedUrl('https://chromewebstore.google.com/detail/123')).toBe(true);
    expect(isProtectedUrl('about:blank')).toBe(true);
    expect(isProtectedUrl(undefined)).toBe(true);

    expect(isProtectedUrl('https://github.com')).toBe(false);
    expect(isProtectedUrl('https://example.com/page')).toBe(false);
  });

  it('scales CSS pixel dimensions to physical device pixels according to DPR', () => {
    expect(scaleToDPR(100, 1)).toBe(100);
    expect(scaleToDPR(100, 2)).toBe(200);
    expect(scaleToDPR(150, 1.5)).toBe(225);
    expect(scaleToDPR(33.3, 2)).toBe(67);
  });

  it('uses chrome.downloads when available', () => {
    const downloadSpy = vi.spyOn(chrome.downloads, 'download');
    downloadDataUrl('data:image/png;base64,mock', 'test.png');
    expect(downloadSpy).toHaveBeenCalledWith({
      url: 'data:image/png;base64,mock',
      filename: 'test.png',
      saveAs: false,
    });
  });
});

