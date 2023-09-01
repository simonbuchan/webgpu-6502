import code from "./shader.wgsl?raw";

import * as Data from "./data.js";

const data = await Data.load();

function die(message: string): never {
  throw new Error(message);
}

const adapter =
  (await navigator.gpu.requestAdapter()) ?? die("No adapter found");
console.log(await adapter.requestAdapterInfo());
const device = (await adapter.requestDevice()) ?? die("No device found");
const format = navigator.gpu.getPreferredCanvasFormat();

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const context = canvas.getContext("webgpu") ?? die("No context found");
context.configure({ device, format });

function bufferFrom(data: ArrayBuffer, usage: number): GPUBuffer {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usage | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

const instancesBuffer = bufferFrom(
  data.polygons.instances,
  GPUBufferUsage.VERTEX,
);
const verticesBuffer = bufferFrom(
  data.polygons.vertices,
  GPUBufferUsage.VERTEX,
);
const indicesBuffer = bufferFrom(data.polygons.indices, GPUBufferUsage.INDEX);

const transistorBuffer = bufferFrom(data.transistors, GPUBufferUsage.STORAGE);

const module = device.createShaderModule({
  code,
});

const pipeline = await device.createRenderPipelineAsync({
  layout: "auto",
  vertex: {
    module,
    entryPoint: "vs_poly",
    buffers: [
      {
        stepMode: "instance",
        arrayStride: Data.instanceStride,
        attributes: [
          {
            // nodeId, layer
            shaderLocation: 1,
            offset: 0,
            format: "uint16x2",
          },
        ],
      },
      {
        stepMode: "vertex",
        arrayStride: Data.vertexStride,
        attributes: [
          {
            // position
            shaderLocation: 0,
            offset: 0,
            format: "uint16x2",
          },
        ],
      },
    ],
  },
  fragment: {
    module,
    entryPoint: "fs_poly",
    targets: [
      {
        format,
        blend: {
          color: {
            srcFactor: "src-alpha",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
          alpha: {
            srcFactor: "src-alpha",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
        },
      },
    ],
  },
  primitive: {
    topology: "triangle-list",
  },
});

resize();
addEventListener("resize", resize);

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  draw();
}

function draw() {
  const target = context.getCurrentTexture();
  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: target.createView(),
        loadOp: "clear",
        storeOp: "store",
        clearValue: [0, 0, 0, 1],
      },
    ],
  });

  pass.setPipeline(pipeline);
  pass.setVertexBuffer(0, instancesBuffer);
  pass.setVertexBuffer(1, verticesBuffer);
  pass.setIndexBuffer(indicesBuffer, Data.indexFormat);
  for (const [i, draw] of data.polygons.draws.entries()) {
    pass.drawIndexed(draw.indexCount, 1, draw.firstIndex, draw.baseVertex, i);
  }
  pass.end();

  device.queue.submit([commandEncoder.finish()]);

  // requestAnimationFrame(draw);
}
