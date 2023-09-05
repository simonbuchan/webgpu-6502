import * as Data from "./load.js";

export const data = await Data.load();

export const nodeData = new Uint32Array(data.simulation.nodes);
const transistorsData = new Uint32Array(data.simulation.transistors);

export const nodeCount = nodeData.length;
export const transistorCount = transistorsData.length / 2;

console.log("%s nodes", nodeCount);
console.log("%s transistors", transistorCount);

// node state: connected to ground or power.
// neither is floating, both is short circuit.
export const LO = 1;
export const HI = 2;

// directly connected to ground or power
export const PULL_LO = 4;
export const PULL_HI = 8;

// input nodes are not cleared on update
export const INPUT = 16;
export const CHANGED = 32;
export const HOVER_GATE = 64;
export const HOVER_C1C2 = 128;

export function clearNodeHover() {
  for (let i = 0; i < nodeCount; i++) {
    nodeData[i] &= ~(HOVER_GATE | HOVER_C1C2);
  }
}

export function updateNodeHover(node: number) {
  clearNodeHover();

  for (let i = 0; i < transistorCount; i++) {
    const gate = transistorsData[i * 2];
    const c1c2 = transistorsData[i * 2 + 1];
    const c1 = c1c2 & 0xffff;
    const c2 = c1c2 >>> 16;

    if (node == gate) {
      nodeData[c1] |= HOVER_GATE;
      nodeData[c2] |= HOVER_GATE;
    }
    if (node == c1 || node == c2) {
      nodeData[gate] |= HOVER_C1C2;
    }
  }
}
