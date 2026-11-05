export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'CAPTURE_VISIBLE' }
  | { type: 'START_AREA_SELECTION' }
  | { type: 'AREA_SELECTED'; payload: { rect: CropRect; dpr: number } }
  | { type: 'CANCEL_AREA_SELECTION' }
  | { type: 'START_FULL_PAGE' }
  | { type: 'RESTORE_PAGE' }
  | { type: 'FULL_PAGE_PROGRESS'; payload: { current: number; total: number } }
  | { type: 'SCROLL_TO'; payload: { y: number } }
  | { type: 'CROP_IMAGE'; payload: { dataUrl: string; rect: CropRect; dpr: number } }
  | { type: 'STITCH_SLICES'; payload: { slices: string[]; totalHeight: number; viewportHeight: number; dpr: number } }
  | { type: 'OPEN_EDITOR'; payload: { imageDataUrl: string } }
  | {
      type: 'START_RECORDING';
      payload: {
        recordMode: 'tab' | 'desktop';
        includeMic: boolean;
        showWidget?: boolean;
      };
    }
  | { type: 'STOP_RECORDING' }
  | {
      type: 'OFFSCREEN_START_RECORDING';
      payload: {
        streamId: string;
        mediaSource: 'tab' | 'desktop';
        hasAudio: boolean;
        includeMic: boolean;
      };
    }
  | { type: 'OFFSCREEN_STOP_RECORDING' }
  | { type: 'SHOW_RECORDING_WIDGET' }
  | { type: 'HIDE_RECORDING_WIDGET' }
  | { type: 'RECORDING_COMPLETE'; payload: { blobUrl: string } };

export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
