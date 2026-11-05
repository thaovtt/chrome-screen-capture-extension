const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';

let creatingOffscreen: Promise<void> | null = null;

export async function hasOffscreenDocument(): Promise<boolean> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const matchedClients = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  });
  return matchedClients.length > 0;
}

export async function setupOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [
      chrome.offscreen.Reason.BLOBS,
      chrome.offscreen.Reason.USER_MEDIA,
      chrome.offscreen.Reason.DOM_SCRAPING,
    ],
    justification: 'Perform canvas image stitching, cropping, and audio/video recording',
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

export async function closeOffscreenDocument(): Promise<void> {
  if (!(await hasOffscreenDocument())) {
    return;
  }
  await chrome.offscreen.closeDocument();
}
