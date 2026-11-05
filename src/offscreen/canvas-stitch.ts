import { loadImage } from './canvas-crop';

export async function stitchSlices(
  slices: string[],
  totalHeight: number,
  viewportHeight: number,
  dpr: number
): Promise<string> {
  if (slices.length === 0) throw new Error('No slices provided to stitch');

  const firstImg = await loadImage(slices[0]);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  const canvasWidth = firstImg.width;
  // Ensure canvas height is at least firstImg.height and accounts for total height
  const canvasHeight = Math.max(firstImg.height, Math.round(totalHeight * dpr));

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  let currentY = 0;

  for (let i = 0; i < slices.length; i++) {
    const img = i === 0 ? firstImg : await loadImage(slices[i]);
    const isLastSlice = i === slices.length - 1;

    if (isLastSlice && currentY + img.height > canvasHeight) {
      // The last slice might overlap because totalHeight is not an exact multiple of viewportHeight
      const remainingHeight = canvasHeight - currentY;
      const sourceY = currentY === 0 ? 0 : Math.max(0, img.height - remainingHeight);

      ctx.drawImage(
        img,
        0,
        sourceY,
        img.width,
        remainingHeight,
        0,
        currentY,
        img.width,
        remainingHeight
      );
    } else {
      ctx.drawImage(img, 0, currentY);
      currentY += Math.round(viewportHeight * dpr);
    }
  }

  const result = canvas.toDataURL('image/png');

  // Memory cleanup per AGENTS.md rule
  canvas.width = 0;
  canvas.height = 0;

  return result;
}
