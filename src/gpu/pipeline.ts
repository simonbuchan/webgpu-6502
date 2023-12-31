import { device, format } from "./context";
import code from "./shader.wgsl?raw";
import * as Data from "../data/load";

const module = device.createShaderModule({
  code,
});

export const viewBindGroupLayout = device.createBindGroupLayout({
  entries: [
    {
      // u_view
      binding: 0,
      visibility: GPUShaderStage.VERTEX,
      buffer: {
        type: "uniform",
      },
    },
  ],
});

export const stateBindGroupLayout = device.createBindGroupLayout({
  entries: [
    {
      // s_node_inputs
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: "read-only-storage",
      },
    },
    {
      // s_nodes
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
      buffer: {
        type: "storage",
      },
    },
    {
      // s_transistors
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: "read-only-storage",
      },
    },
  ],
});

export const renderPipeline = await device.createRenderPipelineAsync({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [stateBindGroupLayout, viewBindGroupLayout],
  }),
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
      {
        format: "r32uint",
      },
    ],
  },
  primitive: {
    topology: "triangle-list",
  },
});

const stateLayout = device.createPipelineLayout({
  bindGroupLayouts: [stateBindGroupLayout],
});

export const hoverUpdatePipeline = await device.createComputePipelineAsync({
  layout: stateLayout,
  compute: {
    module,
    entryPoint: "cs_hover_update",
  },
});

export const inputPipeline = await device.createComputePipelineAsync({
  layout: stateLayout,
  compute: {
    module,
    entryPoint: "cs_input",
  },
});

export const updatePipeline = await device.createComputePipelineAsync({
  layout: stateLayout,
  compute: {
    module,
    entryPoint: "cs_update",
  },
});
