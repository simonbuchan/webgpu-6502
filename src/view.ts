import { canvas, device } from "./gpu/context.js";
import { draw } from "./gpu/draw.js";
import { resizeNodeTexture, viewBuffer } from "./gpu/resources.js";

// Chip polygon coordinates are within [0,chipSize]
const chipSize = 10_000;

// view center offset
export let aspectX = 1;
export let aspectY = 1;

// view center, in view space ([-1,1])
export let x = 0;
export let y = 0;
export let zoom = 1;

export function setView() {
  const tx = x - zoom;
  const ty = y - zoom;

  const scale = (zoom * 2) / chipSize;
  const sx = scale / aspectY;
  const sy = scale / aspectX;

  device.queue.writeBuffer(
    viewBuffer,
    0,
    // prettier-ignore
    new Float32Array([
      sx, 0, tx, 0,
      0, sy, ty, 0
    ]),
  );
}

export let dragEvent: MouseEvent | null = null;

export function dragMove(event: MouseEvent) {
  const dx = event.clientX - dragEvent!.clientX;
  const dy = event.clientY - dragEvent!.clientY;
  dragEvent = event;
  x += (dx * 2 * devicePixelRatio) / canvas.width;
  y -= (dy * 2 * devicePixelRatio) / canvas.height;
  setView();
  draw();
}

export function dragUp(event: MouseEvent) {
  if (event.button !== 0) {
    return;
  }
  dragEvent = null;
  removeEventListener("mousemove", dragMove);
  removeEventListener("mouseup", dragUp);
}

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const mul = 1 - event.deltaY * 0.001;
  x *= mul;
  y *= mul;
  zoom *= mul;
  setView();
  draw();
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0) {
    return;
  }
  dragEvent = event;
  addEventListener("mousemove", dragMove);
  addEventListener("mouseup", dragUp);
});

// could just use resize event while the canvas is fullscreen,
// but we might change that later.
new ResizeObserver(function ([entry]: ResizeObserverEntry[]) {
  const { inlineSize: w, blockSize: h } = entry.devicePixelContentBoxSize[0];
  const min = Math.min(w, h);
  aspectX = h / min;
  aspectY = w / min;
  canvas.width = w;
  canvas.height = h;
  resizeNodeTexture(w, h);
  setView();
  draw();
}).observe(document.getElementById("canvas-size")!);
