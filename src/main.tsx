import { render } from "solid-js/web";
import { canvas, device } from "./gpu/context";
import { nodeTexture } from "./gpu/resources";
import { draw } from "./gpu/draw";
import "./view";
import { clearNodeHover, nodeNames, setNodeHoverData } from "./data/data";

import Panel, { setNode } from "./ui/Panel";
import {
  sendNodeHover,
  sendInput,
  updateUntilStable,
  fetchNodeData,
} from "./actions";
import { updateNodeData } from "./ui/state";

render(Panel, document.getElementById("panel")!);

const readbackBuffer = device.createBuffer({
  size: 4,
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
});

let readback = false;
canvas.addEventListener("mousemove", async (event) => {
  if (readback) return;
  readback = true;
  const x = event.offsetX * devicePixelRatio;
  const y = event.offsetY * devicePixelRatio;

  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyTextureToBuffer(
    {
      texture: nodeTexture,
      mipLevel: 0,
      origin: [x, y, 0],
    },
    {
      buffer: readbackBuffer,
      bytesPerRow: 256,
      rowsPerImage: 1,
    },
    [1, 1, 1],
  );
  device.queue.submit([commandEncoder.finish()]);
  readbackBuffer.mapAsync(GPUMapMode.READ);
  await device.queue.onSubmittedWorkDone();
  const [data] = new Uint32Array(readbackBuffer.getMappedRange());
  readbackBuffer.unmap();
  readback = false;

  if (!data) {
    setNode(null);
    clearNodeHover();
  } else {
    const id = data >> 16;
    const name = nodeNames.get(id);
    const layer = (data >> 8) & 0xff;
    const state = data & 0xff;
    setNode({ id, name, layer, state });

    setNodeHoverData(id);
  }
  sendNodeHover();
  await fetchNodeData();
  draw();
});

addEventListener("keydown", (e) => {
  if (e.key === " ") {
    void updateUntilStable();
  }
});
