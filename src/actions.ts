import {
  initNodeData,
  memoryRead,
  memoryWrite,
  nodeIsHigh,
  pullNode,
  readAddressBus,
  readDataBus,
  writeDataBus,
} from "./env";
import * as pads from "./6502/pads";
import { draw } from "./gpu/draw";
import { updateNodeData } from "./ui/state";
import { running, setRunning } from "./ui/Panel";
import { nodeCount, nodeData, transistorCount } from "./data/data";
import { device } from "./gpu/context";
import { nodeBuffer, nodeMappingBuffer, stateBindGroup } from "./gpu/resources";
import { updatePipeline, weakenPipeline } from "./gpu/pipeline";

export async function resetState() {
  initNodeData();
  await updateUntilStable();
  for (let i = 0; i < 16; i++) {
    pullNode(pads.clk0, (i & 1) == 0);
    await updateUntilStable();
  }
  pullNode(pads.res, true);
  await updateUntilStable();
  draw();
}

export async function step(changes?: Map<number, [number, number]>) {
  const clkHigh = !nodeIsHigh(pads.clk0);
  pullNode(pads.clk0, clkHigh);
  await updateUntilStable(changes);

  if (!clkHigh) {
    if (nodeIsHigh(pads.rw)) {
      const addr = readAddressBus();
      const data = memoryRead(addr);
      writeDataBus(data);
      await updateUntilStable(changes);
    }
  } else {
    if (!nodeIsHigh(pads.rw)) {
      const addr = readAddressBus();
      const data = readDataBus();
      memoryWrite(addr, data);
    }
  }

  draw();
}

export async function updateUntilStable(
  changes?: Map<number, [number, number]>,
) {
  updateNodeData();
  setRunning(true);

  const start = performance.now();
  let count = 0;

  let first = true;

  // need to read back state to tell if we're done anyway, so might as well
  // get the output while we're here.
  while (running()) {
    let updates = await update(first, changes);
    first = false;
    const shortIndex = nodeData.indexOf(3);
    if (shortIndex !== -1) {
      console.log(`shorted node ${shortIndex}`);
      break;
    }

    if (updates) {
      const end = performance.now();
      console.log(`stable after ${count} updates in ${(end - start) | 0}ms`);
      setRunning(false);
      break;
    }

    // if it's the same result the first time through, then there were 0 updates
    count += 1;
  }
}

export async function update(
  init = false,
  changes?: Map<number, [number, number]>,
): Promise<boolean> {
  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginComputePass();
  pass.setBindGroup(0, stateBindGroup);

  const workgroupSize = 256;

  if (init) {
    pass.setPipeline(weakenPipeline);
    pass.dispatchWorkgroups(Math.ceil(nodeCount / workgroupSize));
  }

  pass.setPipeline(updatePipeline);
  pass.dispatchWorkgroups(Math.ceil(transistorCount / workgroupSize));
  pass.end();
  commandEncoder.copyBufferToBuffer(
    nodeBuffer,
    0,
    nodeMappingBuffer,
    0,
    nodeData.byteLength,
  );
  device.queue.submit([commandEncoder.finish()]);

  nodeMappingBuffer.mapAsync(GPUMapMode.READ);
  await device.queue.onSubmittedWorkDone();

  // need to clone the mapped data, so double construct the Uint32Array
  const newNodeData = new Uint32Array(nodeMappingBuffer.getMappedRange());
  let updates = 0;
  for (let i = 0; i < nodeData.length; i++) {
    const last = nodeData[i] & 3;
    const next = newNodeData[i] & 3;
    if (last !== next) {
      changes?.set(i, [last, next]);
      updates++;
    }
  }
  nodeData.set(newNodeData);
  nodeMappingBuffer.unmap();

  console.log("updates", updates);
  return updates !== 0;
}
