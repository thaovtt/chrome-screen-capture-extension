import type { ExtensionMessage } from '../shared/messages';
import { cropImage } from './canvas-crop';
import { stitchSlices } from './canvas-stitch';
import { startRecording, stopRecording } from './recorder';

console.log('[Offscreen] Document ready');

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => {
  switch (message.type) {
    case 'CROP_IMAGE': {
      const { dataUrl, rect, dpr } = message.payload;
      cropImage(dataUrl, rect, dpr)
        .then((croppedUrl) => sendResponse({ success: true, data: croppedUrl }))
        .catch((err: Error) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'STITCH_SLICES': {
      const { slices, totalHeight, viewportHeight, dpr } = message.payload;
      stitchSlices(slices, totalHeight, viewportHeight, dpr)
        .then((stitchedUrl) => sendResponse({ success: true, data: stitchedUrl }))
        .catch((err: Error) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'OFFSCREEN_START_RECORDING': {
      const { streamId, mediaSource, hasAudio, includeMic } = message.payload;
      startRecording({ streamId, mediaSource, hasAudio, includeMic })
        .then(() => sendResponse({ success: true }))
        .catch((err: Error) => {
          console.error('[Offscreen] startRecording failed:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    case 'OFFSCREEN_STOP_RECORDING': {
      stopRecording();
      sendResponse({ success: true });
      return false;
    }

    default:
      return false;
  }
});
