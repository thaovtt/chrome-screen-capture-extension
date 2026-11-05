export interface ExtensionSettings {
  imageFormat: 'png' | 'jpeg';
  imageQuality: number;
  autoOpenEditor: boolean;
  saveToClipboard: boolean;
  showRecordingWidget: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  imageFormat: 'png',
  imageQuality: 0.95,
  autoOpenEditor: true,
  saveToClipboard: false,
  showRecordingWidget: false,
};

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.sync.set({ settings: { ...current, ...settings } });
}

export async function setSessionState<T>(key: string, value: T): Promise<void> {
  if (chrome.storage.session) {
    await chrome.storage.session.set({ [key]: value });
  } else {
    await chrome.storage.local.set({ [key]: value });
  }
}

export async function getSessionState<T>(key: string): Promise<T | null> {
  if (chrome.storage.session) {
    const res = await chrome.storage.session.get(key);
    return (res[key] as T) ?? null;
  }
  const res = await chrome.storage.local.get(key);
  return (res[key] as T) ?? null;
}
