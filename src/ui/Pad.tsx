import { createMemo } from "solid-js";

import * as pads from "../6502/pads";
import { nodeDataSignal } from "./state";
import { nodeIsHigh, setInput } from "../env";
import { draw } from "../gpu/draw";
import { sendInput } from "../actions";

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
          setInput(pads[props.name] as number, event.target.checked);
          sendInput();
          draw();
        }}
      />
      <div class="flex-1">
        {props.name} ({pads[props.name]})
      </div>
    </div>
  );
}
