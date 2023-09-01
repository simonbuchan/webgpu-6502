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

struct Attributes {
    @builtin(vertex_index) index: u32,
    @location(0) node: u32,
    @location(1) layer: u32,
    @location(2) position: vec2f,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @interpolate(flat)
    @location(0) layer: u32,
}

@vertex
fn vs_poly(a: Attributes) -> VertexOutput {
    var out = VertexOutput();
//    out.position = vec4f(a.position / CHIP_SIZE, 0.0, 1.0);
    out.position = vec4f(a.position / CHIP_SIZE * 2.0 - 1.0, 0.0, 1.0);
    out.layer = a.layer;
    return out;
}

@fragment
fn fs_poly(in: VertexOutput) -> @location(0) vec4f {
    return LAYER_COLORS[in.layer];
}
