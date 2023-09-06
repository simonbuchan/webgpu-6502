import { createSignal, Show } from "solid-js";
import { Index } from "solid-js/web";

import { resetState, step, update } from "../actions";
import { initNodeData } from "../env";
import { draw } from "../gpu/draw";

import {
  CHARGES,
  LAYER_NAMES,
  type NodeInfo,
  nodeState,
  updateNodeData,
} from "./state";
import Button from "./Button";
import HoverNodes from "./HoverNodes";
import NodeStateView from "./NodeStateView";
import Pad from "./Pad";

export const [node, setNode] = createSignal<NodeInfo | null>(null);
export const [running, setRunning] = createSignal(false);

export default function Panel() {
  const [changes, setChanges] = createSignal<Map<number, [number, number]>>(
    new Map(),
  );

  return (
    <div class="flex w-40 flex-col gap-1 bg-black bg-opacity-50 p-1">
      <div class="flex flex-row flex-wrap gap-1">
        <Button
          onClick={() => {
            setChanges(new Map());
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
            const changes = new Map();
            await update(true, changes);
            setChanges(changes);
            updateNodeData();
            draw();
          }}
          disabled={running()}
        >
          Update Weaken
        </Button>
        <Button
          onClick={async () => {
            const changes = new Map();
            await update(false, changes);
            setChanges(changes);
            updateNodeData();
            draw();
          }}
          disabled={running()}
        >
          Update
        </Button>
        <Button
          onClick={async () => {
            const changes = new Map();
            await step(changes);
            setChanges(changes);
          }}
          disabled={running()}
        >
          Step
        </Button>
      </div>
      <div class="flex flex-col gap-1">
        <Pad name="clk0" />
        <Pad name="res" />
      </div>
      <Index each={Array.from(changes())}>
        {(entry) => (
          <div>
            {entry()[0]}: {CHARGES[entry()[1][0]]}
            {" -> "}
            {CHARGES[entry()[1][1]]}
          </div>
        )}
      </Index>
      <Show when={node()}>
        {(node) => (
          <div>
            <div>Node: {node().id}</div>
            <div>Layer: {LAYER_NAMES[node().layer]}</div>
            <NodeStateView state={nodeState(node().state)} />
          </div>
        )}
      </Show>
      <HoverNodes />
    </div>
  );
}
