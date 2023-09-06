import { createMemo } from "solid-js";
import { nodeDataSignal } from "./state";
import { HOVER_C1C2, HOVER_GATE } from "../data/data";
import { Index } from "solid-js/web";

export default function HoverNodes() {
  const gateNodes = createMemo(() => {
    const nodeData = nodeDataSignal();
    if (nodeData === undefined) return [];
    const nodes = [];
    for (let i = 0; i < nodeData.length; i++) {
      if (nodeData[i] & HOVER_GATE) nodes.push(i);
    }
    return nodes;
  });
  const controlledNodes = createMemo(() => {
    const nodeData = nodeDataSignal();
    if (nodeData === undefined) return [];
    const nodes = [];
    for (let i = 0; i < nodeData.length; i++) {
      if (nodeData[i] & HOVER_C1C2) nodes.push(i);
    }
    return nodes;
  });

  return (
    <div class="max-h-80 overflow-auto">
      <Index each={gateNodes()}>{(node) => <div>Gate: {node()}</div>}</Index>
      <Index each={controlledNodes()}>
        {(node) => <div>Ctrd: {node()}</div>}
      </Index>
    </div>
  );
}
