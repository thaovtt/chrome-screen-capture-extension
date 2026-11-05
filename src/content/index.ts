import { startAreaSelection, cleanupOverlay } from './overlay';
import { getPageDimensions, scrollToY, hideFixedElements } from './scroller';
import { showRecordingWidget, hideRecordingWidget } from './recorder-widget';

console.log('[Content Script] Initialized');

let restoreFixedFn: (() => void) | null = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'PING':
      sendResponse({ status: 'pong' });
      break;

    case 'START_AREA_SELECTION':
      startAreaSelection();
      sendResponse({ success: true });
      break;

    case 'CANCEL_AREA_SELECTION':
      cleanupOverlay();
      sendResponse({ success: true });
      break;

    case 'START_FULL_PAGE': {
      // Temporarily hide fixed/sticky elements (navbars, sticky ads) during slice capture
      if (!restoreFixedFn) {
        restoreFixedFn = hideFixedElements();
      }
      const dimensions = getPageDimensions();
      sendResponse(dimensions);
      break;
    }

    case 'SCROLL_TO': {
      scrollToY(message.payload.y);
      sendResponse({ success: true });
      break;
    }

    case 'RESTORE_PAGE': {
      // Restore any hidden fixed elements after full-page capture finishes
      if (restoreFixedFn) {
        restoreFixedFn();
        restoreFixedFn = null;
      }
      sendResponse({ success: true });
      break;
    }

    case 'SHOW_RECORDING_WIDGET':
      showRecordingWidget();
      sendResponse({ success: true });
      break;

    case 'HIDE_RECORDING_WIDGET':
      hideRecordingWidget();
      sendResponse({ success: true });
      break;

    default:
      break;
  }
  return true;
});
