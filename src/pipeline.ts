import { device, format } from "./context.js";
import code from "./shader.wgsl?raw";
import * as Data from "./data.js";

const module = device.createShaderModule({
  code,
});

export const bindGroupLayout = device.createBindGroupLayout({
  entries: [
    {
      // s_nodes
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
      buffer: {
        type: "storage",
      },
    },
    {
      // s_transistors
      binding: 1,
      visibility: 0,
      buffer: {
        type: "read-only-storage",
      },
    },
  ],
});

const pipelineLayout = device.createPipelineLayout({
  bindGroupLayouts: [bindGroupLayout],
});

export const renderPipeline = await device.createRenderPipelineAsync({
  layout: pipelineLayout,
  vertex: {
    module,
    entryPoint: "vs_poly",
    buffers: [
      {
        stepMode: "instance",
        arrayStride: Data.instanceStride,
        attributes: [
          {
            // nodeId, layer
            shaderLocation: 1,
            offset: 0,
            format: "uint16x2",
          },
        ],
      },
      {
        stepMode: "vertex",
        arrayStride: Data.vertexStride,
        attributes: [
          {
            // position
            shaderLocation: 0,
            offset: 0,
            format: "uint16x2",
          },
        ],
      },
    ],
  },
  fragment: {
    module,
    entryPoint: "fs_poly",
    targets: [
      {
        format,
        blend: {
          color: {
            srcFactor: "src-alpha",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
          alpha: {
            srcFactor: "src-alpha",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
        },
      },
    ],
  },
  primitive: {
    topology: "triangle-list",
  },
});

export const stepPipeline = await device.createComputePipelineAsync({
  layout: pipelineLayout,
  compute: {
    module,
    entryPoint: "cs_step",
  },
});
