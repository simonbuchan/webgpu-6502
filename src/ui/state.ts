import { from, type Setter } from "solid-js";

import { nodeData } from "../data/data";
import { device } from "../gpu/context";
import { nodeBuffer } from "../gpu/resources";

type Charge = "float" | "low" | "high" | "shorted";
export const CHARGES: Charge[] = ["float", "low", "high", "shorted"];
export const LAYER_NAMES = [
  "metal",
  "switched diffusion",
  "input diode",
  "grounded diffusion",
  "powered diffusion",
  "polysilicon",
];

export interface NodeInfo {
  id: number;
  layer: number;
  state: number;
}

export interface NodeState {
  weak: Charge;
  strong: Charge;
  input: boolean;
  changed: boolean;
}

export function nodeState(state: number): NodeState {
  return {
    weak: CHARGES[state & 3],
    strong: CHARGES[(state >> 2) & 3],
    input: (state & 16) !== 0,
    changed: (state & 32) !== 0,
  };
}

const nodeDataListeners = new Set<Setter<Uint32Array | undefined>>();
export const nodeDataSignal = from<Uint32Array>((listener) => {
  nodeDataListeners.add(listener);
  return () => {
    nodeDataListeners.delete(listener);
  };
});

export function updateNodeData() {
  for (const listener of nodeDataListeners) {
    listener(nodeData);
  }
  device.queue.writeBuffer(nodeBuffer, 0, nodeData);
}
