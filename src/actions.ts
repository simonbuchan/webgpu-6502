import {
  initNodeData,
  memoryRead,
  memoryWrite,
  nodeIsHigh,
  readAddressBus,
  readDataBus,
  setInput,
  writeDataBus,
} from "./env";
import * as pads from "./6502/pads";
import { draw } from "./gpu/draw";
import { running, setRunning } from "./ui/Panel";
import {
  nodeCount,
  nodeData,
  nodeInputData,
  transistorCount,
} from "./data/data";
import { device } from "./gpu/context";
import {
  nodeBuffer,
  nodeInputBuffer,
  nodeMappingBuffer,
  stateBindGroup,
} from "./gpu/resources";
import {
  hoverUpdatePipeline,
  inputPipeline,
  updatePipeline,
} from "./gpu/pipeline";
import { updateNodeData } from "./ui/state";

export async function resetState(changes?: Map<number, [number, number]>) {
  initNodeData();
  await updateUntilStable(changes);
  for (let i = 0; i < 16; i++) {
    setInput(pads.clk0, (i & 1) == 0);
    await updateUntilStable(changes);
  }
  setInput(pads.res, true);
  await updateUntilStable(changes);
  draw();
}

export async function step(changes?: Map<number, [number, number]>) {
  const clkHigh = !nodeIsHigh(pads.clk0);
  setInput(pads.clk0, clkHigh);
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
  setRunning(true);

  const start = performance.now();
  let count = 0;

  let sendInput = true;

  // need to read back state to tell if we're done anyway, so might as well
  // get the output while we're here.
  while (running()) {
    let updates = await update(sendInput, changes);
    sendInput = false;

    if (!updates) {
      const end = performance.now();
      console.log(`stable after ${count} updates in ${(end - start) | 0}ms`);
      setRunning(false);
      break;
    }

    // if it's the same result the first time through, then there were 0 updates
    count += 1;
  }
}

export function sendNodeHover() {
  device.queue.writeBuffer(nodeInputBuffer, 0, nodeInputData);
  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginComputePass();
  pass.setPipeline(hoverUpdatePipeline);
  pass.setBindGroup(0, stateBindGroup);
  pass.dispatchWorkgroups(Math.ceil(nodeCount / 256));
  pass.end();
  device.queue.submit([commandEncoder.finish()]);
}

export function sendInput() {
  device.queue.writeBuffer(nodeInputBuffer, 0, nodeInputData);
  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginComputePass();
  pass.setPipeline(inputPipeline);
  pass.setBindGroup(0, stateBindGroup);
  pass.dispatchWorkgroups(Math.ceil(nodeCount / 256));
  pass.end();
  device.queue.submit([commandEncoder.finish()]);
}

export async function update(
  sendInput = false,
  changes?: Map<number, [number, number]>,
): Promise<boolean> {
  console.log("update", sendInput);
  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginComputePass();
  pass.setBindGroup(0, stateBindGroup);

  const workgroupSize = 256;

  if (sendInput) {
    pass.setPipeline(inputPipeline);
    pass.dispatchWorkgroups(Math.ceil(nodeCount / workgroupSize));
  }

  pass.setPipeline(updatePipeline);
  pass.dispatchWorkgroups(Math.ceil(transistorCount / workgroupSize));
  pass.end();

  const updates = await fetchNodeData(changes, commandEncoder);
  return updates !== 0;
}

export async function fetchNodeData(
  changes?: Map<number, [number, number]>,
  commandEncoder = device.createCommandEncoder(),
) {
  console.log("fetch node data");
  commandEncoder.copyBufferToBuffer(
    nodeBuffer,
    0,
    nodeMappingBuffer,
    0,
    nodeBuffer.size,
  );
  device.queue.submit([commandEncoder.finish()]);
  nodeMappingBuffer.mapAsync(GPUMapMode.READ);

  await device.queue.onSubmittedWorkDone();

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

  updateNodeData();

  return updates;
}
