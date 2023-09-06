import * as pads from "./6502/pads";
import { HI, INPUT, LO, nodeData, PULL_HI, PULL_LO } from "./data/data";

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

const memoryPages = [
  // zero-page
  new Uint8Array(256),
  // stack
  new Uint8Array(256),
];
// vectors
memoryPages[0xff] = new Uint8Array(256);
// reset vector
memoryPages[0xff][0xfc] = 0x00;
memoryPages[0xff][0xfd] = 0x00;

// example program:
// prettier-ignore
memoryPages[0].set([
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

export function memoryRead(address: number) {
  return memoryPages[address >> 8][address & 0xff];
}

export function memoryWrite(address: number, data: number) {
  const page = memoryPages[address >> 8];
  if (page) {
    page[address & 0xff] = data;
  }
}
