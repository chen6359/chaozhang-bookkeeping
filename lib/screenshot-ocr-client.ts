import { parseScreenshotText } from "./screenshot-import.ts";
import type { LocalDateKey } from "./habit.ts";

export type ScreenshotOcrProgress = {
  progress: number;
  label: string;
};

export type ScreenshotOcrResult = ReturnType<typeof parseScreenshotText> & {
  imageWidth: number;
  imageHeight: number;
};

const maxFileBytes = 15 * 1024 * 1024;
const maxCanvasPixels = 24_000_000;
const targetMinWidth = 1_200;
const targetMaxWidth = 1_900;

export function validateScreenshotFile(file: File): string | null {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return "请选择 PNG、JPG 或 WebP 格式的微信/支付宝账单截图。";
  }
  if (file.size === 0) return "这张图片是空文件，请重新选择。";
  if (file.size > maxFileBytes) return "图片超过 15MB，请先裁剪或压缩后再试。";
  return null;
}

export async function fingerprintScreenshotFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function prepareScreenshotCanvas(
  file: File,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const pixelScale = Math.sqrt(
    maxCanvasPixels / Math.max(1, bitmap.width * bitmap.height),
  );
  const widthScale =
    bitmap.width < targetMinWidth
      ? targetMinWidth / bitmap.width
      : targetMaxWidth / bitmap.width;
  const scale = Math.min(2, widthScale, pixelScale);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: false });
  if (!context) {
    bitmap.close();
    throw new Error("当前浏览器无法处理这张图片。");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.filter = "grayscale(1) contrast(1.16)";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { canvas, width, height };
}

function translateOcrStatus(status: string): string {
  if (/loading tesseract core/i.test(status)) return "正在加载本机识别引擎";
  if (/initializing tesseract/i.test(status)) return "正在启动本机识别引擎";
  if (/loading language/i.test(status)) return "正在加载中文识别模型";
  if (/initializing api/i.test(status)) return "正在准备账单识别";
  if (/recognizing text/i.test(status)) return "正在读取账单文字";
  return "正在本机识别";
}

export async function recognizeScreenshotLocally(
  file: File,
  fallbackDate: LocalDateKey,
  onProgress: (progress: ScreenshotOcrProgress) => void,
  signal?: AbortSignal,
): Promise<ScreenshotOcrResult> {
  const validationError = validateScreenshotFile(file);
  if (validationError) throw new Error(validationError);
  onProgress({ progress: 0.02, label: "正在检查图片" });
  const { canvas, width, height } = await prepareScreenshotCanvas(file);
  let worker: Awaited<
    ReturnType<(typeof import("tesseract.js"))["createWorker"]>
  > | null = null;
  let cancelled = signal?.aborted ?? false;
  const abort = () => {
    cancelled = true;
    if (worker) void worker.terminate();
  };
  signal?.addEventListener("abort", abort, { once: true });

  try {
    if (cancelled) throw new DOMException("识别已取消", "AbortError");
    const { createWorker, OEM, PSM } = await import("tesseract.js");
    worker = await createWorker(["chi_sim", "eng"], OEM.LSTM_ONLY, {
      workerPath: "/ocr/worker.min.js",
      cacheMethod: "write",
      workerBlobURL: false,
      logger: (message) => {
        onProgress({
          progress: Math.max(0.03, Math.min(0.98, message.progress || 0.03)),
          label: translateOcrStatus(message.status),
        });
      },
    });
    if (cancelled) throw new DOMException("识别已取消", "AbortError");
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const { data } = await worker.recognize(
      canvas,
      { rotateAuto: true },
      { text: true, blocks: true },
    );
    if (cancelled) throw new DOMException("识别已取消", "AbortError");
    const orderedLines =
      data.blocks
        ?.flatMap((block) => block.paragraphs)
        .flatMap((paragraph) => paragraph.lines)
        .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
        .map((line) => line.text.trim())
        .filter(Boolean) ?? [];
    const rawText = orderedLines.length > 0 ? orderedLines.join("\n") : data.text;
    onProgress({ progress: 1, label: "识别完成，正在整理账目" });
    return {
      ...parseScreenshotText(rawText, fallbackDate),
      imageWidth: width,
      imageHeight: height,
    };
  } finally {
    signal?.removeEventListener("abort", abort);
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // A cancelled worker may already be terminated.
      }
    }
    canvas.width = 1;
    canvas.height = 1;
  }
}
