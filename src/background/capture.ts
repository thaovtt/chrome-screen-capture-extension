import { setupOffscreenDocument } from './offscreen-manager';
import type { CropRect, ExtensionMessage, ExtensionResponse } from '../shared/messages';
import { getSettings } from '../shared/storage';

/**
 * Capture the visible tab with automatic rate-limit throttling and retry on quota errors.
 * Chrome limits captureVisibleTab to MAX 2 calls per second (MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND).
 */
export async function captureVisibleTab(windowId?: number, retries = 3): Promise<string> {
  const settings = await getSettings();
  const format = settings.imageFormat === 'jpeg' ? 'jpeg' : 'png';
  const quality = format === 'jpeg' ? Math.round(settings.imageQuality * 100) : undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (typeof windowId === 'number' && windowId >= 0) {
        return await chrome.tabs.captureVisibleTab(windowId, {
          format,
          quality,
        });
      }

      return await chrome.tabs.captureVisibleTab({
        format,
        quality,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND') && attempt < retries) {
        console.warn(
          `[Capture] Chrome quota reached (attempt ${attempt + 1}/${retries}). Waiting 750ms before retry...`
        );
        await new Promise((resolve) => setTimeout(resolve, 750));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Capture visible tab failed after maximum retries');
}

export async function cropImageViaOffscreen(
  dataUrl: string,
  rect: CropRect,
  dpr: number
): Promise<string> {
  await setupOffscreenDocument();

  const response = await chrome.runtime.sendMessage<
    ExtensionMessage,
    ExtensionResponse<string>
  >({
    type: 'CROP_IMAGE',
    payload: { dataUrl, rect, dpr },
  });

  if (!response?.success || !response.data) {
    throw new Error(response?.error || 'Failed to crop image in offscreen document');
  }

  return response.data;
}

export async function stitchSlicesViaOffscreen(
  slices: string[],
  totalHeight: number,
  viewportHeight: number,
  dpr: number
): Promise<string> {
  await setupOffscreenDocument();

  const response = await chrome.runtime.sendMessage<
    ExtensionMessage,
    ExtensionResponse<string>
  >({
    type: 'STITCH_SLICES',
    payload: { slices, totalHeight, viewportHeight, dpr },
  });

  if (!response?.success || !response.data) {
    throw new Error(response?.error || 'Failed to stitch full-page slices');
  }

  return response.data;
}

export async function openEditorWithImage(imageDataUrl: string): Promise<void> {
  // Store the image data in storage.local temporarily for the editor
  const captureId = `capture_${Date.now()}`;
  await chrome.storage.local.set({ [captureId]: imageDataUrl, latestCaptureId: captureId });

  const editorUrl = chrome.runtime.getURL(`src/editor/editor.html?id=${captureId}`);
  await chrome.tabs.create({ url: editorUrl });
}
