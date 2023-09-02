import * as Data from "./data.js";
import { bufferFrom, canvas, context, device } from "./context.js";
import { bindGroupLayout, renderPipeline, stepPipeline } from "./pipeline.js";

const data = await Data.load();

const instancesBuffer = bufferFrom(
  data.polygons.instances,
  GPUBufferUsage.VERTEX,
);
const verticesBuffer = bufferFrom(
  data.polygons.vertices,
  GPUBufferUsage.VERTEX,
);
const indicesBuffer = bufferFrom(data.polygons.indices, GPUBufferUsage.INDEX);

const nodeData = new Uint32Array(1724);
for (let i = 0; i < 1724; i++) {
  nodeData[i] = i;
}

const nodeBuffer = bufferFrom(nodeData, GPUBufferUsage.STORAGE);
const transistorBuffer = bufferFrom(data.transistors, GPUBufferUsage.STORAGE);
const bindGroup = device.createBindGroup({
  layout: bindGroupLayout,
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

let nextDraw = 0;

resize();
addEventListener("resize", resize);

draw();

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
}

function draw() {
  const target = context.getCurrentTexture();
  const commandEncoder = device.createCommandEncoder();
  {
    const step = commandEncoder.beginComputePass();
    step.setPipeline(stepPipeline);
    step.setBindGroup(0, bindGroup);
    // dispatches one 256x1x1 workgroup, e.g. the first 256 nodes
    step.dispatchWorkgroups(1, 1, 1);
    step.end();
  }

  {
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

    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, instancesBuffer);
    pass.setVertexBuffer(1, verticesBuffer);
    pass.setIndexBuffer(indicesBuffer, Data.indexFormat);
    for (const [i, draw] of data.polygons.draws.entries()) {
      pass.drawIndexed(draw.indexCount, 1, draw.firstIndex, draw.baseVertex, i);
    }
    pass.end();
  }

  device.queue.submit([commandEncoder.finish()]);

  nextDraw = requestAnimationFrame(draw);
}

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(nextDraw);
  });
}
