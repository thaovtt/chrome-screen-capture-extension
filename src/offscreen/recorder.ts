/**
 * Screen/Tab recording engine for the offscreen document.
 * Handles MediaRecorder lifecycle, WebAudio track mixing, and data chunk management.
 *
 * MV3 Requirement: MediaRecorder and getUserMedia require a DOM context,
 * which is why this runs in the offscreen document (service workers have no DOM).
 */

interface RecordingState {
  mediaRecorder: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  audioContext: AudioContext | null;
}

const state: RecordingState = {
  mediaRecorder: null,
  stream: null,
  chunks: [],
  audioContext: null,
};

/**
 * Start recording a display or tab stream.
 *
 * @param options.streamId - Stream ID from chrome.tabCapture or chrome.desktopCapture
 * @param options.mediaSource - 'tab' for tab capture, 'desktop' for screen/window capture
 * @param options.hasAudio - whether the stream supports/includes an audio track
 * @param options.includeMic - Whether to mix microphone audio into the recording
 */
export async function startRecording(options: {
  streamId: string;
  mediaSource: 'tab' | 'desktop';
  hasAudio: boolean;
  includeMic: boolean;
}): Promise<void> {
  // Cleanup any previous recording session
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
  cleanup();

  // Structure constraints precisely on first try so streamId is never reused/burned
  const constraints: MediaStreamConstraints = {
    audio: options.hasAudio
      ? ({
          mandatory: {
            chromeMediaSource: options.mediaSource,
            chromeMediaSourceId: options.streamId,
          },
        } as MediaTrackConstraints)
      : false,
    video: {
      mandatory: {
        chromeMediaSource: options.mediaSource,
        chromeMediaSourceId: options.streamId,
      },
    } as MediaTrackConstraints,
  };

  const displayStream = await navigator.mediaDevices.getUserMedia(constraints);

  let combinedStream = displayStream;

  // Mix microphone if requested
  if (options.includeMic) {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      combinedStream = mixAudioStreams(displayStream, micStream);
    } catch (err) {
      console.warn('[Recorder] Microphone access denied or unavailable, recording without mic:', err);
    }
  }

  // Hook track.onended for Chrome's native stop sharing floating UI
  displayStream.getVideoTracks().forEach((track) => {
    track.onended = () => {
      console.log('[Recorder] Video track ended by user via Chrome native UI');
      stopRecording();
    };
  });

  state.stream = combinedStream;
  state.chunks = [];

  const hasAudioTrack = combinedStream.getAudioTracks().length > 0;
  const mimeType = getSupportedMimeType(hasAudioTrack);
  console.log('[Recorder] Selected MIME type:', mimeType, 'hasAudioTrack:', hasAudioTrack);

  state.mediaRecorder = new MediaRecorder(combinedStream, { mimeType });

  state.mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      state.chunks.push(event.data);
    }
  };

  state.mediaRecorder.onstop = () => {
    console.log('[Recorder] MediaRecorder stopped. Assembling chunks:', state.chunks.length);
    const blob = new Blob(state.chunks, { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    // Notify the background service worker that recording is complete
    chrome.runtime.sendMessage({
      type: 'RECORDING_COMPLETE',
      payload: { blobUrl },
    });

    cleanup();
  };

  state.mediaRecorder.onerror = (event: Event) => {
    console.error('[Recorder] MediaRecorder error:', event);
    cleanup();
  };

  // Record in 1-second chunks to prevent memory bloat during long recordings
  state.mediaRecorder.start(1000);
  console.log('[Recorder] Recording successfully started');
}

/**
 * Stop the current recording. The onstop handler will fire RECORDING_COMPLETE.
 */
export function stopRecording(): void {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
    console.log('[Recorder] Recording stopped');
  }
}

/**
 * Mix display audio and microphone audio into a single stream
 * using Web Audio API's createMediaStreamDestination().
 */
function mixAudioStreams(
  displayStream: MediaStream,
  micStream: MediaStream
): MediaStream {
  try {
    const ctx = new AudioContext();
    state.audioContext = ctx;
    const dest = ctx.createMediaStreamDestination();

    // Mix display audio tracks (tab/system audio) if present
    if (displayStream.getAudioTracks().length > 0) {
      const displaySource = ctx.createMediaStreamSource(
        new MediaStream(displayStream.getAudioTracks())
      );
      displaySource.connect(dest);
    }

    // Mix microphone audio tracks
    if (micStream.getAudioTracks().length > 0) {
      const micSource = ctx.createMediaStreamSource(micStream);
      micSource.connect(dest);
    }

    // Combine: video tracks from display + mixed audio from destination
    return new MediaStream([
      ...displayStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
  } catch (err) {
    console.warn('[Recorder] Failed to mix audio with WebAudio, falling back to display audio:', err);
    return displayStream;
  }
}

/**
 * Determine the best supported recording MIME type.
 * Prefer VP9 + Opus for quality, fall back to VP8 or basic WebM.
 */
function getSupportedMimeType(hasAudio: boolean): string {
  const preferredWithAudio = [
    'video/webm; codecs=vp9,opus',
    'video/webm; codecs=vp8,opus',
    'video/webm; codecs=vp9',
    'video/webm; codecs=vp8',
    'video/webm',
  ];
  const preferredVideoOnly = [
    'video/webm; codecs=vp9',
    'video/webm; codecs=vp8',
    'video/webm',
  ];

  const candidateList = hasAudio ? preferredWithAudio : preferredVideoOnly;

  for (const type of candidateList) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'video/webm';
}

/**
 * Clean up all recording resources: stop tracks, close audio context, clear chunks.
 */
function cleanup(): void {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
  }
  if (state.audioContext && state.audioContext.state !== 'closed') {
    state.audioContext.close().catch(() => { /* ignore */ });
  }
  state.stream = null;
  state.mediaRecorder = null;
  state.audioContext = null;
  state.chunks = [];
}
