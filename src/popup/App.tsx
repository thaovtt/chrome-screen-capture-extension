import React, { useState, useEffect } from 'react';
import {
  Camera,
  Crop,
  Layers,
  Video,
  Monitor,
  Mic,
  MicOff,
  Settings as SettingsIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Square,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { ExtensionMessage, ExtensionResponse } from '../shared/messages';
import { getSettings, saveSettings, getSessionState, type ExtensionSettings } from '../shared/storage';

export const App: React.FC = () => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettingsState] = useState<ExtensionSettings | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [includeMic, setIncludeMic] = useState(false);
  const [showFloatingWidget, setShowFloatingWidget] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setSettingsState(s);
      setShowFloatingWidget(s.showRecordingWidget);
    });
    // Check if there is already an active recording session
    getSessionState<boolean>('isRecording').then((recording) => {
      if (recording) setIsRecording(true);
    });

    // Listen for storage changes to sync recording state dynamically
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if ((areaName === 'session' || areaName === 'local') && changes.isRecording) {
        setIsRecording(Boolean(changes.isRecording.newValue));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleCapture = async (
    type: 'CAPTURE_VISIBLE' | 'START_AREA_SELECTION' | 'START_FULL_PAGE',
    label: string
  ) => {
    setLoadingAction(label);
    setStatusMessage(null);

    try {
      if (type === 'START_AREA_SELECTION') {
        const response = await chrome.runtime.sendMessage<ExtensionMessage, ExtensionResponse>({
          type: 'START_AREA_SELECTION',
        });
        if (!response?.success) {
          throw new Error(response?.error || 'Failed to start area selection');
        }
        window.close();
        return;
      }

      const message: ExtensionMessage =
        type === 'CAPTURE_VISIBLE'
          ? { type: 'CAPTURE_VISIBLE' }
          : { type: 'START_FULL_PAGE' };

      const response = await chrome.runtime.sendMessage<
        ExtensionMessage,
        ExtensionResponse<{ dataUrl?: string } | null>
      >(message);

      if (!response?.success) {
        throw new Error(response?.error || 'Capture failed');
      }

      setStatusMessage({ text: `${label} captured!` });
      setTimeout(() => window.close(), 1200);
    } catch (err: unknown) {
      const error = err as Error;
      setStatusMessage({ text: error.message || 'Operation failed', isError: true });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStartRecording = async (recordMode: 'tab' | 'desktop', label: string) => {
    setLoadingAction(label);
    setStatusMessage(null);

    try {
      const response = await chrome.runtime.sendMessage<ExtensionMessage, ExtensionResponse>({
        type: 'START_RECORDING',
        payload: { recordMode, includeMic, showWidget: showFloatingWidget },
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to start recording');
      }

      setIsRecording(true);
      setStatusMessage({ text: 'Recording started!' });
      setTimeout(() => window.close(), 800);
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message?.includes('cancelled')) {
        setStatusMessage(null);
      } else {
        setStatusMessage({ text: error.message || 'Recording failed', isError: true });
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStopRecording = async () => {
    setLoadingAction('Stopping');
    try {
      const response = await chrome.runtime.sendMessage<ExtensionMessage, ExtensionResponse>({
        type: 'STOP_RECORDING',
      });
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to stop recording');
      }
      setIsRecording(false);
      setStatusMessage({ text: 'Recording saved!' });
      setTimeout(() => window.close(), 1200);
    } catch (err: unknown) {
      const error = err as Error;
      setStatusMessage({ text: error.message || 'Failed to stop recording', isError: true });
    } finally {
      setLoadingAction(null);
    }
  };

  const updateSetting = async <K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettingsState(updated);
    await saveSettings({ [key]: value });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <Camera className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-white">Screen Capture</span>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-1.5 rounded-md transition-colors ${
            showSettings
              ? 'bg-slate-700 text-blue-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Notifications */}
      {statusMessage && (
        <div
          className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md ${
            statusMessage.isError
              ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40'
              : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
          }`}
        >
          {statusMessage.isError ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span className="truncate">{statusMessage.text}</span>
        </div>
      )}

      {/* Settings View */}
      {showSettings && settings ? (
        <div className="flex flex-col gap-3 py-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Image Format</span>
            <select
              value={settings.imageFormat}
              onChange={(e) => updateSetting('imageFormat', e.target.value as 'png' | 'jpeg')}
              className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-1 outline-none focus:border-blue-500"
            >
              <option value="png">PNG (Lossless)</option>
              <option value="jpeg">JPEG</option>
            </select>
          </div>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-slate-300">Open in Editor after capture</span>
            <input
              type="checkbox"
              checked={settings.autoOpenEditor}
              onChange={(e) => updateSetting('autoOpenEditor', e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-slate-300">Show on-screen widget</span>
              <p className="text-[10px] text-slate-500">Show floating controller on page during recording</p>
            </div>
            <input
              type="checkbox"
              checked={settings.showRecordingWidget}
              onChange={(e) => {
                updateSetting('showRecordingWidget', e.target.checked);
                setShowFloatingWidget(e.target.checked);
              }}
              className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
            />
          </label>
        </div>
      ) : (
        /* Action Buttons */
        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleCapture('CAPTURE_VISIBLE', 'Visible Area')}
            disabled={!!loadingAction || isRecording}
            className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-750 hover:bg-slate-700 border border-slate-700/50 text-slate-100 transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-2.5">
              <Camera className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium">Capture Visible Area</span>
            </div>
            {loadingAction === 'Visible Area' && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
          </button>

          <button
            onClick={() => handleCapture('START_AREA_SELECTION', 'Selected Area')}
            disabled={!!loadingAction || isRecording}
            className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 text-slate-100 transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-2.5">
              <Crop className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium">Capture Selected Area</span>
            </div>
          </button>

          <button
            onClick={() => handleCapture('START_FULL_PAGE', 'Full Page')}
            disabled={!!loadingAction || isRecording}
            className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 text-slate-100 transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium">Capture Full Page</span>
            </div>
            {loadingAction === 'Full Page' && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />}
          </button>

          {/* Screen / Video Recording Section */}
          <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-slate-400">Video Recording</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIncludeMic(!includeMic)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors ${
                    includeMic
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                  title={includeMic ? 'Microphone audio included' : 'No microphone audio'}
                >
                  {includeMic ? <Mic className="w-3 h-3 text-blue-400" /> : <MicOff className="w-3 h-3" />}
                  {includeMic ? 'Mic' : 'No Mic'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowFloatingWidget(!showFloatingWidget)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors ${
                    showFloatingWidget
                      ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                  title={
                    showFloatingWidget
                      ? 'Floating controller visible on tab (can be hidden or closed)'
                      : 'Clean Video: Floating bar excluded from recorded tab'
                  }
                >
                  {showFloatingWidget ? <Eye className="w-3 h-3 text-purple-400" /> : <EyeOff className="w-3 h-3" />}
                  {showFloatingWidget ? 'Bar On' : 'Clean Video'}
                </button>
              </div>
            </div>

            {isRecording ? (
              <button
                onClick={handleStopRecording}
                disabled={loadingAction === 'Stopping'}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-md shadow-rose-900/30 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Recording & Save</span>
                </div>
                <span className="flex items-center gap-1.5 bg-rose-700 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  REC
                </span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleStartRecording('tab', 'Tab Record')}
                  disabled={!!loadingAction}
                  className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-200 transition-all group disabled:opacity-50"
                  title="Capture current browser tab with audio"
                >
                  <Video className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[11px] font-medium">Record Tab</span>
                </button>

                <button
                  onClick={() => handleStartRecording('desktop', 'Screen Record')}
                  disabled={!!loadingAction}
                  className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-200 transition-all group disabled:opacity-50"
                  title="Capture entire screen or application window"
                >
                  <Monitor className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[11px] font-medium">Record Screen</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-1">
        <span className="text-[10px] text-slate-500 font-medium">Manifest V3 • Client-side only</span>
      </div>
    </div>
  );
};
