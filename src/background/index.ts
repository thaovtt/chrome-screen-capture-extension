import {
  captureVisibleTab,
  cropImageViaOffscreen,
  stitchSlicesViaOffscreen,
  openEditorWithImage,
} from './capture';
import { setupOffscreenDocument } from './offscreen-manager';
import type { ExtensionMessage, ExtensionResponse } from '../shared/messages';
import { getSettings, setSessionState } from '../shared/storage';
import { downloadDataUrl, formatTimestamp, isProtectedUrl } from '../shared/utils';

console.log('[Background] Service worker initialized');

// Message listener
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ success: true, data: result }))
    .catch((error: Error) => {
      console.error('[Background] Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    });
  return true; // Keep channel open for async response
});

/**
 * Locate the active browser tab that the user is currently viewing.
 * Uses lastFocusedWindow to avoid capturing the extension's popup or background context.
 */
async function getTargetTab(): Promise<chrome.tabs.Tab> {
  let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) {
    const tabs = await chrome.tabs.query({ active: true });
    tab = tabs[0];
  }
  if (!tab?.id) {
    throw new Error('No active browser tab found. Please make sure a web page is open.');
  }
  return tab;
}

/**
 * Ensure that the content script is active and responsive on the target tab.
 * If the tab was opened before the extension was reloaded or installed,
 * dynamically inject the content script bundle using chrome.scripting.
 */
async function ensureContentScriptReady(tabId: number): Promise<void> {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (res?.status === 'pong') return;
  } catch {
    // Content script is not listening; proceed to inject
  }

  console.log('[Background] Content script not detected on tab', tabId, '- injecting dynamically');
  const manifest = chrome.runtime.getManifest();
  const contentScriptFiles = manifest.content_scripts?.[0]?.js;

  if (contentScriptFiles && contentScriptFiles.length > 0) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: contentScriptFiles,
    });
    // Give content script a brief moment to set up its message listener
    await new Promise((resolve) => setTimeout(resolve, 150));
  } else {
    throw new Error('Content script bundle not found in extension manifest.');
  }
}

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case 'CAPTURE_VISIBLE': {
      const activeTab = await getTargetTab();
      if (isProtectedUrl(activeTab.url)) {
        throw new Error('Cannot capture protected Chrome pages (e.g. chrome:// or Web Store).');
      }

      const dataUrl = await captureVisibleTab(activeTab.windowId);
      const settings = await getSettings();

      if (settings.autoOpenEditor) {
        await openEditorWithImage(dataUrl);
      } else {
        const ext = settings.imageFormat === 'jpeg' ? 'jpg' : 'png';
        downloadDataUrl(dataUrl, `screenshot_${formatTimestamp()}.${ext}`);
      }
      return { dataUrl };
    }

    case 'START_AREA_SELECTION': {
      const activeTab = await getTargetTab();
      if (!activeTab.id) throw new Error('No active tab found');

      if (isProtectedUrl(activeTab.url)) {
        throw new Error(
          'Screen capture overlays cannot run on protected Chrome pages (e.g. chrome://, Web Store, or about:blank). Please test on a standard website like https://example.com.'
        );
      }

      await ensureContentScriptReady(activeTab.id);
      await chrome.tabs.sendMessage(activeTab.id, { type: 'START_AREA_SELECTION' });
      return null;
    }

    case 'AREA_SELECTED': {
      const { rect, dpr } = message.payload;
      const targetWindowId = sender.tab?.windowId;
      const rawCapture = await captureVisibleTab(targetWindowId);
      const cropped = await cropImageViaOffscreen(rawCapture, rect, dpr);
      const settings = await getSettings();

      if (settings.autoOpenEditor) {
        await openEditorWithImage(cropped);
      } else {
        const ext = settings.imageFormat === 'jpeg' ? 'jpg' : 'png';
        downloadDataUrl(cropped, `crop_${formatTimestamp()}.${ext}`);
      }
      return { cropped };
    }

    case 'START_FULL_PAGE': {
      const activeTab = await getTargetTab();
      if (!activeTab.id) throw new Error('No active tab found');

      if (isProtectedUrl(activeTab.url)) {
        throw new Error(
          'Full page capture cannot run on protected Chrome pages (e.g. chrome://, Web Store, or about:blank). Please test on a standard website like https://example.com.'
        );
      }

      await ensureContentScriptReady(activeTab.id);

      // Request scroll info and hide sticky elements on the tab
      const pageInfo = (await chrome.tabs.sendMessage(activeTab.id, {
        type: 'START_FULL_PAGE',
      })) as {
        totalHeight: number;
        viewportHeight: number;
        dpr: number;
      };

      if (!pageInfo) throw new Error('Could not calculate page dimensions');

      const { totalHeight, viewportHeight, dpr } = pageInfo;
      const slices: string[] = [];
      let currentY = 0;
      const MAX_SLICES = 40; // Max ~30,000–35,000px height to prevent canvas crash

      try {
        while (currentY < totalHeight && slices.length < MAX_SLICES) {
          // Scroll to current offset
          await chrome.tabs.sendMessage(activeTab.id, {
            type: 'SCROLL_TO',
            payload: { y: currentY },
          } satisfies ExtensionMessage);

          // Rate-limiting delay: Chrome enforces a strict limit of MAX 2 calls per second
          // on chrome.tabs.captureVisibleTab (MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND).
          // Waiting 650ms guarantees we stay safely below the quota (1.5 calls/sec).
          await new Promise((resolve) => setTimeout(resolve, 650));

          // Capture visible slice of target window (with automatic retry)
          const sliceDataUrl = await captureVisibleTab(activeTab.windowId);
          slices.push(sliceDataUrl);

          currentY += viewportHeight;
        }
      } finally {
        // Always reset scroll position and restore fixed/sticky headers
        await chrome.tabs.sendMessage(activeTab.id, {
          type: 'SCROLL_TO',
          payload: { y: 0 },
        } satisfies ExtensionMessage).catch(() => {});

        await chrome.tabs.sendMessage(activeTab.id, {
          type: 'RESTORE_PAGE',
        } satisfies ExtensionMessage).catch(() => {});
      }

      // Stitch all slices via offscreen canvas
      const stitched = await stitchSlicesViaOffscreen(slices, totalHeight, viewportHeight, dpr);
      const settings = await getSettings();

      if (settings.autoOpenEditor) {
        await openEditorWithImage(stitched);
      } else {
        const ext = settings.imageFormat === 'jpeg' ? 'jpg' : 'png';
        downloadDataUrl(stitched, `fullpage_${formatTimestamp()}.${ext}`);
      }

      return { stitched };
    }

    case 'OPEN_EDITOR': {
      await openEditorWithImage(message.payload.imageDataUrl);
      return null;
    }

    case 'START_RECORDING': {
      const { recordMode, includeMic } = message.payload;
      await setupOffscreenDocument();

      const targetTab = await getTargetTab();
      let streamId = '';
      let mediaSource: 'tab' | 'desktop' = 'tab';
      let hasAudio = true;

      if (recordMode === 'tab') {
        // 1. Direct active tab capture without picker prompt (using chrome.tabCapture)
        mediaSource = 'tab';
        hasAudio = true;
        streamId = await new Promise<string>((resolve, reject) => {
          chrome.tabCapture.getMediaStreamId({ targetTabId: targetTab.id }, (id: string) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (id) {
              resolve(id);
            } else {
              reject(new Error('Failed to acquire tab stream ID'));
            }
          });
        });
      } else {
        // 2. Entire screen or application window capture (using chrome.desktopCapture)
        mediaSource = 'desktop';
        const result = await new Promise<{ streamId: string; canAudio: boolean }>((resolve, reject) => {
          chrome.desktopCapture.chooseDesktopMedia(
            ['screen', 'window'],
            targetTab,
            (id: string, opts?: { canRequestAudioTrack?: boolean }) => {
              if (id) {
                resolve({
                  streamId: id,
                  canAudio: Boolean(opts?.canRequestAudioTrack),
                });
              } else {
                reject(new Error('User cancelled media selection'));
              }
            }
          );
        });
        streamId = result.streamId;
        hasAudio = result.canAudio;
      }

      // Forward configured stream to offscreen document
      const response = await chrome.runtime.sendMessage<ExtensionMessage, ExtensionResponse>({
        type: 'OFFSCREEN_START_RECORDING',
        payload: {
          streamId,
          mediaSource,
          hasAudio,
          includeMic,
        },
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to start recording');
      }

      // Update state and UI indicators
      await setSessionState('isRecording', true);

      // Show red REC badge in the toolbar icon
      chrome.action.setBadgeText({ text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });

      // Inject floating on-screen recording controller widget on the active tab if enabled
      const settings = await getSettings();
      const shouldShowWidget = message.payload.showWidget ?? settings.showRecordingWidget;

      if (shouldShowWidget && targetTab.id) {
        await ensureContentScriptReady(targetTab.id).catch(() => {});
        chrome.tabs.sendMessage(targetTab.id, { type: 'SHOW_RECORDING_WIDGET' }).catch(() => {});
      }

      return null;
    }

    case 'STOP_RECORDING': {
      // Clear toolbar badge
      chrome.action.setBadgeText({ text: '' });

      // Tell all tabs to hide the floating recording widget
      const tabs = await chrome.tabs.query({});
      for (const t of tabs) {
        if (t.id) {
          chrome.tabs.sendMessage(t.id, { type: 'HIDE_RECORDING_WIDGET' }).catch(() => {});
        }
      }

      // Instruct offscreen document to finalize MediaRecorder
      await chrome.runtime.sendMessage<ExtensionMessage, ExtensionResponse>({
        type: 'OFFSCREEN_STOP_RECORDING',
      });

      await setSessionState('isRecording', false);
      return null;
    }

    case 'RECORDING_COMPLETE': {
      const { blobUrl } = message.payload;

      // Clear toolbar badge & hide widgets
      chrome.action.setBadgeText({ text: '' });
      const tabs = await chrome.tabs.query({});
      for (const t of tabs) {
        if (t.id) {
          chrome.tabs.sendMessage(t.id, { type: 'HIDE_RECORDING_WIDGET' }).catch(() => {});
        }
      }

      // Automatically download the recorded WebM file
      await chrome.downloads.download({
        url: blobUrl,
        filename: `recording_${formatTimestamp()}.webm`,
        saveAs: false,
      });

      await setSessionState('isRecording', false);
      return null;
    }

    default:
      return null;
  }
}
