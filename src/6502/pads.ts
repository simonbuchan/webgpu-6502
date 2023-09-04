// 6502 pad nodes, in pinout order:
export const vss = 558; // gnd
export const rdy = 89; // ready
export const clk1out = 1163;
export const irq = 103; // interrupt request
export const nmi = 1297; // non maskable interrupt
export const sync = 539;
export const vcc = 657; // 5v

// address bus
export const ab = [
  268, 451, 1340, 211, 435, 736, 887, 1493, 230, 148, 1443, 399, 1237, 349, 672,
  195,
];
// data bus
export const db = [
  1005, // db0
  82, // db1
  945, // db2
  650, // db3
  1393, // db4
  175, // db5
  1591, // db6
  1349, // db7
];
export const rw = 1156; // read/not write
export const clk0 = 1171;
export const so = 1672; // set overflow
export const clk2out = 421;
export const res = 159; // reset
