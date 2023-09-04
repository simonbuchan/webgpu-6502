import fs from "node:fs";
import zlib from "node:zlib";

import * as poly2tri from "poly2tri";

import segments from "./segments.js";
import transistors from "./transistors.js";

// segments is an array of polygons, each of which is an array of:
//   [node, pull ("+" or "-"), layer, x0, y0, ...]
// transistors is an array of logical transistors, each of which is an array of:
//   [name, gate, c1, c2, bb, ??]
// name is just `t${index}`, not actually used
// bb is the bounding box, not currently needed
// last value doesn't seem to be used, not sure what the format is.
//
// Create output data file, with structure:
// {
//   header: {
//     instancesOffset: u32,
//     verticesOffset: u32,
//     indicesOffset: u32,
//     nodesOffset: u32,
//     transistorsOffset: u32,
//   }
//   polygons: {
//     instances: array of {
//       nodeId: u16,
//       layer: u16,
//       indexCount: u16,
//       firstIndex: u32,
//       baseVertex: u32,
//     }
//     vertices: array of { position: vec2<u16> }
//     indices: array of { index: u16 }
//   }
//   simulation: {
//     nodes: array of { data: u32 }
//     transistors: array of { gate: u16, c1: u16, c2: u16 }
//   }
// }

const headerSize = 5 * 4;
const instanceSize = 2 + 2 + 2 + 4 + 4 + 2;
const coordSize = 2;
const indexSize = 2;

const instanceCount = segments.length;
// not exact as we filter out some points
const maxCoordCount = segments.reduce((acc, s) => acc + (s.length - 3), 0);
// euler: number of triangles for a polygon is (number of points - 2)
// so total number of indices is (total number of points - 2 * number of polygons) * 3
const maxIndexCount = (maxCoordCount / 2 - 2 * instanceCount) * 3;

// polygons
let instanceOffset = 0;
const instances = new DataView(new ArrayBuffer(instanceCount * instanceSize));
let coordCount = 0;
const vertices = new Uint16Array(maxCoordCount);
let indexCount = 0;
const indices = new Uint16Array(maxIndexCount);

// simulation
const nodePullUp = new Map();
const transistorData = new Uint32Array(transistors.length * 2);

let nodeMax = 0;
let degenerateCount = 0;

for (const [node, pull, layer, ...path] of segments) {
  if (pull === "+") {
    nodePullUp.set(node, true);
  } else {
    nodePullUp.set(node, false);
  }
  nodeMax = Math.max(nodeMax, node);

  const points = Array.from(
    { length: path.length / 2 },
    (_, i) => new poly2tri.Point(path[i * 2], path[i * 2 + 1]),
  );
  // remove repeated points
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    if (p0.x === p1.x && p0.y === p1.y) {
      points.splice(i, 1);
      i--;
    }
  }
  // remove colinear points
  for (let i = 0; i < points.length; i++) {
    const p0 = points[(i + points.length - 1) % points.length];
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const a = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const b = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const p1Angle = Math.abs(a - b);
    if (p1Angle < 0.001 || Math.abs(p1Angle - Math.PI) < 0.001) {
      points.splice(i, 1);
      i--;
    }
  }
  if (points.length < 3) {
    degenerateCount++;
    console.log("  degenerate: " + path.join(" "));
    continue;
  }

  const ctx = new poly2tri.SweepContext(points);
  ctx.triangulate();
  const triangles = ctx.getTriangles();

  const baseVertex = coordCount / 2;
  for (const point of points) {
    vertices[coordCount++] = point.x;
    vertices[coordCount++] = point.y;
  }

  const firstIndex = indexCount;
  for (const triangle of triangles) {
    indices[indexCount++] = points.indexOf(triangle.getPoint(0));
    indices[indexCount++] = points.indexOf(triangle.getPoint(1));
    indices[indexCount++] = points.indexOf(triangle.getPoint(2));
  }

  instances.setUint16(instanceOffset, node, true);
  instances.setUint16(instanceOffset + 2, layer, true);
  instances.setUint16(instanceOffset + 4, indexCount - firstIndex, true);
  instances.setUint32(instanceOffset + 6, firstIndex, true);
  instances.setUint32(instanceOffset + 10, baseVertex, true);
  instanceOffset += instanceSize;
}

console.log("nodeMax: " + nodeMax);

const HI = 2;
const PULL_HI = 8;
const INPUT = 16;
const nodeData = new Uint32Array(nodeMax + 1);
for (const [node, pull] of nodePullUp) {
  // Set some nodes as pullup like the JS does. Not sure why.
  // Maybe something to do with depletion vs enhancement transistors?
  nodeData[node] = pull ? HI | PULL_HI | INPUT : 0;
}
const nodeInCount = {};
const nodeOutCount = {};

let transistorIndex = 0;
for (const [name, gate, c1, c2] of transistors) {
  if (gate > nodeMax || c1 > nodeMax || c2 > nodeMax) {
    console.log("  invalid transistor node reference: " + name);
  }
  // pack into u32 values for the shader
  transistorData[transistorIndex++] = gate;
  transistorData[transistorIndex++] = (c1 << 16) | c2;

  nodeInCount[c1] ??= 0;
  nodeInCount[c1] += 1;
  nodeInCount[c2] ??= 0;
  nodeInCount[c2] += 1;
  nodeOutCount[gate] ??= 0;
  nodeOutCount[gate] += 1;
}

console.table(
  Object.entries(nodeInCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10),
  ["0", "1"],
);
console.table(
  Object.entries(nodeOutCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10),
  ["0", "1"],
);

const instancesDataOffset = headerSize;
const verticesDataOffset = instancesDataOffset + instanceCount * instanceSize;
const indicesDataOffset = verticesDataOffset + coordCount * coordSize;
const nodeDataOffset = indicesDataOffset + indexCount * indexSize;
const transistorsDataOffset = nodeDataOffset + nodeData.byteLength;
const dataSize = transistorsDataOffset + transistorData.byteLength;

const data = new Uint8Array(dataSize);
data.set(
  new Uint8Array(
    Uint32Array.of(
      instancesDataOffset,
      verticesDataOffset,
      indicesDataOffset,
      nodeDataOffset,
      transistorsDataOffset,
    ).buffer,
  ),
  0,
);
data.set(new Uint8Array(instances.buffer), instancesDataOffset);
data.set(
  new Uint8Array(vertices.buffer, 0, coordCount * coordSize),
  verticesDataOffset,
);
data.set(
  new Uint8Array(indices.buffer, 0, indexCount * indexSize),
  indicesDataOffset,
);
data.set(new Uint8Array(transistorData.buffer), transistorsDataOffset);

fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/data.gz", zlib.gzipSync(data));
