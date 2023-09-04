import * as pads from "./6502/pads.js";

export let nodeData: Uint32Array;

export function setNodeDataBuffer(buffer: ArrayBuffer) {
  nodeData = new Uint32Array(buffer);
}

// node state: connected to ground or power.
// neither is floating, both is short circuit.
const LO = 1;
const HI = 2;

// directly connected to ground or power
const PULL_LO = 4;
const PULL_HI = 8;

// input nodes are not cleared on update
const INPUT = 16;

export function readAddressBus() {
  let address = 0;
  for (let i = 0; i < 16; i++) {
    if (nodeIsHigh(pads.ab[i])) {
      address |= 1 << i;
    }
  }
  return address;
}

export function readDataBus() {
  let data = 0;
  for (let i = 0; i < 8; i++) {
    if (nodeIsHigh(pads.db[i])) {
      data |= 1 << i;
    }
  }
  return data;
}

export function writeDataBus(data: number) {
  for (let i = 0; i < 8; i++) {
    nodeData[pads.db[i]] = (data & (1 << i)) !== 0 ? HI : LO;
  }
}

export function nodeIsHigh(node: number) {
  return (nodeData[node] & HI) !== 0;
}

export function pullNode(node: number, value: boolean) {
  nodeData[node] = value ? PULL_HI | INPUT : PULL_LO | INPUT;
}

export function initNodeData() {
  for (let i = 0; i < nodeData.length; i++) {
    nodeData[i] &= ~(HI | LO);
  }

  // voltage reference
  pullNode(pads.vss, false);
  pullNode(pads.vcc, true);

  // initial state
  pullNode(pads.res, false);
  pullNode(pads.clk0, false);
  pullNode(pads.rdy, true);
  pullNode(pads.so, false);
  pullNode(pads.irq, true); // active low
  pullNode(pads.nmi, true); // active low
}
