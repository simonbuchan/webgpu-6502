function die(message: string): never {
  throw new Error(message);
}

export const adapter =
  (await navigator.gpu.requestAdapter()) ?? die("No adapter found");
export const device = (await adapter.requestDevice()) ?? die("No device found");
export const format = navigator.gpu.getPreferredCanvasFormat();
export const canvas = document.getElementById("canvas") as HTMLCanvasElement;
export const context = canvas.getContext("webgpu") ?? die("No context found");

console.log(await adapter.requestAdapterInfo());

context.configure({ device, format });

export function bufferFrom(data: ArrayBuffer, usage: number): GPUBuffer {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usage | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}
