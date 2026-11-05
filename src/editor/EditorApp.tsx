import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  MousePointer,
  ArrowUpRight,
  Square,
  Pen,
  Type,
  EyeOff,
  Crop as CropIcon,
  Undo2,
  Redo2,
  Copy,
  Download,
  Check,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  CheckCheck,
  X,
} from 'lucide-react';
import { copyImageToClipboard, downloadDataUrl, formatTimestamp } from '../shared/utils';

type Tool = 'select' | 'arrow' | 'rect' | 'pen' | 'text' | 'blur' | 'crop';

interface AnnotationItem {
  id: string;
  type: Tool;
  color: string;
  lineWidth: number;
  points?: { x: number; y: number }[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  text?: string;
}

interface HistoryState {
  annotations: AnnotationItem[];
  imageSrc?: string;
}

interface RectBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const EditorApp: React.FC = () => {
  const [activeTool, setActiveTool] = useState<Tool>('arrow');
  const [color, setColor] = useState<string>('#ef4444');
  const [lineWidth, setLineWidth] = useState<number>(4);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');

  // Annotation and History state
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

  // Crop region state
  const [cropRegion, setCropRegion] = useState<RectBounds | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const isDraggingItemRef = useRef<boolean>(false);
  const isDraggingCropRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentItemRef = useRef<AnnotationItem | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    const loadImage = async () => {
      let url: string | null = null;
      if (id) {
        const res = await chrome.storage.local.get(id);
        url = res[id];
      }
      if (!url) {
        const latest = await chrome.storage.local.get('latestCaptureId');
        if (latest.latestCaptureId) {
          const res = await chrome.storage.local.get(latest.latestCaptureId);
          url = res[latest.latestCaptureId];
        }
      }

      if (url) {
        setImageDataUrl(url);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          bgImageRef.current = img;
          renderCanvas();
        };
        img.src = url;
      }
    };

    loadImage();
  }, []);

  const getAnnotationBounds = (item: AnnotationItem): RectBounds | null => {
    const pad = Math.max(item.lineWidth, 6);
    if (item.type === 'rect' || item.type === 'blur') {
      if (!item.start || !item.end) return null;
      const x = Math.min(item.start.x, item.end.x);
      const y = Math.min(item.start.y, item.end.y);
      const w = Math.abs(item.end.x - item.start.x);
      const h = Math.abs(item.end.y - item.start.y);
      return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
    }
    if (item.type === 'arrow') {
      if (!item.start || !item.end) return null;
      const x = Math.min(item.start.x, item.end.x);
      const y = Math.min(item.start.y, item.end.y);
      const w = Math.max(Math.abs(item.end.x - item.start.x), pad * 2);
      const h = Math.max(Math.abs(item.end.y - item.start.y), pad * 2);
      return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
    }
    if (item.type === 'pen') {
      if (!item.points || item.points.length === 0) return null;
      let minX = item.points[0].x;
      let maxX = item.points[0].x;
      let minY = item.points[0].y;
      let maxY = item.points[0].y;
      for (const p of item.points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      return {
        x: minX - pad,
        y: minY - pad,
        w: maxX - minX + pad * 2,
        h: maxY - minY + pad * 2,
      };
    }
    if (item.type === 'text') {
      if (!item.start || !item.text) return null;
      const fontSize = Math.max(16, item.lineWidth * 4);
      const estWidth = item.text.length * fontSize * 0.65;
      return {
        x: item.start.x - 4,
        y: item.start.y - fontSize - 2,
        w: estWidth + 8,
        h: fontSize + 8,
      };
    }
    return null;
  };

  const hitTest = (x: number, y: number): AnnotationItem | null => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const item = annotations[i];
      const bounds = getAnnotationBounds(item);
      if (
        bounds &&
        x >= bounds.x &&
        x <= bounds.x + bounds.w &&
        y >= bounds.y &&
        y <= bounds.y + bounds.h
      ) {
        return item;
      }
    }
    return null;
  };

  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    width: number
  ) => {
    const dist = Math.hypot(toX - fromX, toY - fromY);
    if (dist < 3) return;

    const angle = Math.atan2(toY - fromY, toX - fromX);
    // Scale head length gracefully for short arrows
    const headLen = Math.min(Math.max(16, width * 3.5), dist * 0.75);
    const arrowAngle = Math.PI / 6; // 30 degrees

    // Stop the shaft line inside the arrowhead so its rounded lineCap is fully concealed
    // The base of the triangle is at ~0.866 * headLen back from the tip.
    // Stopping at 0.55 * headLen places the stroke cap securely inside the filled arrowhead.
    const shaftEndX = toX - headLen * 0.55 * Math.cos(angle);
    const shaftEndY = toY - headLen * 0.55 * Math.sin(angle);

    // 1. Draw shaft line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();

    // 2. Draw solid arrowhead with sharp tip
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle - arrowAngle),
      toY - headLen * Math.sin(angle - arrowAngle)
    );
    ctx.lineTo(
      toX - headLen * Math.cos(angle + arrowAngle),
      toY - headLen * Math.sin(angle + arrowAngle)
    );
    ctx.closePath();
    ctx.fill();
  };

  const applyPixelate = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    const sampleSize = 10;
    try {
      const imgData = ctx.getImageData(x, y, w, h);
      ctx.save();
      for (let py = 0; py < h; py += sampleSize) {
        for (let px = 0; px < w; px += sampleSize) {
          const pixelIndex = (py * w + px) * 4;
          const r = imgData.data[pixelIndex];
          const g = imgData.data[pixelIndex + 1];
          const b = imgData.data[pixelIndex + 2];
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x + px, y + py, sampleSize, sampleSize);
        }
      }
      ctx.restore();
    } catch {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x, y, w, h);
    }
  };

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = bgImageRef.current;
    if (!canvas || !img) return;

    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const itemsToDraw = currentItemRef.current
      ? [...annotations, currentItemRef.current]
      : annotations;

    for (const item of itemsToDraw) {
      ctx.save();
      ctx.strokeStyle = item.color;
      ctx.fillStyle = item.color;
      ctx.lineWidth = item.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (item.type === 'arrow' && item.start && item.end) {
        drawArrow(ctx, item.start.x, item.start.y, item.end.x, item.end.y, item.lineWidth);
      } else if (item.type === 'rect' && item.start && item.end) {
        const x = Math.min(item.start.x, item.end.x);
        const y = Math.min(item.start.y, item.end.y);
        const w = Math.abs(item.end.x - item.start.x);
        const h = Math.abs(item.end.y - item.start.y);
        ctx.strokeRect(x, y, w, h);
      } else if (item.type === 'pen' && item.points && item.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i++) {
          ctx.lineTo(item.points[i].x, item.points[i].y);
        }
        ctx.stroke();
      } else if (item.type === 'blur' && item.start && item.end) {
        const x = Math.min(item.start.x, item.end.x);
        const y = Math.min(item.start.y, item.end.y);
        const w = Math.abs(item.end.x - item.start.x);
        const h = Math.abs(item.end.y - item.start.y);
        if (w > 2 && h > 2) {
          applyPixelate(ctx, x, y, w, h);
        }
      } else if (item.type === 'text' && item.start && item.text) {
        ctx.font = `bold ${Math.max(16, item.lineWidth * 4)}px sans-serif`;
        ctx.fillText(item.text, item.start.x, item.start.y);
      }

      ctx.restore();

      // Render selection outline if selected
      if (selectedId === item.id) {
        const bounds = getAnnotationBounds(item);
        if (bounds) {
          ctx.save();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
          ctx.restore();
        }
      }
    }

    // Render Crop Overlay if in crop mode or cropRegion is present
    if (cropRegion && cropRegion.w > 0 && cropRegion.h > 0) {
      ctx.save();
      // Dark dimmed backdrop outside crop region
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      // Outer rect
      ctx.rect(0, 0, canvas.width, canvas.height);
      // Cut out inner crop rect
      ctx.rect(cropRegion.x + cropRegion.w, cropRegion.y, -cropRegion.w, cropRegion.h);
      ctx.fill();

      // Crop box border
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(cropRegion.x, cropRegion.y, cropRegion.w, cropRegion.h);

      // Corner handles
      ctx.fillStyle = '#ffffff';
      ctx.setLineDash([]);
      const handleSize = 7;
      const corners = [
        { x: cropRegion.x, y: cropRegion.y },
        { x: cropRegion.x + cropRegion.w, y: cropRegion.y },
        { x: cropRegion.x, y: cropRegion.y + cropRegion.h },
        { x: cropRegion.x + cropRegion.w, y: cropRegion.y + cropRegion.h },
      ];
      for (const c of corners) {
        ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
      }
      ctx.restore();
    }
  }, [annotations, selectedId, cropRegion]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e);

    if (activeTool === 'select') {
      const hit = hitTest(coords.x, coords.y);
      if (hit) {
        setSelectedId(hit.id);
        isDraggingItemRef.current = true;
        dragStartRef.current = coords;
      } else {
        setSelectedId(null);
      }
      return;
    }

    if (activeTool === 'crop') {
      isDraggingCropRef.current = true;
      dragStartRef.current = coords;
      setCropRegion({ x: coords.x, y: coords.y, w: 0, h: 0 });
      return;
    }

    if (activeTool === 'text') {
      const text = prompt('Enter annotation text:');
      if (text) {
        const newItem: AnnotationItem = {
          id: Date.now().toString(),
          type: 'text',
          color,
          lineWidth,
          start: coords,
          text,
        };
        saveAnnotation(newItem);
      }
      return;
    }

    isDrawingRef.current = true;
    currentItemRef.current = {
      id: Date.now().toString(),
      type: activeTool,
      color,
      lineWidth,
      start: coords,
      end: coords,
      points: [coords],
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e);

    if (isDraggingItemRef.current && selectedId && dragStartRef.current) {
      const dx = coords.x - dragStartRef.current.x;
      const dy = coords.y - dragStartRef.current.y;
      dragStartRef.current = coords;

      setAnnotations((prev) =>
        prev.map((item) => {
          if (item.id !== selectedId) return item;
          const updated = { ...item };
          if (updated.start) {
            updated.start = { x: updated.start.x + dx, y: updated.start.y + dy };
          }
          if (updated.end) {
            updated.end = { x: updated.end.x + dx, y: updated.end.y + dy };
          }
          if (updated.points) {
            updated.points = updated.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
          }
          return updated;
        })
      );
      return;
    }

    if (isDraggingCropRef.current && dragStartRef.current) {
      const startX = dragStartRef.current.x;
      const startY = dragStartRef.current.y;
      const x = Math.min(startX, coords.x);
      const y = Math.min(startY, coords.y);
      const w = Math.abs(coords.x - startX);
      const h = Math.abs(coords.y - startY);
      setCropRegion({ x, y, w, h });
      return;
    }

    if (!isDrawingRef.current || !currentItemRef.current) return;

    if (activeTool === 'pen') {
      currentItemRef.current.points?.push(coords);
    } else {
      currentItemRef.current.end = coords;
    }

    renderCanvas();
  };

  const handleMouseUp = () => {
    if (isDraggingItemRef.current) {
      isDraggingItemRef.current = false;
      dragStartRef.current = null;
      // Record undo state after move
      setUndoStack((prev) => [
        ...prev,
        { annotations, imageSrc: bgImageRef.current?.src },
      ]);
      setRedoStack([]);
      return;
    }

    if (isDraggingCropRef.current) {
      isDraggingCropRef.current = false;
      dragStartRef.current = null;
      return;
    }

    if (!isDrawingRef.current || !currentItemRef.current) return;
    isDrawingRef.current = false;
    const item = currentItemRef.current;
    currentItemRef.current = null;

    // Discard zero-length or accidental micro-clicks (< 4px)
    if (
      (item.type === 'arrow' || item.type === 'rect' || item.type === 'blur') &&
      item.start &&
      item.end &&
      Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y) < 4
    ) {
      renderCanvas();
      return;
    }
    if (item.type === 'pen' && (!item.points || item.points.length < 2)) {
      renderCanvas();
      return;
    }

    saveAnnotation(item);
  };

  const saveAnnotation = (item: AnnotationItem) => {
    setUndoStack((prev) => [
      ...prev,
      { annotations, imageSrc: bgImageRef.current?.src },
    ]);
    setRedoStack([]);
    setAnnotations((prev) => [...prev, item]);
  };

  const handleApplyCrop = () => {
    if (!cropRegion || cropRegion.w < 5 || cropRegion.h < 5 || !canvasRef.current || !bgImageRef.current) {
      setCropRegion(null);
      return;
    }

    const canvas = canvasRef.current;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropRegion.w;
    tempCanvas.height = cropRegion.h;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Draw the cropped portion
    tempCtx.drawImage(
      canvas,
      cropRegion.x,
      cropRegion.y,
      cropRegion.w,
      cropRegion.h,
      0,
      0,
      cropRegion.w,
      cropRegion.h
    );

    const croppedDataUrl = tempCanvas.toDataURL('image/png');

    // Save previous state for undo
    setUndoStack((prev) => [
      ...prev,
      { annotations, imageSrc: bgImageRef.current?.src },
    ]);
    setRedoStack([]);

    const newImg = new Image();
    newImg.crossOrigin = 'anonymous';
    newImg.onload = () => {
      bgImageRef.current = newImg;
      setImageDataUrl(croppedDataUrl);
      setAnnotations([]); // Clear annotations as coordinates shifted
      setCropRegion(null);
      setActiveTool('select');
      renderCanvas();
    };
    newImg.src = croppedDataUrl;
  };

  const handleCancelCrop = () => {
    setCropRegion(null);
    setActiveTool('select');
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [
      ...prev,
      { annotations, imageSrc: bgImageRef.current?.src },
    ]);

    // Check if image changed in undo
    if (previous.imageSrc && previous.imageSrc !== bgImageRef.current?.src) {
      const restoredImg = new Image();
      restoredImg.crossOrigin = 'anonymous';
      restoredImg.onload = () => {
        bgImageRef.current = restoredImg;
        setImageDataUrl(previous.imageSrc!);
        setAnnotations(previous.annotations);
        setCropRegion(null);
        setSelectedId(null);
        renderCanvas();
      };
      restoredImg.src = previous.imageSrc;
    } else {
      setAnnotations(previous.annotations);
      setCropRegion(null);
      setSelectedId(null);
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [
      ...prev,
      { annotations, imageSrc: bgImageRef.current?.src },
    ]);

    if (next.imageSrc && next.imageSrc !== bgImageRef.current?.src) {
      const restoredImg = new Image();
      restoredImg.crossOrigin = 'anonymous';
      restoredImg.onload = () => {
        bgImageRef.current = restoredImg;
        setImageDataUrl(next.imageSrc!);
        setAnnotations(next.annotations);
        setCropRegion(null);
        setSelectedId(null);
        renderCanvas();
      };
      restoredImg.src = next.imageSrc;
    } else {
      setAnnotations(next.annotations);
      setCropRegion(null);
      setSelectedId(null);
    }
  };

  const handleCopy = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const success = await copyImageToClipboard(canvas.toDataURL('image/png'));
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Temporary re-render without selection border or crop box for clean output
    const prevSelected = selectedId;
    const prevCrop = cropRegion;
    setSelectedId(null);
    setCropRegion(null);

    // Timeout ensures clean render pass before exporting dataUrl
    setTimeout(() => {
      const mime = exportFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
      const ext = exportFormat === 'jpeg' ? 'jpg' : 'png';
      const quality = exportFormat === 'jpeg' ? 0.92 : undefined;
      const url = canvas.toDataURL(mime, quality);
      downloadDataUrl(url, `capture_${formatTimestamp()}.${ext}`);

      // Restore UI state
      setSelectedId(prevSelected);
      setCropRegion(prevCrop);
    }, 50);
  };

  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#000000'];

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 select-none">
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-1.5">
          <div className="text-sm font-semibold text-white tracking-wide mr-3 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            Annotation Editor
          </div>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          <button
            onClick={() => {
              setActiveTool('select');
              setCropRegion(null);
            }}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === 'select' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Select & Move Annotations"
          >
            <MousePointer className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setActiveTool('arrow');
              setCropRegion(null);
              setSelectedId(null);
            }}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === 'arrow' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Arrow"
          >
            <ArrowUpRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setActiveTool('rect');
              setCropRegion(null);
              setSelectedId(null);
            }}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === 'rect' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Rectangle"
          >
            <Square className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setActiveTool('pen');
              setCropRegion(null);
              setSelectedId(null);
            }}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === 'pen' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Freehand Pen"
          >
            <Pen className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setActiveTool('text');
              setCropRegion(null);
              setSelectedId(null);
            }}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === 'text' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Text"
          >
            <Type className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setActiveTool('blur');
              setCropRegion(null);
              setSelectedId(null);
            }}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === 'blur' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Blur / Redact Sensitive Info"
          >
            <EyeOff className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setActiveTool('crop');
              setSelectedId(null);
            }}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === 'crop' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Crop Image"
          >
            <CropIcon className="w-4 h-4" />
          </button>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          {/* Color palette */}
          <div className="flex items-center gap-1">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                  color === c ? 'scale-110 border-white shadow-sm' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          {/* Line width */}
          <select
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="bg-slate-800 text-slate-300 text-xs rounded px-2 py-1 border border-slate-700 outline-none"
          >
            <option value={2}>2px</option>
            <option value={4}>4px</option>
            <option value={6}>6px</option>
            <option value={10}>10px</option>
          </select>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-800"
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-800"
            title="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 mr-2 text-xs">
            <button
              onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}
              className="p-1.5 text-slate-400 hover:text-white rounded"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-slate-300">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
              className="p-1.5 text-slate-400 hover:text-white rounded"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 text-slate-400 hover:text-white rounded ml-1"
              title="Reset Zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>

          {/* Export format dropdown */}
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'png' | 'jpeg')}
            className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none"
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm shadow-blue-500/20"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </header>

      <main
        ref={containerRef}
        className="flex-1 overflow-auto bg-slate-950 p-6 flex items-center justify-center relative"
      >
        {!imageDataUrl ? (
          <div className="flex flex-col items-center justify-center text-slate-500 gap-2">
            <AlertCircle className="w-8 h-8" />
            <p className="text-sm">No screenshot loaded. Trigger a capture from the extension popup.</p>
          </div>
        ) : (
          <div className="relative">
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
                transition: 'transform 0.1s ease-out',
              }}
              className="shadow-2xl shadow-black/80 rounded-sm overflow-hidden"
            >
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className={`block max-w-none ${
                  activeTool === 'select'
                    ? 'cursor-move'
                    : activeTool === 'crop'
                    ? 'cursor-crosshair'
                    : 'cursor-crosshair'
                }`}
              />
            </div>

            {/* Floating crop action buttons */}
            {cropRegion && cropRegion.w > 20 && cropRegion.h > 20 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl px-3 py-2 flex items-center gap-2 shadow-2xl z-30">
                <span className="text-xs text-slate-300 mr-2 font-medium">
                  Crop ({Math.round(cropRegion.w)} × {Math.round(cropRegion.h)})
                </span>
                <button
                  onClick={handleApplyCrop}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Apply
                </button>
                <button
                  onClick={handleCancelCrop}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
