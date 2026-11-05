import type { CropRect } from '../shared/messages';

let overlayHost: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;

export function startAreaSelection(): void {
  if (overlayHost) {
    cleanupOverlay();
  }

  overlayHost = document.createElement('div');
  overlayHost.id = 'screen-capture-extension-host';
  overlayHost.style.position = 'fixed';
  overlayHost.style.top = '0';
  overlayHost.style.left = '0';
  overlayHost.style.width = '100vw';
  overlayHost.style.height = '100vh';
  overlayHost.style.zIndex = '2147483647';
  overlayHost.style.pointerEvents = 'auto';

  shadowRoot = overlayHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }
    .overlay-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      cursor: crosshair;
      user-select: none;
    }
    .backdrop {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.4);
    }
    .selection-box {
      position: absolute;
      border: 2px dashed #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
      pointer-events: none;
      display: none;
    }
    .tooltip {
      position: absolute;
      bottom: -32px;
      left: 0;
      background: #1e293b;
      color: #ffffff;
      padding: 4px 8px;
      font-size: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .hint-bar {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: #0f172a;
      color: #f8fafc;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      pointer-events: none;
    }
  `;

  const container = document.createElement('div');
  container.className = 'overlay-container';

  const hintBar = document.createElement('div');
  hintBar.className = 'hint-bar';
  hintBar.textContent = 'Drag to select capture area • Press ESC to cancel';

  const selectionBox = document.createElement('div');
  selectionBox.className = 'selection-box';

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  selectionBox.appendChild(tooltip);

  container.appendChild(hintBar);
  container.appendChild(selectionBox);

  shadowRoot.appendChild(style);
  shadowRoot.appendChild(container);

  document.documentElement.appendChild(overlayHost);

  let startX = 0;
  let startY = 0;
  let isSelecting = false;

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.display = 'block';
    updateBox(startX, startY, 0, 0);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isSelecting) return;
    const currentX = e.clientX;
    const currentY = e.clientY;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    updateBox(x, y, width, height);
  };

  const onMouseUp = (e: MouseEvent) => {
    if (!isSelecting) return;
    isSelecting = false;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const rect: CropRect = {
      x: Math.min(startX, currentX),
      y: Math.min(startY, currentY),
      width: Math.abs(currentX - startX),
      height: Math.abs(currentY - startY),
    };

    cleanupOverlay();

    // Ignore tiny accidental clicks (< 5px)
    if (rect.width > 5 && rect.height > 5) {
      chrome.runtime.sendMessage({
        type: 'AREA_SELECTED',
        payload: {
          rect,
          dpr: window.devicePixelRatio || 1,
        },
      });
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanupOverlay();
      chrome.runtime.sendMessage({ type: 'CANCEL_AREA_SELECTION' });
    }
  };

  function updateBox(x: number, y: number, w: number, h: number) {
    selectionBox.style.left = `${x}px`;
    selectionBox.style.top = `${y}px`;
    selectionBox.style.width = `${w}px`;
    selectionBox.style.height = `${h}px`;
    tooltip.textContent = `${Math.round(w)} × ${Math.round(h)} px`;
  }

  container.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeyDown);

  (overlayHost as unknown as { _cleanup: () => void })._cleanup = () => {
    container.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown);
    overlayHost?.remove();
    overlayHost = null;
    shadowRoot = null;
  };
}

export function cleanupOverlay(): void {
  if (overlayHost && (overlayHost as unknown as { _cleanup?: () => void })._cleanup) {
    (overlayHost as unknown as { _cleanup: () => void })._cleanup();
  }
}
