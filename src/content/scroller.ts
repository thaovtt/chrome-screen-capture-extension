/**
 * Get the full page dimensions for scroll capture.
 */
export function getPageDimensions(): {
  totalHeight: number;
  viewportHeight: number;
  dpr: number;
} {
  const body = document.body;
  const html = document.documentElement;

  const totalHeight = Math.max(
    body.scrollHeight,
    body.offsetHeight,
    html.clientHeight,
    html.scrollHeight,
    html.offsetHeight
  );

  const viewportHeight = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  return { totalHeight, viewportHeight, dpr };
}

/**
 * Scroll the page to a specific Y position instantly.
 */
export function scrollToY(y: number): void {
  window.scrollTo({
    top: y,
    left: 0,
    behavior: 'instant' as ScrollBehavior,
  });
}

/**
 * Detect and temporarily hide fixed/sticky elements during scroll capture
 * to prevent duplicate headers/footers/navbars in stitched screenshots.
 * Returns a restore function to call after capture is complete.
 */
export function hideFixedElements(): () => void {
  const saved = new Map<HTMLElement, string>();

  // Query all elements and check computed style
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    const htmlEl = el as HTMLElement;
    const computed = window.getComputedStyle(htmlEl);
    if (computed.position === 'fixed' || computed.position === 'sticky') {
      saved.set(htmlEl, htmlEl.style.cssText);
      htmlEl.style.setProperty('position', 'relative', 'important');
    }
  }

  // Return a restore function
  return () => {
    saved.forEach((originalStyle, el) => {
      el.style.cssText = originalStyle;
    });
  };
}
