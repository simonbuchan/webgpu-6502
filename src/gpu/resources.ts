import { bufferFrom, canvas, device } from "./context.js";
import { stateBindGroupLayout, viewBindGroupLayout } from "./pipeline.js";
import { data } from "../data/data.js";

export const instancesBuffer = bufferFrom(
  data.polygons.instances,
  GPUBufferUsage.VERTEX,
);

export const verticesBuffer = bufferFrom(
  data.polygons.vertices,
  GPUBufferUsage.VERTEX,
);

export const indicesBuffer = bufferFrom(
  data.polygons.indices,
  GPUBufferUsage.INDEX,
);

export let nodeTexture = createNodeTexture(canvas.width, canvas.height);

function createNodeTexture(width: number, height: number) {
  return device.createTexture({
    size: [width, height, 1],
    format: "r32uint",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    mipLevelCount: 1,
  });
}

export function resizeNodeTexture(width: number, height: number) {
  nodeTexture.destroy();
  nodeTexture = createNodeTexture(width, height);
}

export const nodeMappingBuffer = device.createBuffer({
  size: data.simulation.nodes.byteLength,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});

export const nodeBuffer = bufferFrom(
  data.simulation.nodes,
  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
);

const transistorBuffer = bufferFrom(
  data.simulation.transistors,
  GPUBufferUsage.STORAGE,
);

export const viewBuffer = device.createBuffer({
  size: 4 * 4 * 2,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

export const viewBindGroup = device.createBindGroup({
  layout: viewBindGroupLayout,
  entries: [
    {
      binding: 0,
      resource: {
        buffer: viewBuffer,
      },
    },
  ],
});

export const stateBindGroup = device.createBindGroup({
  layout: stateBindGroupLayout,
  entries: [
    {
      binding: 0,
      resource: {
        buffer: nodeBuffer,
      },
    },
    {
      binding: 1,
      resource: {
        buffer: transistorBuffer,
      },
    },
  ],
});
