import { createMemo } from "solid-js";

import * as pads from "../6502/pads";
import { nodeDataSignal, updateNodeData } from "./state";
import { nodeIsHigh, pullNode } from "../env";
import { draw } from "../gpu/draw";

export default function Pad(props: { name: keyof typeof pads }) {
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
      <div class="flex-1">
        {props.name} ({pads[props.name]})
      </div>
    </div>
  );
}
