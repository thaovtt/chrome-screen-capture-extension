# AGENTS.md — Chrome Screen Capture & Recording Extension

> **Project Target**: Google Chrome Extension (Manifest V3)  
> **Core Domain**: High-performance screen capture (visible tab, selected area, full-page scrolling), screen/tab audio-video recording, and client-side annotation editor.

---

## 1. Project Overview & Architecture

This project is a modern, privacy-focused Google Chrome extension built strictly on **Manifest V3 (MV3)**. It enables users to take screenshots, record screen/tab video with audio, annotate captures, and export them without sending any user data to external servers.

### Architectural Components

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Chrome Browser Context                          │
├───────────────┬────────────────────────────┬───────────────────────────┤
│   Popup / UI  │  Content Script (Page DOM) │ Offscreen Document (DOM)  │
│  - User menu  │  - Selection overlay       │ - Canvas cropping/stitch  │
│  - Quick cuts │  - Scroll orchestration    │ - MediaRecorder (video)   │
│  - Settings   │  - Shadow DOM encapsulated │ - WebAudio / Mixer        │
└───────┬───────┴─────────────┬──────────────┴─────────────┬─────────────┘
        │                     │                            │
        └────────────────┐    │    ┌───────────────────────┘
                         ▼    ▼    ▼
        ┌────────────────────────────────────────────┐
        │        Background Service Worker           │
        │  - Ephemeral event orchestrator            │
        │  - chrome.tabs / chrome.desktopCapture     │
        │  - Offscreen lifecycle management          │
        │  - chrome.storage state persistence        │
        └─────────────────────┬──────────────────────┘
                              ▼
        ┌────────────────────────────────────────────┐
        │        Annotation Editor (New Tab)         │
        │  - Canvas markup (arrows, text, blur)      │
        │  - Local export (PNG, JPEG, PDF, WebM)     │
        │  - Clipboard integration                   │
        └────────────────────────────────────────────┘
```

1. **Background Service Worker (`src/background/`)**:
   - Ephemeral event hub. Coordinates capture commands, manages extension lifecycle, and bridges messages.
   - **Rule**: *Never assume in-memory state persists*. The service worker can terminate after ~30 seconds of inactivity. Always persist transient states in `chrome.storage.session` or `chrome.storage.local`.

2. **Offscreen Document (`src/offscreen/`)**:
   - **Critical MV3 Requirement**: Service workers do not have access to the DOM, HTML `<canvas>`, or `MediaRecorder`.
   - The offscreen document runs a hidden DOM page specifically for:
     - Canvas manipulation (cropping, scaling, stitching full-page images).
     - Video encoding via `MediaRecorder` for desktop/tab streams.
     - Clipboard writing for binary image data.

3. **Content Scripts (`src/content/`)**:
   - Injected into web pages to handle user-interactive area selection and full-page scrolling.
   - **Isolation Requirement**: All content script overlays, crosshairs, and UI toolbars **must** be rendered inside a **closed Shadow DOM** (`element.attachShadow({ mode: 'closed' })`) to prevent host page CSS leaking into the extension, or extension styles breaking host pages.

4. **Popup UI (`src/popup/`)**:
   - Toolbar popup providing quick capture triggers: Visible Area, Selected Region, Full Page, Screen/Tab Record, Options.

5. **Annotation Editor (`src/editor/`)**:
   - Opens as a dedicated tab after capture. Provides vector annotation tools (rectangles, arrows, text, freehand, crop, pixelate/blur redaction) and export buttons.

---

## 2. Technical Stack & Tooling

- **Language**: TypeScript (`strict: true`, target ES2022+)
- **Build Tool**: [Vite](https://vitejs.dev/) with `@crxjs/vite-plugin` (or [WXT](https://wxt.dev/))
- **UI Framework**: React (or Preact / Vanilla TypeScript for minimal bundle size)
- **Styling**: Tailwind CSS (configured with prefix/shadow isolation for content scripts)
- **Canvas / Annotation**: HTML5 2D Canvas or Fabric.js / Konva.js for vector shapes & blur filters
- **Testing**: Vitest (unit/component), Playwright with Chrome extension loader (E2E)
- **Package Manager**: `pnpm` (preferred) or `npm`

---

## 3. Manifest V3 Mandates & Critical Rules

### Permissions Guidelines
Only declare what is strictly necessary. Chrome Web Store penalizes over-permissioned extensions:

```json
{
  "manifest_version": 3,
  "name": "Screen Capture & Recorder",
  "version": "1.0.0",
  "permissions": [
    "activeTab",
    "storage",
    "offscreen",
    "scripting",
    "downloads"
  ],
  "optional_permissions": [
    "tabCapture",
    "desktopCapture"
  ]
}
```

*Note: Use `activeTab` whenever possible instead of `<all_urls>` host permissions to guarantee smooth Chrome Web Store review.*

### Device Pixel Ratio (DPR) Rules
- Screen coordinates reported by mouse events in content scripts (`e.clientX`, `e.clientY`) are in **CSS pixels**.
- Images captured via `chrome.tabs.captureVisibleTab` are rendered at **physical device pixels** (`CSS pixels * window.devicePixelRatio`).
- **Rule**: Whenever cropping or stitching:
  $$\text{Canvas X} = \text{Client X} \times \text{devicePixelRatio}$$
  $$\text{Canvas Width} = \text{Client Width} \times \text{devicePixelRatio}$$
  Failing to do this results in blurred or misaligned screenshots on Retina/HiDPI displays.

### Content Security Policy (CSP)
- MV3 strictly forbids remote code execution: no `eval()`, no `new Function()`, no CDN `<script>` tags.
- All dependencies must be bundled locally into the build output (`dist/`).

---

## 4. Key Feature Recipes & Implementation Patterns

### A. Visible Tab Capture
```typescript
// src/background/capture.ts
export async function captureVisibleTab(windowId?: number): Promise<string> {
  return await chrome.tabs.captureVisibleTab(windowId || chrome.windows.WINDOW_ID_CURRENT, {
    format: 'png',
  });
}
```

### B. Selected Region Capture Workflow
1. User clicks **"Select Area"** in popup.
2. Background sends message `START_AREA_SELECTION` to the active tab's content script.
3. Content script mounts a fullscreen backdrop inside a Shadow DOM:
   - Tracks `mousedown`, `mousemove`, `mouseup`.
   - Draws a bounding box with dimensions tooltip and crosshairs.
4. On `mouseup`, content script extracts rect `{ x, y, width, height }` and `window.devicePixelRatio`.
5. Content script removes overlay and sends rect coordinates to Background.
6. Background calls `chrome.tabs.captureVisibleTab()`.
7. Background passes the raw data URL + coordinates to the Offscreen Document.
8. Offscreen canvas crops the region and returns the cropped image data URL or opens the Editor tab.

### C. Full Page Scroll Capture Workflow
1. Background injects scroll orchestrator into the active tab.
2. Content script calculates:
   - Total scroll height: `document.documentElement.scrollHeight`
   - Viewport height: `window.innerHeight`
   - Fixed/Sticky element positions: temporarily set `position: absolute` or hide duplicate banners during intermediate steps.
3. Content script scrolls down in increments:
   ```typescript
   window.scrollTo({ top: currentY, behavior: 'instant' });
   await new Promise(r => requestAnimationFrame(() => setTimeout(r, 150))); // wait for render
   ```
4. Background triggers `captureVisibleTab` on each step.
5. All image slices are sent to the Offscreen Document.
6. Offscreen document calculates composite canvas height:
   - Handles the fractional last slice by only taking the bottom delta.
   - Stitches slices together onto a single tall `<canvas>`.
7. Exports finished full-page image.

### D. Offscreen Document Manager
MV3 requires manual creation and termination of offscreen documents:

```typescript
// src/background/offscreen-manager.ts
let creatingOffscreen: Promise<void> | null = null;

export async function setupOffscreenDocument(path: string): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: path,
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
```

### E. Video & Audio Screen Recording
- Use `chrome.desktopCapture.chooseDesktopMedia(['screen', 'window', 'tab'], targetTab, streamId => ...)` or `navigator.mediaDevices.getDisplayMedia` in the offscreen document.
- Combine audio tracks (tab audio + microphone) using Web Audio API `AudioContext.createMediaStreamDestination()`.
- Feed merged stream to `MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9,opus' })`.
- Stream data chunks into IndexedDB or direct Blob URLs to prevent memory bloat during long recordings.

---

## 5. Type-Safe Message Protocol

All internal communications (`runtime.sendMessage` and `tabs.sendMessage`) must strictly adhere to discriminated union messages defined in `src/shared/messages.ts`:

```typescript
// src/shared/messages.ts
export type ExtensionMessage =
  | { type: 'CAPTURE_VISIBLE' }
  | { type: 'START_AREA_SELECTION' }
  | { type: 'AREA_SELECTED'; payload: { x: number; y: number; width: number; height: number; dpr: number } }
  | { type: 'START_FULL_PAGE' }
  | { type: 'CROP_IMAGE'; payload: { dataUrl: string; rect: CropRect; dpr: number } }
  | { type: 'STITCH_SLICES'; payload: { slices: string[]; totalHeight: number; viewportHeight: number; dpr: number } }
  | { type: 'START_RECORDING'; payload: { audio: boolean; mic: boolean } }
  | { type: 'STOP_RECORDING' }
  | { type: 'RECORDING_COMPLETE'; payload: { blobUrl: string } };

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

---

## 6. Project Directory Layout

```
chrome-screen-capture-extension/
├── AGENTS.md                   # This instruction file
├── GEMINI.md                   # Alias / Antigravity rule pointer
├── manifest.json               # Manifest V3 configuration
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── background/
│   │   ├── index.ts            # Service worker entry
│   │   ├── capture.ts          # Tabs API & capture commands
│   │   └── offscreen.ts        # Offscreen lifecycle & message bridge
│   ├── content/
│   │   ├── index.ts            # Content script entry
│   │   ├── overlay.ts          # Shadow DOM selection UI
│   │   └── scroller.ts         # Full-page scroll controller
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   ├── offscreen.ts        # Offscreen entry
│   │   ├── canvas-crop.ts      # Canvas slicing and DPR scaling
│   │   ├── canvas-stitch.ts    # Full-page canvas stitching
│   │   └── recorder.ts         # MediaRecorder stream handler
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.tsx           # Popup UI
│   │   └── popup.css
│   ├── editor/
│   │   ├── editor.html
│   │   ├── editor.tsx          # Full-featured annotation canvas UI
│   │   └── tools/              # Arrow, Text, Rect, Blur, Pen, Crop tools
│   └── shared/
│       ├── messages.ts         # Discriminated union message types
│       ├── storage.ts          # Typed wrappers around chrome.storage
│       └── utils.ts            # DPR, image conversion, geometry helpers
└── tests/
    ├── unit/
    └── e2e/
```

---

## 7. Developer & Agent Operational Workflows

### Setup & Commands
```bash
# Install dependencies
pnpm install

# Run Vite in watch/development mode
pnpm dev

# Type check
pnpm tsc --noEmit

# Production build (outputs to dist/)
pnpm build

# Run unit tests
pnpm test
```

### Loading the Unpacked Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **"Developer mode"** in the top-right corner.
3. Click **"Load unpacked"** and select the `dist/` directory.
4. When code changes occur, click the refresh/reload icon on the extension card.

### Debugging Guide
- **Popup UI**: Right-click the extension toolbar icon -> choose **"Inspect popup"**.
- **Background Service Worker**: In `chrome://extensions/`, click **"Inspect views: service worker"**.
- **Offscreen Document**: Navigate to `chrome://inspect/#other` to find and debug the offscreen document.
- **Content Scripts**: Open DevTools on any regular web page (`F12`), check Console with context set to the page or the extension's content script.

---

## 8. Development Rules for AI Agents

When implementing features or fixing bugs in this repository, follow these rules:

1. **Check `chrome.runtime.lastError`**: Always verify `chrome.runtime.lastError` when using Chrome APIs that take callbacks, or catch rejections in Promise-based APIs.
2. **Handle Protected Pages**: Content scripts cannot run on `chrome://*`, `chrome-extension://*`, or the Chrome Web Store (`chromewebstore.google.com`). Ensure the UI gracefully notifies the user if capture is attempted on restricted tabs.
3. **Preserve Memory in Canvas**: Large full-page screenshots can consume hundreds of megabytes of RAM. Explicitly set canvas width/height to 0 when finished, and revoke all temporary object URLs (`URL.revokeObjectURL`).
4. **Encapsulate Content Scripts**: Never insert raw `<div>`s or styles directly into host page `document.body`. Always wrap in a closed Shadow Root.
5. **No External Network Calls**: Ensure 100% of image manipulation and video encoding happens locally in the browser. Do not introduce any third-party analytical or remote dependencies.
