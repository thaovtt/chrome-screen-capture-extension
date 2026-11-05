import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startRecording, stopRecording } from '../../../src/offscreen/recorder';

describe('Screen Recording Engine', () => {
  let mockDisplayStream: {
    getVideoTracks: ReturnType<typeof vi.fn>;
    getAudioTracks: ReturnType<typeof vi.fn>;
    getTracks: ReturnType<typeof vi.fn>;
  };
  let mockVideoTrack: { stop: ReturnType<typeof vi.fn>; onended: (() => void) | null };
  let mockAudioTrack: { stop: ReturnType<typeof vi.fn> };
  let mockMediaRecorderInstances: any[] = [];

  beforeEach(() => {
    mockMediaRecorderInstances = [];
    mockVideoTrack = { stop: vi.fn(), onended: null };
    mockAudioTrack = { stop: vi.fn() };

    mockDisplayStream = {
      getVideoTracks: vi.fn(() => [mockVideoTrack]),
      getAudioTracks: vi.fn(() => [mockAudioTrack]),
      getTracks: vi.fn(() => [mockVideoTrack, mockAudioTrack]),
    };

    // Mock navigator.mediaDevices.getUserMedia
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockImplementation((constraints) => {
          if (constraints.audio && constraints.audio.mandatory) {
            return Promise.resolve(mockDisplayStream);
          }
          if (constraints.audio === false && constraints.video) {
            return Promise.resolve({
              getVideoTracks: vi.fn(() => [mockVideoTrack]),
              getAudioTracks: vi.fn(() => []),
              getTracks: vi.fn(() => [mockVideoTrack]),
            });
          }
          return Promise.resolve(mockDisplayStream);
        }),
      },
      configurable: true,
      writable: true,
    });

    // Mock MediaRecorder
    class MockMediaRecorder {
      state = 'recording';
      mimeType: string;
      ondataavailable: ((e: any) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;

      constructor(_stream: any, options: { mimeType: string }) {
        this.mimeType = options.mimeType;
        mockMediaRecorderInstances.push(this);
      }

      start = vi.fn();
      stop = vi.fn(() => {
        this.state = 'inactive';
        if (this.onstop) this.onstop();
      });

      static isTypeSupported = vi.fn((type: string) => type.includes('webm'));
    }

    (globalThis as any).MediaRecorder = MockMediaRecorder;
    (globalThis as any).Blob = class MockBlob {
      parts: any[];
      options: any;
      constructor(parts: any[], options: any) {
        this.parts = parts;
        this.options = options;
      }
    };
    (globalThis as any).URL = {
      createObjectURL: vi.fn(() => 'blob:chrome-extension://mock-recording-url'),
    };
  });

  it('starts desktop recording with desktop media source', async () => {
    await startRecording({
      streamId: 'mock-desktop-stream-id',
      mediaSource: 'desktop',
      hasAudio: true,
      includeMic: false,
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          mandatory: expect.objectContaining({
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: 'mock-desktop-stream-id',
          }),
        }),
        video: expect.objectContaining({
          mandatory: expect.objectContaining({
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: 'mock-desktop-stream-id',
          }),
        }),
      })
    );

    expect(mockMediaRecorderInstances.length).toBe(1);
    expect(mockMediaRecorderInstances[0].start).toHaveBeenCalledWith(1000);
  });

  it('starts tab recording with tab media source', async () => {
    await startRecording({
      streamId: 'mock-tab-stream-id',
      mediaSource: 'tab',
      hasAudio: true,
      includeMic: false,
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          mandatory: expect.objectContaining({
            chromeMediaSource: 'tab',
            chromeMediaSourceId: 'mock-tab-stream-id',
          }),
        }),
        video: expect.objectContaining({
          mandatory: expect.objectContaining({
            chromeMediaSource: 'tab',
            chromeMediaSourceId: 'mock-tab-stream-id',
          }),
        }),
      })
    );

    expect(mockMediaRecorderInstances.length).toBe(1);
  });

  it('stops recording and notifies background with RECORDING_COMPLETE', async () => {
    await startRecording({
      streamId: 'mock-id',
      mediaSource: 'desktop',
      hasAudio: false,
      includeMic: false,
    });
    stopRecording();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RECORDING_COMPLETE',
        payload: { blobUrl: 'blob:chrome-extension://mock-recording-url' },
      })
    );
  });

  it('automatically stops recording when Chrome native stop sharing is clicked (track.onended)', async () => {
    await startRecording({
      streamId: 'mock-id',
      mediaSource: 'desktop',
      hasAudio: false,
      includeMic: false,
    });

    // Simulate Chrome native "Stop sharing" action
    expect(mockVideoTrack.onended).toBeDefined();
    mockVideoTrack.onended!();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RECORDING_COMPLETE',
      })
    );
  });
});
