import code from "./shader.wgsl?raw";

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

const dataRes = await fetch("data");
const data = await dataRes.arrayBuffer();
const dataView = new DataView(data);
// File: { Header, Indirect, Instances, Vertices, Indices }
//   Header: { indirectOffset: u32, instancesOffset: u32, verticesOffset: u32, indicesOffset: u32 }
//   Indirect: array of { indexCount: u32, instanceCount: u32, firstIndex: u32, baseVertex: u32, baseInstance: u32 }
//   Instances: array of { nodeId: u32, layer: u32 }
//   Vertices: array of { position: vec2f }
//   Indices: array of { index: u32 }
const indirectOffset = dataView.getUint32(0, true);
const instancesOffset = dataView.getUint32(4, true);
const verticesOffset = dataView.getUint32(8, true);
const indicesOffset = dataView.getUint32(12, true);
const indirectSize = 20;
const indirectCount = (instancesOffset - indirectOffset) / indirectSize;
console.log({
  indirectOffset,
  instancesOffset,
  instancesCount: (verticesOffset - instancesOffset) / 8,
  verticesOffset,
  verticesCount: (indicesOffset - verticesOffset) / 8,
  indicesOffset,
  indicesCount: (data.byteLength - indicesOffset) / 4,
  indirectCount,
});
// drawIndexedIndirect seems to be broken under DX12 right now:
// https://github.com/gfx-rs/wgpu/issues/2471
// do it ourselves
const indirect = new Uint32Array(data.slice(indirectOffset, instancesOffset));

// const indirectBuffer = device.createBuffer({
//   size: instancesOffset - indirectOffset,
//   usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
// });
const instancesBuffer = device.createBuffer({
  size: verticesOffset - instancesOffset,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
const verticesBuffer = device.createBuffer({
  size: indicesOffset - verticesOffset,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
const indicesBuffer = device.createBuffer({
  size: data.byteLength - indicesOffset,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});

// device.queue.writeBuffer(
//   indirectBuffer,
//   0,
//   data.slice(indirectOffset, instancesOffset),
// );
device.queue.writeBuffer(
  instancesBuffer,
  0,
  data.slice(instancesOffset, verticesOffset),
);
device.queue.writeBuffer(
  verticesBuffer,
  0,
  data.slice(verticesOffset, indicesOffset),
);
device.queue.writeBuffer(indicesBuffer, 0, data.slice(indicesOffset));

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
        arrayStride: 8,
        attributes: [
          {
            // nodeId
            shaderLocation: 0,
            offset: 0,
            format: "uint32",
          },
          {
            // layer
            shaderLocation: 1,
            offset: 4,
            format: "uint32",
          },
        ],
      },
      {
        stepMode: "vertex",
        arrayStride: 8,
        attributes: [
          {
            // position
            shaderLocation: 2,
            offset: 0,
            format: "float32x2",
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
  pass.setIndexBuffer(indicesBuffer, "uint32");
  for (let i = 0; i < indirectCount; i++) {
    const [indexCount, instanceCount, firstIndex, baseVertex, baseInstance] =
      indirect.subarray(i * 5, (i + 1) * 5);
    pass.drawIndexed(
      indexCount,
      instanceCount,
      firstIndex,
      baseVertex,
      baseInstance,
    );
  }
  pass.end();

  device.queue.submit([commandEncoder.finish()]);

  // requestAnimationFrame(draw);
}
