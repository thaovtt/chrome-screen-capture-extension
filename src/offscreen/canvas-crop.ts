import type { CropRect } from '../shared/messages';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image into offscreen canvas'));
    img.src = src;
  });
}

export async function cropImage(dataUrl: string, rect: CropRect, dpr: number): Promise<string> {
  const img = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Scale coordinates to physical device pixels
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sWidth = Math.round(rect.width * dpr);
  const sHeight = Math.round(rect.height * dpr);

  canvas.width = sWidth;
  canvas.height = sHeight;

  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

  const result = canvas.toDataURL('image/png');

  // Memory cleanup per AGENTS.md rule
  canvas.width = 0;
  canvas.height = 0;

  return result;
}

