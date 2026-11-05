export function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  // Use chrome.downloads API (works in service worker and extension pages)
  if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
    chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: false,
    });
    return;
  }

  // Fallback: DOM approach (editor/popup pages where chrome.downloads may not be available)
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function copyImageToClipboard(dataUrl: string): Promise<boolean> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ]);
    return true;
  } catch (err) {
    console.error('Failed to copy image to clipboard:', err);
    return false;
  }
}

/**
 * Check if a URL is a protected Chrome page where content scripts cannot run.
 */
export function isProtectedUrl(url: string | undefined): boolean {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.includes('chromewebstore.google.com') ||
    url.startsWith('about:')
  );
}

/**
 * Scale CSS pixel coordinates to physical device pixels.
 */
export function scaleToDPR(value: number, dpr: number): number {
  return Math.round(value * dpr);
}
