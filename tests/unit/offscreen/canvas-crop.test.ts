import { describe, it, expect } from 'vitest';
import { scaleToDPR } from '../../../src/shared/utils';
import type { CropRect } from '../../../src/shared/messages';

describe('Canvas Cropping Math & DPR Calculations', () => {
  it('correctly calculates Retina DPR physical pixel coordinates', () => {
    const rect: CropRect = {
      x: 50,
      y: 75,
      width: 400,
      height: 300,
    };
    const dpr = 2; // Retina display

    const physicalX = scaleToDPR(rect.x, dpr);
    const physicalY = scaleToDPR(rect.y, dpr);
    const physicalWidth = scaleToDPR(rect.width, dpr);
    const physicalHeight = scaleToDPR(rect.height, dpr);

    expect(physicalX).toBe(100);
    expect(physicalY).toBe(150);
    expect(physicalWidth).toBe(800);
    expect(physicalHeight).toBe(600);
  });

  it('handles fractional device pixel ratios without coordinate drift', () => {
    const rect: CropRect = {
      x: 10,
      y: 20,
      width: 133,
      height: 87,
    };
    const dpr = 1.25;

    expect(scaleToDPR(rect.x, dpr)).toBe(13);
    expect(scaleToDPR(rect.y, dpr)).toBe(25);
    expect(scaleToDPR(rect.width, dpr)).toBe(166);
    expect(scaleToDPR(rect.height, dpr)).toBe(109);
  });
});

