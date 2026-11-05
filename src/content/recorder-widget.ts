/**
 * Floating on-screen recording controller widget.
 * Injected into the active web page during video recording sessions when enabled.
 * Encapsulated in a closed Shadow DOM to avoid CSS collisions with host pages.
 */

let widgetHost: HTMLDivElement | null = null;
let timerInterval: number | null = null;
let secondsElapsed = 0;

export function showRecordingWidget(): void {
  if (widgetHost) {
    hideRecordingWidget();
  }

  secondsElapsed = 0;
  widgetHost = document.createElement('div');
  widgetHost.id = 'screen-capture-recorder-widget-host';
  widgetHost.style.position = 'fixed';
  widgetHost.style.bottom = '24px';
  widgetHost.style.right = '24px';
  widgetHost.style.zIndex = '2147483647';
  widgetHost.style.pointerEvents = 'auto';

  const shadow = widgetHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }
    .widget-container {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 6px 14px;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(51, 65, 85, 0.8);
      border-radius: 9999px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      user-select: none;
      cursor: grab;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .widget-container:active {
      cursor: grabbing;
    }
    .widget-container.minimized {
      padding: 6px 10px;
      gap: 6px;
    }
    .widget-container.minimized .hide-on-minimize {
      display: none !important;
    }
    .rec-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rec-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ef4444;
      box-shadow: 0 0 10px #ef4444;
      animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .rec-label {
      color: #f87171;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .timer {
      color: #f1f5f9;
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      min-width: 44px;
      text-align: center;
    }
    .divider {
      width: 1px;
      height: 16px;
      background: rgba(71, 85, 105, 0.6);
    }
    .stop-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #dc2626;
      color: #ffffff;
      border: none;
      border-radius: 9999px;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease, transform 0.1s ease;
      outline: none;
    }
    .stop-btn:hover {
      background: #b91c1c;
      transform: scale(1.02);
    }
    .stop-btn:active {
      transform: scale(0.98);
    }
    .stop-icon {
      width: 8px;
      height: 8px;
      background: currentColor;
      border-radius: 1px;
    }
    .action-icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 0;
      transition: color 0.15s, background-color 0.15s;
    }
    .action-icon-btn:hover {
      color: #f1f5f9;
      background: rgba(255, 255, 255, 0.1);
    }
    .toast-msg {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 10px 16px;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(51, 65, 85, 0.8);
      border-radius: 8px;
      color: #cbd5e1;
      font-size: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  const container = document.createElement('div');
  container.className = 'widget-container';

  // Status Indicator
  const recIndicator = document.createElement('div');
  recIndicator.className = 'rec-indicator';
  const dot = document.createElement('div');
  dot.className = 'rec-dot';
  const label = document.createElement('span');
  label.className = 'rec-label hide-on-minimize';
  label.textContent = 'REC';
  recIndicator.appendChild(dot);
  recIndicator.appendChild(label);

  // Timer
  const timer = document.createElement('div');
  timer.className = 'timer';
  timer.textContent = '00:00';

  // Divider
  const divider = document.createElement('div');
  divider.className = 'divider hide-on-minimize';

  // Stop Button
  const stopBtn = document.createElement('button');
  stopBtn.className = 'stop-btn hide-on-minimize';
  const stopIcon = document.createElement('span');
  stopIcon.className = 'stop-icon';
  const stopText = document.createElement('span');
  stopText.textContent = 'Stop';
  stopBtn.appendChild(stopIcon);
  stopBtn.appendChild(stopText);

  stopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    stopBtn.disabled = true;
    stopText.textContent = 'Saving...';
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    setTimeout(hideRecordingWidget, 1000);
  });

  // Minimize / Expand Button
  const minBtn = document.createElement('button');
  minBtn.className = 'action-icon-btn';
  minBtn.title = 'Minimize / Expand';
  minBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  `;
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.toggle('minimized');
  });

  // Hide / Dismiss Button
  const hideBtn = document.createElement('button');
  hideBtn.className = 'action-icon-btn';
  hideBtn.title = 'Hide from recording (use extension icon [REC] to stop)';
  hideBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;
  hideBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideRecordingWidget();
    showTransientToast('Widget hidden. Stop recording anytime via the extension icon [REC] or Chrome\'s bar.');
  });

  container.appendChild(recIndicator);
  container.appendChild(timer);
  container.appendChild(divider);
  container.appendChild(stopBtn);
  container.appendChild(minBtn);
  container.appendChild(hideBtn);

  shadow.appendChild(style);
  shadow.appendChild(container);

  // Dragging support
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  container.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = widgetHost!.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !widgetHost) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    widgetHost.style.bottom = 'auto';
    widgetHost.style.right = 'auto';
    widgetHost.style.left = `${initialLeft + dx}px`;
    widgetHost.style.top = `${initialTop + dy}px`;
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  document.documentElement.appendChild(widgetHost);

  // Timer interval
  timerInterval = window.setInterval(() => {
    secondsElapsed++;
    const mins = Math.floor(secondsElapsed / 60);
    const secs = secondsElapsed % 60;
    timer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, 1000);
}

export function hideRecordingWidget(): void {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (widgetHost) {
    widgetHost.remove();
    widgetHost = null;
  }
  secondsElapsed = 0;
}

function showTransientToast(message: string): void {
  const toast = document.createElement('div');
  const shadow = toast.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 10px 16px;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(59, 130, 246, 0.6);
      border-radius: 8px;
      color: #f1f5f9;
      font-size: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  const container = document.createElement('div');
  container.className = 'toast';
  container.innerHTML = `<span>ℹ️</span> <span>${message}</span>`;
  shadow.appendChild(style);
  shadow.appendChild(container);
  document.documentElement.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
