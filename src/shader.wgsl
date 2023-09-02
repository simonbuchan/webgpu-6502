const CHIP_SIZE = 10000.0;

const SCALE = vec2f(CHIP_SIZE / 2.0, CHIP_SIZE / 2.0);
const OFFSET = vec2f(0.0, 0.0);

const LAYER_COLORS = array<vec4f, 7>(
    vec4f(0.5, 0.5, 0.75, 0.4), // metal
    vec4f(1.0, 1.0, 0.0, 1.0), // switched diffusion
    vec4f(1.0, 0.0, 1.0, 1.0), // input diode
    vec4f(0.3, 1.0, 0.3, 1.0), // grounded diffusion
    vec4f(1.0, 0.3, 0.3, 1.0), // powered diffusion
    vec4f(0.5, 0.1, 0.75, 1.0), // polysilicon
    vec4f(0.5, 0.0, 1.0, 0.75), // ???
);

const OVERLAY_HIGH = vec4f(1.0, 0.0, 0.25, 0.4);

struct Attributes {
    @location(0) position: vec2u,
    @location(1) node_layer: vec2u,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @interpolate(flat) @location(0) layer: u32,
    @interpolate(flat) @location(1) node: u32,
}

@vertex
fn vs_poly(a: Attributes) -> VertexOutput {
    var out = VertexOutput();
    out.position = vec4f(vec2f(a.position) / CHIP_SIZE * 2.0 - 1.0, 0.0, 1.0);
    out.node = a.node_layer.x;
    out.layer = a.node_layer.y;
    return out;
}

@fragment
fn fs_poly(in: VertexOutput) -> @location(0) vec4f {
    var color = LAYER_COLORS[in.layer];
    color = mix(
      color,
      color * (1.0 - OVERLAY_HIGH.a) + OVERLAY_HIGH,
      f32(node_value(in.node))
    );
    return color;
}

struct Transistor {
  gate: u32,
  c1_c2: u32,
}

@group(0) @binding(0)
var<storage, read_write> s_nodes: array<atomic<u32>>;
@group(0) @binding(1)
var<storage> s_transistors: array<Transistor>;

fn node_value(node: u32) -> bool {
  return (atomicLoad(&s_nodes[node]) & 1) != 0;
}

@compute @workgroup_size(256, 1, 1)
fn cs_step(
    @builtin(global_invocation_id)
    index: vec3u,
) {
    // for now, just toggle the node state
    atomicXor(&s_nodes[index.x], 1u);
}
