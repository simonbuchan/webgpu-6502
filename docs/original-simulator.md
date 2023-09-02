# Original Visual 6502 JS Simulator

https://github.com/trebonian/visual6502

The original JS simulator models a directed graph of transistors and wire node voltages.
It has some input data definitions, builds the node and transistor state, and then iterates
the transistor state until it stabilizes for each (half-)cycle.

The relevant files for us are:

- Input data: `segdefs.js`, `transdefs.js`
- Build state, rendering: `wires.js`
- Environment, driver: `macros.js`
- Simulation: `cipsim.js`
- Input: `kioskWires.js`, `expertWires.js`

## Input data

The `*defs.js` files store the chip input data.

### `segdefs.js`

Defines the chip segments: the material (based on layer), and physical shape of the chip.

```js
var segdefs = [
    [   0,'+',1,5391,8260,5391,8216,5357,8216,5357,8260],
    // [ node, pull, layer, path: x0, y0, ... ]
    // ... ~8000 more
];
```

This is mostly just used to display the chip. The node list is also built from this,
but it seems like it mostly just sets the initial pullup value.

### `transdefs.js`

Stores the logical transistors derived from the physical layout, used for the simulation itself:

```js
var transdefs = [
    ['t0', 357, 558, 217, [1450, 1510, 5143, 5320],[228, 297, 16, 3, 4238] ],
    // [ name, gate, c1, c2, bbox, ??? ]
    // ... ~3500 more
];
```

The only values that seem to be actually used here are the gate, c1, and c2 nodes, which
fully describe the connections.

### `nodenames.js`

Gives names to a variety of nodes of interesting nodes, especially the input pins needed
to drive the simulation, and register states.

## Setup

`kioskWires.js` defines `setup()`, which is called in `index.html` to start the initialization.

This then calls a bunch of `setup*()` functions, defined in `wires.js` for the simulation state,
and `macros.js` for the environment.

### State

`wires.js` builds a node list, based on the segment node, and pull value
("+" for pull up, "-" for pull down), and then simulate the transistor based on the gate and c1/c2 nodes from the
transdef nodes.

wires.js then builds a list of nodes from segdef nodes and transistors from transdefs.

```ts
var nodes: Node[];
// not really used, except for debug and reset
var transistors: Transistor[];

interface Node {
  // for display, hit-tests: a list of polygons as x,y pairs
  segs: number[][];
  // node number, unused
  num: number;
  // override to true value. Initialized by segdefs' pull value
  pullup: boolean;
  // override to false. Set by macros.js to initialize / provide environment
  pulldown?: boolean;
  // simulation output state, if pullup/down are not set
  state: boolean;
  // set by macros.js, but isn't used.
  float?: boolean;
  
  // transitors by their connected nodes.
  // Effectively the transistors that this changes in this node will affect,
  // and the list of input nodes that need to be connected into a group if
  // the transistor is on.
  gates: Transistor[];
  c1c2s: Transistor[];
}

interface Transistor {
  // essentially unused
  name: string;
  // the last computed gate group value
  on: boolean;
  // the connected nodes
  gate: number;
  c1: number;
  c2: number;
  // the bounding box, unused
  bb: number[];
}
```

### Environment

`macros.js` defines the environment for the simulation, and drives the simulation.

It implements the following setup functions:
- `loadProgram()` loads a program into memory
- `initChip()` clears the state, then runs the chip through an initialization sequence:
    - set `res` low
    - set `clk0` low
    - set `rdy` high
    - set `so` low
    - set `irq` high
    - set `nmi` high
    - `recalcNodeList()`
    - toggle `clk0` high, low 8 times
    - set `res` high
    - run `halfStep()` 10 times


## Simulation

### `macros.js`

Provides the simulation driver.

It updates the control interface (stop, start etc.), and their implementations:

- `go()` runs `step()` and schedules the next step until stop

- `step()` despite the name only runs `halfStep()` once,
  but it also updates the interface  

- `halfStep()` toggles `clk0` and handles bus read/writes:
    - `handleBusRead()` if `clk0` is low
    - `handleBusWrite()` if `clk0` is high

- `handleBusRead()`, if `rw` is high, will load to the data bus based on the address bus:
  with some simplification this is just:

  ```js
  const addr = readBits("ab")
  const data = memory[addr];
  writeBits("db", data);
  ```

  but apparently `db` is the only use of `writeBits()`, so it directly
  is implemented in `writeDataBus()`, which also unwraps `setLow/High()`
  
- `handleBusWrite()`, if `rw` is low, will store the data bus based on the address bus:
    with some simplification this is just:
    ```js
    const addr = readBits("ab")
    const data = readBits("db");
    memory[addr] = data;
    ``` 

There's also a bunch of debug APIs.

### `cipsim.js`

The main simulation loop.

This is mostly interacted with through the following functions:

- `isNodeHigh(node)`, which simply returns the node `state`.

- `setLow(node)` and `setHigh(node)`, which set the node pull down or pull up state.
  These set the node `pullup` and `pulldown` to force the state, then runs `recalcNodeList([node])`.

The main simulation loop is `recalcNodeList(nodes)`, which runs update on all the nodes affected by changes in the
given nodes.

It repeatedly runs `recalcNode(node)` on all the nodes, until no nodes change.

Excluding debug, this simplifies to:

```js
let list = nodes;
for (let i = 0; i < 100; i++) {
  recalclist = [];
  recalcHash = new Set()
  for (const node of nodes) {
    recalcNode(node);
  }
  list = recalclist;
}
```

`recalcNode(node)` simplifies to:

```js
// updates group to the set of nodes connected to node via transistors
getNodeGroup(node);
// gets the new state of the node
const newState = getNodeValue(node);
// sets all nodes in the group to the new state
for (const node of group) {
  if (node.state === newState) continue;
  node.state = newState;
  // updates controlled transistors
  for (const transistor of node.gates) {
    if (newState) {
      turnTransistorOn(transistor);
    } else {
      turnTransistorOff(transistor);
    }
  }
}
```

`turnTransistorOn()/Off()` simply update the `on` state, and if changed invalidates
the `c1` node, and if turning off, the `c2` node, using `addRecalcNode(node)`.

`addRecalcNode(node)` adds a node to `recalclist` to be updated by the next loop of `recalcNodeList()`,
using `recalcHash` to avoid duplicates.

`getNodeGroup(node)` sets the global `group` array to an array containing every node connected to `node` using
the recursive `addNodeToGroup(node)`, which simplifies to:

```js
if (group.includes(node)) return;
group.push(node);
for (const t of nodes[node].c1c2s) {
  if (t.on) {
    addNodeToGroup(t.c1 === node ? t.c2 : t.c1);
  }
}
```

and `getNodeValue()` computes the state of the nodes in `group`:

```js
for (const n of group) {
  const node = nodes[n];
  if (node.pullup) return true;
  if (node.pulldown) return false;
  if (node.state) return true;
}
return false;
```

