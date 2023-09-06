import { context, device } from "./context";
import {
  indicesBuffer,
  instancesBuffer,
  nodeTexture,
  stateBindGroup,
  verticesBuffer,
  viewBindGroup,
} from "./resources";
import { renderPipeline } from "./pipeline";
import * as Data from "../data/load";
import { data } from "../data/data";

export function draw() {
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
      {
        view: nodeTexture.createView(),
        loadOp: "clear",
        storeOp: "store",
        clearValue: [0, 0, 0, 0],
      },
    ],
  });

  pass.setPipeline(renderPipeline);
  pass.setBindGroup(0, stateBindGroup);
  pass.setBindGroup(1, viewBindGroup);
  pass.setVertexBuffer(0, instancesBuffer);
  pass.setVertexBuffer(1, verticesBuffer);
  pass.setIndexBuffer(indicesBuffer, Data.indexFormat);
  for (const [i, draw] of data.polygons.draws.entries()) {
    pass.drawIndexed(draw.indexCount, 1, draw.firstIndex, draw.baseVertex, i);
  }
  pass.end();

  device.queue.submit([commandEncoder.finish()]);
}
