import { from, type Setter } from "solid-js";

import { nodeData } from "../data/data";

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
  name: string | undefined;
  layer: number;
  state: number;
}

export interface NodeState {
  charge: Charge;
  changed: boolean;
}

export function nodeState(state: number): NodeState {
  return {
    charge: CHARGES[state & 3],
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
}
