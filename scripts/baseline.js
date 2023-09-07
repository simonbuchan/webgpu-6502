import names from "./6502/names.js";
import segments from "./6502/segments.js";
import transistors from "./6502/transistors.js";
import * as expected from "./6502/expected.js";

/** @return {never} */
function die(message) {
  console.error(message);
  process.exit(1);
}

const nodeNames = new Map(Object.entries(names).map(([k, v]) => [v, k]));

const invalidatedNodes = new Set();

class Node {
  constructor(id) {
    this.id = id;
    this.name = nodeNames.get(id) ?? `n${id}`;
    this.pullup = false;
    this.pulldown = false;
    this.state = false;
    this.gates = [];
    this.c1c2s = [];
  }

  setPullWithoutUpdate(value) {
    this.pullup = !!value;
    this.pulldown = !value;
    invalidatedNodes.add(this);
  }

  setPull(value) {
    this.setPullWithoutUpdate(value);
    update();
  }

  togglePull() {
    this.setPull(!this.state);
    return this.state;
  }
}

class Transistor {
  constructor(id, g, c1, c2) {
    this.id = id;
    this.g = g;
    this.c1 = c1;
    this.c2 = c2;
    this.on = false;
  }
}

const nodes = new Map();
for (const segment of segments) {
  const id = segment[0];
  if (!nodes.has(id)) {
    const node = new Node(id);
    node.pullup = segment[1] === "+";
    nodes.set(id, node);
  }
}

const ground = nodes.get(names.vss) ?? die(`power ${names.vss} not found`);
const power = nodes.get(names.vcc) ?? die(`ground ${names.vcc} not found`);

for (const tdef of transistors) {
  const g = nodes.get(tdef[1]) ?? die(`gate ${tdef[1]} not found`);
  let c1 = nodes.get(tdef[2]) ?? die(`c1 ${tdef[2]} not found`);
  let c2 = nodes.get(tdef[3]) ?? die(`c2 ${tdef[3]} not found`);
  if (c1 === power || c1 === ground) {
    [c1, c2] = [c2, c1];
  }
  const t = new Transistor(tdef[0], g, c1, c2);
  g.gates.push(t);
  c1.c1c2s.push(t);
  c2.c1c2s.push(t);
}

const res = nodes.get(names.res) ?? die(`reset ${names.res} not found`);
const rdy = nodes.get(names.rdy) ?? die(`ready ${names.rdy} not found`);
const so = nodes.get(names.so) ?? die(`so ${names.so} not found`);
const irq = nodes.get(names.irq) ?? die(`irq ${names.irq} not found`);
const nmi = nodes.get(names.nmi) ?? die(`nmi ${names.nmi} not found`);

const clk0 = nodes.get(names.clk0) ?? die(`clock ${names.clk0} not found`);
const rw = nodes.get(names.rw) ?? die(`rw ${names.rw} not found`);
const ab = [
  nodes.get(names.ab0) ?? die(`ab0 ${names.ab0} not found`),
  nodes.get(names.ab1) ?? die(`ab1 ${names.ab1} not found`),
  nodes.get(names.ab2) ?? die(`ab2 ${names.ab2} not found`),
  nodes.get(names.ab3) ?? die(`ab3 ${names.ab3} not found`),
  nodes.get(names.ab4) ?? die(`ab4 ${names.ab4} not found`),
  nodes.get(names.ab5) ?? die(`ab5 ${names.ab5} not found`),
  nodes.get(names.ab6) ?? die(`ab6 ${names.ab6} not found`),
  nodes.get(names.ab7) ?? die(`ab7 ${names.ab7} not found`),
  nodes.get(names.ab8) ?? die(`ab8 ${names.ab8} not found`),
  nodes.get(names.ab9) ?? die(`ab9 ${names.ab9} not found`),
  nodes.get(names.ab10) ?? die(`ab10 ${names.ab10} not found`),
  nodes.get(names.ab11) ?? die(`ab11 ${names.ab11} not found`),
  nodes.get(names.ab12) ?? die(`ab12 ${names.ab12} not found`),
  nodes.get(names.ab13) ?? die(`ab13 ${names.ab13} not found`),
  nodes.get(names.ab14) ?? die(`ab14 ${names.ab14} not found`),
  nodes.get(names.ab15) ?? die(`ab15 ${names.ab15} not found`),
];
const db = [
  nodes.get(names.db0) ?? die(`db0 ${names.db0} not found`),
  nodes.get(names.db1) ?? die(`db1 ${names.db1} not found`),
  nodes.get(names.db2) ?? die(`db2 ${names.db2} not found`),
  nodes.get(names.db3) ?? die(`db3 ${names.db3} not found`),
  nodes.get(names.db4) ?? die(`db4 ${names.db4} not found`),
  nodes.get(names.db5) ?? die(`db5 ${names.db5} not found`),
  nodes.get(names.db6) ?? die(`db6 ${names.db6} not found`),
  nodes.get(names.db7) ?? die(`db7 ${names.db7} not found`),
];

console.log("powering up");

ground.pulldown = true;
ground.pullup = false;
ground.state = false;
power.pulldown = false;
power.pullup = true;
power.state = true;

console.log("reset chip");
res.setPull(false);
clk0.setPull(false);
rdy.setPull(true);
so.setPull(false);
irq.setPull(true); // active low
nmi.setPull(true); // active low
expect(expected.initial);

console.log("update");
for (const node of nodes.values()) {
  if (node === power || node === ground) {
    continue;
  }
  invalidatedNodes.add(node);
}
update();

expect(expected.resetStart);

for (let i = 0; i < 8; i++) {
  console.log(`tick ${i} hi`);
  clk0.setPull(true);
  console.log(`tick ${i} lo`);
  clk0.setPull(false);
}
console.log("end reset");
setPull(names.res, true); // active low
expect(expected.resetEnd);

const memory = new Uint8Array(0x10000);
// prettier-ignore
memory.set([
  0xa9, 0x00,              // LDA #$00
  0x20, 0x10, 0x00,        // JSR $0010
  0x4c, 0x02, 0x00,        // JMP $0002

  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x40,

  0xe8,                    // INX
  0x88,                    // DEY
  0xe6, 0x0F,              // INC $0F
  0x38,                    // SEC
  0x69, 0x02,              // ADC #$02
  0x60                     // RTS
]);

for (let i = 0; i < 18; i++) {
  halfCycle();
}

expect(expected.ready);

console.log("free run");
let lastTick = performance.now();
let cycles = 0;
while (true) {
  halfCycle();
  halfCycle();
  cycles++;
  const now = performance.now();
  if (now - lastTick > 1000) {
    console.log(`Hz: ${cycles}`);
    cycles = 0;
    lastTick += 1000;
  }
}

function halfCycle() {
  if (!clk0.togglePull()) {
    if (rw.state) {
      const addr = readAddressBus();
      const data = memory[addr];
      writeDataBus(data);
    }
  } else {
    if (!rw.state) {
      const addr = readAddressBus();
      memory[addr] = readDataBus();
    }
  }
}

function readDataBus() {
  let value = 0;
  for (let i = 0; i < 8; i++) {
    if (db[i].state) {
      value |= 1 << i;
    }
  }
  return value;
}

function writeDataBus(value) {
  for (let i = 0; i < 8; i++) {
    db[i].setPullWithoutUpdate(value & (1 << i));
  }
  update();
}

function readAddressBus() {
  let value = 0;
  for (let i = 0; i < 16; i++) {
    if (ab[i].state) {
      value |= 1 << i;
    }
  }
  return value;
}

function expect(state) {
  let errors = false;
  for (let i = 0; i < state.length; i++) {
    const c = state[i];
    const node = nodes.get(i);
    switch (c) {
      case "l":
        if (node.state) {
          console.error(`node ${node.name} expected ${c}`);
          errors = true;
        }
        break;
      case "h":
        if (!node.state) {
          console.error(`node ${node.name} expected ${c}`);
          errors = true;
        }
        break;
      case "x":
        if (node) {
          console.error("node " + node.name + " should not exist");
        }
        break;
      case "v":
        if (node !== power) {
          console.error("node " + node.name + " should be power");
          errors = true;
        }
        break;
      case "g":
        if (node !== ground) {
          console.error("node " + node.name + " should be ground");
          errors = true;
        }
        break;
    }
  }

  if (errors) {
    process.exit(1);
  }
}

function setPull(id, value) {
  const node = nodes.get(id);
  node.setPull(value);
}

function update() {
  while (invalidatedNodes.size) {
    const list = Array.from(invalidatedNodes);
    invalidatedNodes.clear();
    for (const node of list) {
      if (node === power || node === ground) {
        continue;
      }

      const group = new Set([node]);

      for (const node of group) {
        if (node === power || node === ground) {
          continue;
        }
        for (const transistor of node.c1c2s) {
          if (transistor.on) {
            const other =
              node === transistor.c1 ? transistor.c2 : transistor.c1;
            group.add(other);
          }
        }
      }

      let state = false;
      if (group.has(ground)) {
        state = false;
      } else if (group.has(power)) {
        state = true;
      } else {
        for (const node of group) {
          if (node.pullup) {
            state = true;
            break;
          }
          if (node.pulldown) {
            state = false;
            break;
          }
          if (node.state) {
            state = true;
            break;
          }
        }
      }

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
          if (!transistor.on) {
            invalidatedNodes.add(transistor.c2);
          }
        }
      }
    }
  }
}
