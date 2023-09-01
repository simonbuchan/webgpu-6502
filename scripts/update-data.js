import fs from "node:fs";

import * as poly2tri from "poly2tri";

import segments from "./segments.js";

// segments is an array of polygons, each of which is an array of:
//   [node, pull ("+" or "-"), layer, x0, y0, ...]

const indirect = [];
const instances = [];
const vertices = [];
const indices = [];

let degenerateCount = 0;

for (const [node, pull, layer, ...path] of segments) {
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

  const instanceOffset = instances.length / 2;
  instances.push(node, layer);

  const vertexOffset = vertices.length / 2;
  for (const point of points) {
    vertices.push(point.x, point.y);
  }

  const indexOffset = indices.length;
  for (const triangle of triangles) {
    const i0 = points.indexOf(triangle.getPoint(0));
    const i1 = points.indexOf(triangle.getPoint(1));
    const i2 = points.indexOf(triangle.getPoint(2));
    indices.push(i0, i1, i2);
  }

  // defined by WebGPU drawIndexedIndirect:
  // indexCount, instanceCount, firstIndex, baseVertex, baseInstance
  indirect.push(
    indices.length - indexOffset,
    1,
    indexOffset,
    vertexOffset,
    instanceOffset,
  );
}

console.log("polygons: " + instances.length);
console.log("degenerateCount: " + degenerateCount);

// create data file:
// File: { Header, Indirect, Instances, Vertices, Indices }
//   Header: { indirectOffset: u32, instancesOffset: u32, verticesOffset: u32, indicesOffset: u32 }
//   Indirect: array of { indexCount: u32, instanceCount: u32, firstIndex: u32, baseVertex: u32, baseInstance: u32 }
//   Instances: array of { nodeId: u32, layer: u32 }
//   Vertices: array of { position: vec2f }
//   Indices: array of { index: u32 }

fs.mkdirSync("public", { recursive: true });

const indirectOffset = 4 * 4;
const indirectData = new Uint32Array(indirect).buffer;
const instancesOffset = indirectOffset + indirectData.byteLength;
const instancesData = new Uint32Array(instances).buffer;
const verticesOffset = instancesOffset + instancesData.byteLength;
const vertexData = new Float32Array(vertices).buffer;
const indicesOffset = verticesOffset + vertexData.byteLength;
const indexData = new Uint32Array(indices).buffer;

const headerData = new Uint32Array([
  indirectOffset,
  instancesOffset,
  verticesOffset,
  indicesOffset,
]).buffer;

const data = new Uint8Array(
  headerData.byteLength +
    indirectData.byteLength +
    instancesData.byteLength +
    vertexData.byteLength +
    indexData.byteLength,
);
data.set(new Uint8Array(headerData), 0);
data.set(new Uint8Array(indirectData), indirectOffset);
data.set(new Uint8Array(instancesData), instancesOffset);
data.set(new Uint8Array(vertexData), verticesOffset);
data.set(new Uint8Array(indexData), indicesOffset);
fs.writeFileSync("public/data", data);
