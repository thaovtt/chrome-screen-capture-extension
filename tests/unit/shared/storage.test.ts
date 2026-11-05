import { describe, it, expect } from 'vitest';
import {
  getSettings,
  saveSettings,
  setSessionState,
  getSessionState,
  DEFAULT_SETTINGS,
} from '../../../src/shared/storage';

describe('Storage Helpers', () => {
  it('returns default settings if none saved', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('saves and merges partial settings', async () => {
    await saveSettings({ imageFormat: 'jpeg', imageQuality: 0.8, showRecordingWidget: true });
    const settings = await getSettings();
    expect(settings.imageFormat).toBe('jpeg');
    expect(settings.imageQuality).toBe(0.8);
    expect(settings.showRecordingWidget).toBe(true);
    expect(settings.autoOpenEditor).toBe(DEFAULT_SETTINGS.autoOpenEditor);
  });

  it('handles session state storage and retrieval', async () => {
    await setSessionState('isRecording', true);
    const state = await getSessionState<boolean>('isRecording');
    expect(state).toBe(true);
  });
});

