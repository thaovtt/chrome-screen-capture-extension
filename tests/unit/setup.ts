import { vi } from 'vitest';

// Mock chrome extension APIs for unit tests
const mockLocalStorage: Record<string, unknown> = {};
const mockSyncStorage: Record<string, unknown> = {};
const mockSessionStorage: Record<string, unknown> = {};

(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
    getManifest: vi.fn(() => ({
      content_scripts: [
        {
          js: ['assets/src-content-index.js'],
          matches: ['<all_urls>'],
        },
      ],
    })),
  },
  scripting: {
    executeScript: vi.fn(() => Promise.resolve([{ result: null }])),
  },
  storage: {
    local: {
      get: vi.fn((key: string | string[]) => {
        if (typeof key === 'string') {
          return Promise.resolve({ [key]: mockLocalStorage[key] });
        }
        const result: Record<string, unknown> = {};
        for (const k of key) {
          result[k] = mockLocalStorage[k];
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockLocalStorage, items);
        return Promise.resolve();
      }),
    },
    sync: {
      get: vi.fn((key: string | string[]) => {
        if (typeof key === 'string') {
          return Promise.resolve({ [key]: mockSyncStorage[key] });
        }
        const result: Record<string, unknown> = {};
        for (const k of key) {
          result[k] = mockSyncStorage[k];
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockSyncStorage, items);
        return Promise.resolve();
      }),
    },
    session: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: mockSessionStorage[key] })),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockSessionStorage, items);
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  desktopCapture: {
    chooseDesktopMedia: vi.fn((_sources, _tab, cb) => {
      cb('mock-stream-id');
      return 123;
    }),
    cancelChooseDesktopMedia: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    captureVisibleTab: vi.fn(),
    create: vi.fn(),
  },
  downloads: {
    download: vi.fn(),
  },
};

