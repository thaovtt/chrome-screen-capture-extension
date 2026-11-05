# Screen Capture & Recorder Chrome Extension

A modern, high-performance, and privacy-focused Google Chrome extension built strictly on **Manifest V3 (MV3)**. Capture visible tabs, selected regions, and entire scrolling webpages, or record screen and tab video with microphone audio — all processed 100% locally on your machine with zero server uploads or external telemetry.

---

## ✨ Features

### 📸 Screenshot Capture
- **Visible Area Capture**: Instant 1-click capture of the currently visible viewport with precise physical Device Pixel Ratio (Retina/HiDPI) scaling.
- **Selected Area Capture**: Interactive drag-and-drop crop rectangle with dimensions tooltip and crosshairs, completely isolated inside a closed Shadow DOM.
- **Full-Page Scrolling Capture**: Automated scrolling orchestrator that captures tall pages in slices, hides duplicate fixed/sticky banners during scrolling, complies with Chrome's `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` quota, and stitches them into a seamless high-resolution image.

### 🎥 Video & Audio Recording
- **Tab Video Recording**: 1-click recording of the active browser tab using `chrome.tabCapture` without distracting modal prompts.
- **Screen & Window Recording**: Capture entire screens or specific application windows via `chrome.desktopCapture`.
- **Microphone Audio Mixing**: Optional microphone recording merged with tab/system audio using the Web Audio API (`AudioContext`).
- **Clean Video Mode**: By default, recording operates in clean mode without any on-screen extension widgets visible in the recorded video.
- **Floating Recording Controller**: Optional draggable on-screen controller with real-time timer, stop button, minimize/expand, and hide button (`✕`).
- **Native Stop-Sharing Integration**: Seamlessly syncs with Chrome's browser-level "Stop sharing" blue bar and toolbar `REC` badge.

### 🎨 Built-in Annotation Editor
Opens captures in a dedicated full-featured canvas editor tab:
- **Interactive Crop Tool**: Resizable crop rectangle with dimmed backdrop overlay and corner handles.
- **Select & Move Tool**: Hit-test existing annotations to reposition them anywhere on the canvas.
- **Annotation Tools**:
  - **Arrows**: Clean vector arrows with sharp tips and seamless shaft connections.
  - **Rectangles**: Outlined bounding boxes for callouts.
  - **Freehand Pen**: Smooth hand-drawn sketching and outlines.
  - **Text**: Custom typography labels.
  - **Blur / Pixelate Redaction**: Censor sensitive credentials, passwords, or personal data.
- **Undo / Redo History**: Full multi-step history for both drawings and crop operations.
- **Export Options**: Download as lossless PNG, quality-tuned JPEG, or copy directly to the system clipboard.

---

## 🔒 Privacy & Architecture

This extension operates under strict zero-telemetry and client-side processing principles:
- **Zero Remote Server Calls**: Captures, canvas manipulations, and video recordings never leave your device.
- **Manifest V3 Strict Compliance**: No remote scripts, `eval()`, or CDN injections.
- **Offscreen Media Processing**: Offloads canvas slicing, stitching, and `MediaRecorder` encoding to a sandboxed MV3 Offscreen Document (`src/offscreen/`), keeping the ephemeral background service worker lightweight and reliable.
- **Closed Shadow DOM Isolation**: All in-page UI (selection crosshairs and floating controller) are encapsulated in `attachShadow({ mode: 'closed' })` to prevent host page CSS collisions.

---

## 🛠️ Tech Stack

- **Runtime**: Google Chrome (Manifest V3)
- **Language**: TypeScript (`strict: true`, ES2022+)
- **UI Framework**: React 18 & Lucide Icons
- **Bundler**: Vite with `@crxjs/vite-plugin`
- **Styling**: Tailwind CSS & PostCSS
- **Testing**: Vitest with JSDOM & Chrome API mocks

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- `npm` or `pnpm`

### Installation & Build

1. Clone the repository:
   ```bash
   git clone git@github.com:thaovtt/chrome-screen-capture-extension.git
   cd chrome-screen-capture-extension
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension for production:
   ```bash
   npm run build
   ```
   The compiled extension will be output to the `dist/` directory.

4. (Optional) Run Vite in watch mode for development:
   ```bash
   npm run dev
   ```

---

## 📦 Loading the Extension into Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** via the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `dist/` directory inside this project folder.
5. Pin **Screen Capture & Recorder** to your Chrome toolbar for quick access.

---

## 🧪 Testing

Run the automated Vitest unit test suite covering storage helpers, canvas cropping, geometry utilities, and the recording engine:

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 📂 Project Structure

```text
chrome-screen-capture-extension/
├── manifest.json              # Chrome Manifest V3 configuration
├── package.json               # Scripts & dependencies
├── vite.config.ts             # Vite & CRX plugin configuration
├── tailwind.config.js         # Tailwind styling rules
├── src/
│   ├── background/            # MV3 ephemeral service worker
│   │   ├── index.ts           # Central command orchestrator
│   │   ├── capture.ts         # Visible tab capture & retry rate-limiting
│   │   └── offscreen-manager.ts # Offscreen document lifecycle manager
│   ├── content/               # Injected page scripts (Shadow DOM isolated)
│   │   ├── index.ts           # Content script message router
│   │   ├── overlay.ts         # Area selection backdrop & rect selector
│   │   ├── recorder-widget.ts # Floating on-screen recording controller
│   │   └── scroller.ts        # Full-page scroll controller
│   ├── offscreen/             # Offscreen DOM for canvas & media recording
│   │   ├── offscreen.html
│   │   ├── offscreen.ts       # Router for offscreen tasks
│   │   ├── canvas-crop.ts     # DPR-scaled canvas cropping
│   │   ├── canvas-stitch.ts   # Multi-slice vertical canvas stitching
│   │   └── recorder.ts        # MediaRecorder stream encoder & audio mixer
│   ├── popup/                 # Toolbar extension popup UI
│   │   ├── popup.html
│   │   ├── popup.tsx          # Popup entry
│   │   └── App.tsx            # Capture triggers, recording toggles, & settings
│   ├── editor/                # Full-page annotation editor tab
│   │   ├── editor.html
│   │   ├── editor.tsx         # Editor mount point
│   │   └── EditorApp.tsx      # Vector canvas tools, crop, & export options
│   └── shared/                # Type definitions and cross-context utilities
│       ├── messages.ts        # Discriminated union message protocol
│       ├── storage.ts         # Chrome storage sync/session wrappers
│       └── utils.ts           # Math, timestamps, & DPR geometry helpers
└── tests/
    └── unit/                  # Unit test suites (Vitest + JSDOM)
        ├── offscreen/         # Canvas and recorder tests
        └── shared/            # Utilities and storage tests
```

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
