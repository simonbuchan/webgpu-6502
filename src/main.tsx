import { render } from "solid-js/web";
import {
  createMemo,
  createSignal,
  from,
  type JSX,
  type Setter,
  Show,
} from "solid-js";

import * as pads from "./6502/pads.js";
import { canvas, device } from "./gpu/context.js";
import { updatePipeline, weakenPipeline } from "./gpu/pipeline.js";
import {
  initNodeData,
  memoryRead,
  memoryWrite,
  nodeIsHigh,
  pullNode,
  readAddressBus,
  readDataBus,
  writeDataBus,
} from "./env.js";
import {
  nodeBuffer,
  nodeMappingBuffer,
  nodeTexture,
  stateBindGroup,
} from "./gpu/resources.js";
import { draw } from "./gpu/draw.js";
import "./view.js";
import {
  clearNodeHover,
  nodeCount,
  nodeData,
  transistorCount,
  updateNodeHover,
} from "./data/data.js";

type Charge = "float" | "low" | "high" | "shorted";
const CHARGES: Charge[] = ["float", "low", "high", "shorted"];
const LAYER_NAMES = [
  "metal",
  "switched diffusion",
  "input diode",
  "grounded diffusion",
  "powered diffusion",
  "polysilicon",
];

interface NodeInfo {
  id: number;
  layer: number;
  state: number;
}

interface NodeState {
  weak: Charge;
  strong: Charge;
  input: boolean;
  changed: boolean;
}

function nodeState(state: number): NodeState {
  return {
    weak: CHARGES[state & 3],
    strong: CHARGES[(state >> 2) & 3],
    input: (state & 16) !== 0,
    changed: (state & 32) !== 0,
  };
}

const [node, setNode] = createSignal<NodeInfo | null>(null);
const [running, setRunning] = createSignal(false);

const nodeDataListeners = new Set<Setter<Uint32Array | undefined>>();
const nodeDataSignal = from<Uint32Array>((listener) => {
  nodeDataListeners.add(listener);
  return () => {
    nodeDataListeners.delete(listener);
  };
});

function updateNodeData() {
  for (const listener of nodeDataListeners) {
    listener(nodeData);
  }
  device.queue.writeBuffer(nodeBuffer, 0, nodeData);
}

function Pad(props: { name: keyof typeof pads }) {
  const checked = createMemo(() => {
    // just need a dep on this changing.
    if (nodeDataSignal() === undefined) return false;
    return nodeIsHigh(pads[props.name] as number);
  });
  return (
    <div class="flex flex-row gap-1 align-middle">
      <input
        type="checkbox"
        class="h-4 w-4"
        checked={checked()}
        onChange={async (event) => {
          pullNode(pads[props.name] as number, event.target.checked);
          // await updateUntilStable();
          updateNodeData();
          draw();
        }}
      />
      <div class="flex-1">{props.name}</div>
    </div>
  );
}

function Button(props: JSX.IntrinsicElements["button"]) {
  return (
    <button
      {...props}
      class="rounded bg-blue-500 px-2 py-1 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
    />
  );
}

function NodeState(props: { state: NodeState }) {
  return (
    <div>
      <div>Weak: {props.state.weak}</div>
      <div>Strong: {props.state.strong}</div>
      {props.state.input && <div>Input</div>}
      {props.state.changed && <div>Changed</div>}
    </div>
  );
}

function Panel() {
  return (
    <div class="flex w-40 flex-col gap-1 p-1">
      <div class="flex flex-row flex-wrap gap-1">
        <Button
          onClick={() => {
            initNodeData();
            updateNodeData();
            draw();
          }}
          disabled={running()}
        >
          Init
        </Button>
        <Button onClick={resetState} disabled={running()}>
          Reset
        </Button>
        <Button
          onClick={async () => {
            await update(true);
            updateNodeData();
            draw();
          }}
          disabled={running()}
        >
          Update Weaken
        </Button>
        <Button
          onClick={async () => {
            await update(false);
            updateNodeData();
            draw();
          }}
          disabled={running()}
        >
          Update
        </Button>
        <Button onClick={step} disabled={running()}>
          Step
        </Button>
      </div>
      <div class="flex flex-col gap-1">
        <Pad name="clk0" />
        <Pad name="res" />
      </div>
      <Show when={node()}>
        {(node) => (
          <div>
            <div>Node: {node().id}</div>
            <div>Layer: {LAYER_NAMES[node().layer]}</div>
            <NodeState state={nodeState(node().state)} />
          </div>
        )}
      </Show>
    </div>
  );
}

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
  // if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

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
    const layer = (data >> 8) & 0xff;
    const state = data & 0xff;
    setNode({ id, layer, state });

    updateNodeHover(id);
  }
  updateNodeData();
  draw();
});

addEventListener("keydown", (e) => {
  if (e.key === " ") {
    void updateUntilStable();
  }
});

async function resetState() {
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

async function step() {
  const clkHigh = !nodeIsHigh(pads.clk0);
  pullNode(pads.clk0, clkHigh);
  await updateUntilStable();

  if (!clkHigh) {
    if (nodeIsHigh(pads.rw)) {
      const addr = readAddressBus();
      const data = memoryRead(addr);
      writeDataBus(data);
      await updateUntilStable();
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

async function updateUntilStable() {
  updateNodeData();
  setRunning(true);

  const start = performance.now();
  let count = 0;

  let first = true;

  // need to read back state to tell if we're done anyway, so might as well
  // get the output while we're here.
  while (running()) {
    let updates = await update(first);
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

async function update(weaken = false): Promise<boolean> {
  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginComputePass();
  pass.setBindGroup(0, stateBindGroup);

  const workgroupSize = 256;

  if (weaken) {
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
      console.log(`${i}: ${CHARGES[last]} => ${CHARGES[next]}`);
      updates++;
    }
  }
  nodeData.set(newNodeData);
  nodeMappingBuffer.unmap();

  console.log("updates", updates);
  return updates !== 0;
}
