import { render } from "solid-js/web";
import { createMemo, createSignal, from, JSX, Setter, Show } from "solid-js";

import * as pads from "./6502/pads.js";
import * as Data from "./data.js";
import { bufferFrom, canvas, context, device } from "./context.js";
import {
  renderPipeline,
  stateBindGroupLayout,
  updatePipeline,
  viewBindGroupLayout,
  weakenPipeline,
} from "./pipeline.js";
import {
  initNodeData,
  nodeData,
  nodeIsHigh,
  pullNode,
  readAddressBus,
  readDataBus,
  setNodeDataBuffer,
  writeDataBus,
} from "./env.js";

type Charge = "float" | "low" | "high" | "shorted";
const CHARGES: Charge[] = ["float", "low", "high", "shorted"];

interface NodeInfo {
  id: number;
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
          device.queue.writeBuffer(nodeBuffer, 0, nodeData);
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
            device.queue.writeBuffer(nodeBuffer, 0, nodeData);
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
            device.queue.writeBuffer(nodeBuffer, 0, nodeData);
            draw();
          }}
          disabled={running()}
        >
          Update Weaken
        </Button>
        <Button
          onClick={async () => {
            await update(false);
            device.queue.writeBuffer(nodeBuffer, 0, nodeData);
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
            <NodeState state={nodeState(node().state)} />
          </div>
        )}
      </Show>
    </div>
  );
}

render(Panel, document.getElementById("panel")!);

const data = await Data.load();
console.log("%s nodes", data.simulation.nodes.byteLength / 4);
console.log("%s transistors", data.simulation.transistors.byteLength / 8);

const instancesBuffer = bufferFrom(
  data.polygons.instances,
  GPUBufferUsage.VERTEX,
);
const verticesBuffer = bufferFrom(
  data.polygons.vertices,
  GPUBufferUsage.VERTEX,
);
const indicesBuffer = bufferFrom(data.polygons.indices, GPUBufferUsage.INDEX);

let nodeTexture = createNodeTexture(canvas.width, canvas.height);

function createNodeTexture(width: number, height: number) {
  return device.createTexture({
    size: [width, height, 1],
    format: "r32uint",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    mipLevelCount: 1,
  });
}

setNodeDataBuffer(data.simulation.nodes);
const nodeMappingBuffer = device.createBuffer({
  size: nodeData.byteLength,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});
const nodeBuffer = bufferFrom(
  nodeData,
  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
);
const transistorBuffer = bufferFrom(
  data.simulation.transistors,
  GPUBufferUsage.STORAGE,
);

const viewBuffer = device.createBuffer({
  size: 4 * 4 * 2,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Chip polygon coordinates are within [0,chipSize]
const chipSize = 10_000;

// view center offset
let aspectX = 1;
let aspectY = 1;

// view center, in view space ([-1,1])
let x = 0;
let y = 0;
let zoom = 1;

function setView() {
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

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const mul = 1 - event.deltaY * 0.001;
  x *= mul;
  y *= mul;
  zoom *= mul;
  setView();
  draw();
});

let dragEvent: MouseEvent | null = null;
canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0) {
    return;
  }
  dragEvent = event;
  addEventListener("mousemove", dragMove);
  addEventListener("mouseup", dragUp);
});

function dragMove(event: MouseEvent) {
  const dx = event.clientX - dragEvent!.clientX;
  const dy = event.clientY - dragEvent!.clientY;
  dragEvent = event;
  x += (dx * 2 * devicePixelRatio) / canvas.width;
  y -= (dy * 2 * devicePixelRatio) / canvas.height;
  setView();
  draw();
}

function dragUp(event: MouseEvent) {
  if (event.button !== 0) {
    return;
  }
  dragEvent = null;
  removeEventListener("mousemove", dragMove);
  removeEventListener("mouseup", dragUp);
}

const viewBindGroup = device.createBindGroup({
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

const stateBindGroup = device.createBindGroup({
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

const readbackBuffer = device.createBuffer({
  size: 4,
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
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
  nodeTexture.destroy();
  nodeTexture = createNodeTexture(w, h);
  setView();
  draw();
}).observe(document.getElementById("canvas-size")!);

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

  setNode(!data ? null : { id: data >> 8, state: data & 0xff });
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

const pages = [
  // zero-page
  new Uint8Array(256),
  // stack
  new Uint8Array(256),
];
// vectors
pages[0xff] = new Uint8Array(256);
// reset vector
pages[0xff][0xfc] = 0x00;
pages[0xff][0xfd] = 0x00;

// example program:
// prettier-ignore
pages[0].set([
  0xa9, 0x00,              // LDA #$00
  0x20, 0x10, 0x00,        // JSR $0010
  0x4c, 0x02, 0x00,        // JMP $0002

  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x40,

  0xe8,                    // INX
  0x88,                    // DEY
  0xe6, 0x0F,              // INC $0F
  0x38,                    // SEC
  0x69, 0x02,              // ADC #$02
  0x60                     // RTS
]);

async function step() {
  const clkHigh = !nodeIsHigh(pads.clk0);
  pullNode(pads.clk0, clkHigh);
  await updateUntilStable();

  if (!clkHigh) {
    if (nodeIsHigh(pads.rw)) {
      const addr = readAddressBus();
      const page = pages[addr >> 8];
      writeDataBus(page ? page[addr & 0xff] : 0);
      await updateUntilStable();
    }
  } else {
    if (!nodeIsHigh(pads.rw)) {
      const addr = readAddressBus();
      const page = pages[addr >> 8];
      if (page) {
        page[addr & 0xff] = readDataBus();
      }
    }
  }

  draw();
}

async function updateUntilStable() {
  device.queue.writeBuffer(nodeBuffer, 0, nodeData);
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

  for (const listener of nodeDataListeners) {
    listener(nodeData);
  }
}

async function update(weaken = false): Promise<boolean> {
  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginComputePass();
  pass.setBindGroup(0, stateBindGroup);

  const nodeSize = 4;
  const transistorSize = 8;
  const workgroupSize = 256;

  if (weaken) {
    pass.setPipeline(weakenPipeline);
    pass.dispatchWorkgroups(
      Math.ceil(data.simulation.nodes.byteLength / nodeSize / workgroupSize),
    );
  }

  pass.setPipeline(updatePipeline);
  pass.dispatchWorkgroups(
    Math.ceil(
      data.simulation.transistors.byteLength / transistorSize / workgroupSize,
    ),
  );
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
