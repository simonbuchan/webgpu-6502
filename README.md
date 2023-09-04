# WebGPU 6502 Simulator

This reimplements the [visual 6502 JS simulator](https://github.com/trebonian/visual6502) with WebGPU.

It is automatically deployed to [Github Pages](https://simonbuchan.github.io/webgpu-6502/).

It is currently in progress:

- [x] Load polygons and draw with WebGPU
- [x] Display node state
- [x] Implement a simple 6502 environment (voltage, clock, RAM, etc.)
- [ ] Load transistor definitions and simulate with WebGPU
  - In progress
- [ ] Add "Kiosk" UI to control simulation
    - In progress
- [ ] Add expert UI

And future work like a memory viewer, debugger, and assembler could be neat.

## Simulation

See my more complete reverse-engineered documentation of the JS simulator [here](./docs/original-simulator.md).

The unwrapped, slightly hand-waved version of its inner update loop looks like:

```ts
interface Node {
  // logical level, low or high
  state: boolean;
  // transistors this node controls
  gates: Transistor[];
  // transistors that source or drain this node
  c1c2s: Transistor[];
}

interface Transistor {
  // whether the controlling node is high, and this conducts
  on: boolean;
  // the controlling node
  gate: Node;
  // the controlled nodes (doesn't distinguish source/drain)
  c1: Node;
  c2: Node;
}

function update(node: Node) {
  const invalidatedNodes = new Set([node]);
  while (invalidatedNodes.size) {
    const list = invalidatedNodes;
    invalidatedNodes.clear();
    for (const node of list) {
      const group = new Set([node]);

      for (const node of group) {
        for (const transistor of node.c1c2s) {
          if (transistor.on) {
            group.add(
              node === transistor.c1
                ? transistor.c2
                : transistor.c1
            );
          }
        }
      }

      // actually handles .pullup and .pulldown too
      const state = group.some(node => node.state);
      for (const node of group) {
        if (node.state === state) {
          continue;
        }
        node.state = state;
        for (const transistor of node.gates) {
          if (transistor.on === state) {
            continue;
          }
          transistor.on = state;
          invalidatedNodes.add(transistor.c1);
          if (transistor.on) {
            invalidatedNodes.add(transistor.c2);
          }
        }
      }
    }
  }
}
```

This pointer-chasing graph design doesn't really work for a GPU, though you can model these sorts of things
well with a lot of effort.

The approach I'm trying for is to instead apply gate propagation like the real hardware would, sending pull up and down
signals through connected transistors. This is WIP, as unfortunately, it doesn't seem quite as easy as I'd hoped.
