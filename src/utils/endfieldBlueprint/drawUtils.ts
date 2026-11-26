/**
 * 绘图共享工具：Canvas 工具、常量、蓝图格子渲染
 */
const BLUEPRINT_IMAGE_ASSET: Record<string, string> = Object.freeze({
  belt: "/svg/icon_belt_grid.png",
  left_turn_belt: "/svg/icon_belt_corner_1.png",
  right_turn_belt: "/svg/icon_belt_corner_1.png",
  conveyor_bridge: "/svg/bg_logistic_log_connector.png",
  splitter: "/svg/bg_logistic_log_splitter.png",
  converger: "/svg/bg_logistic_log_converger.png",
});

const FACE_ARROW: Record<string, string> = Object.freeze({
  UP: "^",
  DOWN: "v",
  LEFT: "<",
  RIGHT: ">",
});

export const BRANCH_PNG_STYLE = Object.freeze({
  outerPadding: 12,
  headerHeight: 18,
  headerGap: 6,
  gridPadding: 8,
  cellSize: 40,
  exportPixelRatio: 2,
  fontFamilyFallback:
    '"Frex Sans GB VF", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
});

export const PRECISE_CHART_STYLE = Object.freeze({
  width: 1600,
  height: 900,
  background: "#0d1218",
  legendColor: "#666666",
  textColor: "#888888",
  powerColor: "#d4ff00",
  targetColor: "#ff6b6b",
  batteryColor: "#4ecdc4",
  minBatteryThresholdColor: "#ffd166",
  burnColor: "#ff9f43",
  gridColor: "#1a1a1a",
});

export const COMPLETE_EXPORT_IMAGE_STYLE = Object.freeze({
  width: 1800,
  padding: 32,
  sectionGap: 24,
  cardPadding: 18,
  branchGap: 16,
  background: "#0d1218",
  panelBackground: "rgba(20, 26, 34, 0.95)",
  panelBorder: "rgba(141, 149, 162, 0.8)",
  titleColor: "#f2d378",
  subtitleColor: "#98a5b7",
  textColor: "#d7deea",
  dimTextColor: "#9ba9bc",
});

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function resolveAssetUrl(path: string): string {
  if (!path) return path;
  try {
    return new URL(path, window.location.origin).toString();
  } catch (_error) {
    return path;
  }
}

function loadImageAsset(path: string): Promise<HTMLImageElement> {
  const key = resolveAssetUrl(path);
  const cached = imageCache.get(key);
  if (cached) {
    return cached;
  }
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      imageCache.delete(key);
      reject(new Error(`Failed to load image asset: ${path}`));
    };
    image.src = key;
  });
  imageCache.set(key, promise);
  return promise;
}

export async function preloadBlueprintImages(
  blueprint: (Record<string, unknown> | null)[][],
): Promise<Map<string, HTMLImageElement>> {
  const partIds = new Set<string>();
  blueprint.forEach((row) => {
    row.forEach((part) => {
      const partId = (part as Record<string, unknown>)?.partId as
        | string
        | undefined;
      if (partId && BLUEPRINT_IMAGE_ASSET[partId]) {
        partIds.add(partId);
      }
    });
  });
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...partIds].map(async (partId) => {
      try {
        const image = await loadImageAsset(BLUEPRINT_IMAGE_ASSET[partId]);
        images.set(partId, image);
      } catch (error) {
        console.warn(error);
      }
    }),
  );
  return images;
}

export function getCanvasFontFamily(
  options: { fontFamily?: string } = {},
): string {
  if (typeof options.fontFamily === "string" && options.fontFamily.trim()) {
    return options.fontFamily.trim();
  }
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const body = document.body;
    if (body) {
      const computedFont = window.getComputedStyle(body).fontFamily;
      if (typeof computedFont === "string" && computedFont.trim()) {
        return computedFont.trim();
      }
    }
  }
  return BRANCH_PNG_STYLE.fontFamilyFallback;
}

export async function ensureCanvasFontReady(fontFamily: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.ready) return;
  try {
    await document.fonts.ready;
    await document.fonts.load(`700 13px ${fontFamily}`);
  } catch (error) {
    console.warn("Canvas font preload failed:", error);
  }
}

export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string = "image/png",
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
        return;
      }
      reject(new Error(`Failed to generate ${type} data.`));
    }, type);
  });
  if (!blob) {
    throw new Error(`Failed to generate ${type} data.`);
  }
  return blob;
}

export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("Failed to decode image blob."));
      node.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function wrapTextLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const value = String(text ?? "");
  if (!value) return [""];
  if (context.measureText(value).width <= maxWidth) return [value];

  if (!value.includes(" ")) {
    const lines: string[] = [];
    let current = "";
    for (const char of value) {
      const next = current + char;
      if (current && context.measureText(next).width > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  const words = value.split(" ");
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current);
      current = word;
      return;
    }
    current = next;
  });
  if (current) lines.push(current);
  return lines;
}

export function formatExportValue(
  value: unknown,
  fallback: string = "-",
): string {
  if (value == null) return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const text = String(value).trim();
  return text || fallback;
}

export function drawPanel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  context.fillStyle = COMPLETE_EXPORT_IMAGE_STYLE.panelBackground;
  context.fillRect(x, y, width, height);
  context.strokeStyle = COMPLETE_EXPORT_IMAGE_STYLE.panelBorder;
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
}

function getBlueprintImageRotation(
  part: Record<string, unknown> | null,
): number {
  if (!part?.partId) return 0;
  const face = (part.face as string) || "RIGHT";

  switch (part.partId) {
    case "belt":
      switch (face) {
        case "LEFT":
          return 0;
        case "RIGHT":
          return 180;
        case "UP":
          return -90;
        case "DOWN":
          return 90;
        default:
          return 0;
      }
    case "left_turn_belt":
      return 180;
    case "right_turn_belt":
      return 0;
    case "conveyor_bridge":
      switch (face) {
        case "DOWN":
          return 0;
        case "UP":
          return 180;
        case "LEFT":
          return 90;
        case "RIGHT":
          return -90;
        default:
          return 0;
      }
    case "splitter":
      switch (face) {
        case "RIGHT":
          return -90;
        case "LEFT":
          return 90;
        case "UP":
          return 180;
        case "DOWN":
          return 0;
        default:
          return -90;
      }
    case "converger":
      switch (face) {
        case "DOWN":
          return 0;
        case "UP":
          return 180;
        case "LEFT":
          return 90;
        case "RIGHT":
          return -90;
        default:
          return 0;
      }
    default:
      return 0;
  }
}

function getBlueprintImageMirror(
  part: Record<string, unknown> | null,
): boolean {
  return part?.partId === "right_turn_belt";
}

function getCellFallbackToken(part: Record<string, unknown> | null): string {
  if (!part?.partId) return "";
  switch (part.partId) {
    case "input_source":
      return "I";
    case "thermal_bank":
      return "T";
    case "recycle_source":
      return "R";
    default:
      return FACE_ARROW[part?.face as string] || ">";
  }
}

function getCellColors(part: Record<string, unknown> | null): {
  border: string;
  background: string;
  text: string;
} {
  if (!part?.partId) {
    return {
      border: "rgba(138, 145, 156, 0.2)",
      background: "rgba(0, 0, 0, 0.12)",
      text: "rgba(255, 255, 255, 0)",
    };
  }
  switch (part.partId) {
    case "input_source":
      return {
        border: "rgba(188, 197, 210, 0.78)",
        background: "rgba(58, 67, 79, 0.85)",
        text: "#d8dee7",
      };
    case "thermal_bank":
      return {
        border: "rgba(229, 196, 100, 0.9)",
        background: "rgba(197, 160, 70, 0.18)",
        text: "#f1d173",
      };
    case "recycle_source":
      return {
        border: "rgba(140, 148, 162, 0.75)",
        background: "rgba(58, 67, 79, 0.85)",
        text: "#c2cad8",
      };
    default:
      return {
        border: "rgba(141, 149, 162, 0.95)",
        background: "rgba(0, 0, 0, 0.7)",
        text: "#d7deea",
      };
  }
}

export function drawBlueprintCell(
  context: CanvasRenderingContext2D,
  part: Record<string, unknown> | null,
  x: number,
  y: number,
  cellSize: number,
  fontFamily: string,
  images: Map<string, HTMLImageElement>,
): void {
  const colors = getCellColors(part);

  context.fillStyle = colors.background;
  context.fillRect(x, y, cellSize, cellSize);
  context.strokeStyle = colors.border;
  context.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);

  const image = part?.partId ? images.get(part.partId as string) : undefined;
  if (image) {
    const rotation = (getBlueprintImageRotation(part) * Math.PI) / 180;
    const mirror = getBlueprintImageMirror(part);
    const size = cellSize * 0.9;
    context.save();
    context.translate(x + cellSize / 2, y + cellSize / 2);
    context.rotate(rotation);
    context.scale(mirror ? -1 : 1, 1);
    context.drawImage(image, -size / 2, -size / 2, size, size);
    context.restore();
    return;
  }

  const token = getCellFallbackToken(part);
  if (!token) return;
  context.fillStyle = colors.text;
  context.font = `700 ${Math.max(11, Math.round(cellSize * 0.35))}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(token, x + cellSize / 2, y + cellSize / 2);
}
