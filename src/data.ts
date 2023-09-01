// load and parse data file created by scripts/update-data.

export async function load(): Promise<DataFile> {
  return parseData(await fetchData());
}

export async function fetchData(): Promise<ArrayBuffer> {
  const dataRes = await fetch("data.gz");
  if (dataRes.headers.get("Content-Encoding") === "gzip") {
    console.debug(
      "data is served with content-encoding, assuming browser has decompressed it",
    );
    return await dataRes.arrayBuffer();
  }

  console.debug(
    "data is not served with content-encoding, decompressing manually",
  );
  return await new Response(
    dataRes.body!.pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer();
}

// data file format:
// {
//   header: {
//     instancesOffset: u32,
//     verticesOffset: u32,
//     indicesOffset: u32,
//     transistorsOffset: u32,
//   }
//   polygons: {
//     instances: array of {
//       nodeId: u16,
//       layer: u16,
//       indexCount: u16,
//       firstIndex: u32,
//       baseVertex: u32,
//       _pad: u16,
//     }
//     vertices: array of { position: vec2<u16> }
//     indices: array of { index: u16 }
//   }
//   transistors: array of { gate: u16, c1: u16, c2: u16 }
// }

export const instanceStride = 2 + 2 + 2 + 4 + 4 + 2;
export const vertexStride = 4;
export const indexFormat = "uint16";

export interface Draw {
  indexCount: number;
  firstIndex: number;
  baseVertex: number;
}

export interface DataFile {
  polygons: {
    draws: Draw[];
    instances: ArrayBuffer;
    vertices: ArrayBuffer;
    indices: ArrayBuffer;
  };
  transistors: ArrayBuffer;
}

export function parseData(data: ArrayBuffer): DataFile {
  const header = new Uint32Array(data, 0, 4);
  const [instancesOffset, verticesOffset, indicesOffset, transistorsOffset] =
    header;

  const instances = data.slice(instancesOffset, verticesOffset);
  const vertices = data.slice(verticesOffset, indicesOffset);
  const indices = data.slice(indicesOffset, transistorsOffset);
  const transistors = data.slice(transistorsOffset);

  const instanceCount = instances.byteLength / instanceStride;
  const draws = Array.from({ length: instanceCount }, (_, i) => {
    const view = new DataView(instances, i * instanceStride, instanceStride);
    return {
      indexCount: view.getUint16(4, true),
      firstIndex: view.getUint32(6, true),
      baseVertex: view.getUint32(10, true),
    };
  });

  return {
    polygons: {
      draws,
      instances,
      vertices,
      indices,
    },
    transistors,
  };
}
