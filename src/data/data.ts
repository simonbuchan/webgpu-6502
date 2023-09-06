import * as Data from "./load";

export const data = await Data.load();
export const nameNodes = new Map<string, number>(
  Object.entries(await (await fetch("names.json")).json()),
);
export const nodeNames = new Map(
  Array.from(nameNodes.entries(), ([k, v]) => [v, k]),
);

export const nodeInputData = new Uint32Array(data.simulation.nodes);
const transistorsData = new Uint32Array(data.simulation.transistors);

export const nodeData = nodeInputData.slice();

export const nodeCount = nodeInputData.length;
export const transistorCount = transistorsData.length / 2;

console.log("%s nodes", nodeCount);
console.log("%s transistors", transistorCount);

// node state: connected to ground or power.
// neither is floating, both is short circuit.
export const LO = 1;
export const HI = 2;

export const CHANGED = 32;
export const HOVER_GATE = 64;
export const HOVER_C1C2 = 128;

export function clearNodeHover() {
  for (let i = 0; i < nodeCount; i++) {
    nodeInputData[i] &= ~(HOVER_GATE | HOVER_C1C2);
  }
}

export function setNodeHoverData(node: number) {
  clearNodeHover();

  for (let i = 0; i < transistorCount; i++) {
    const gate = transistorsData[i * 2];
    const c1c2 = transistorsData[i * 2 + 1];
    const c1 = c1c2 & 0xffff;
    const c2 = c1c2 >>> 16;

    // const on = (nodeData[gate] & HI) !== 0;
    if (node == gate) {
      nodeInputData[c1] |= HOVER_GATE;
      nodeInputData[c2] |= HOVER_GATE;
    }
    if (node == c1 || node == c2) {
      nodeInputData[gate] |= HOVER_C1C2;
    }
  }
}
