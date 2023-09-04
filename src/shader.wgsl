@group(1) @binding(0)
var<uniform> u_view: mat2x3f;

const LAYER_COLORS = array<vec4f, 7>(
    vec4f(0.5, 0.5, 0.75, 0.4), // metal
    vec4f(1.0, 1.0, 0.0, 1.0), // switched diffusion
    vec4f(1.0, 0.0, 1.0, 1.0), // input diode
    vec4f(0.3, 1.0, 0.3, 1.0), // grounded diffusion
    vec4f(1.0, 0.3, 0.3, 1.0), // powered diffusion
    vec4f(0.5, 0.1, 0.75, 1.0), // polysilicon
    vec4f(0.5, 0.0, 1.0, 0.75), // ???
);

const STATE_COLORS = array<vec4f, 4>(
    vec4f(0.0, 0.0, 0.0, 0.0), // floating
    vec4f(0.0, 0.0, 0.7, 0.4), // low
    vec4f(1.0, 0.0, 0.25, 0.4), // high
    vec4f(1.0, 0.0, 0.4, 0.4), // short
);

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
    out.position = vec4f(vec3f(vec2f(a.position), 1) * u_view, 0.0, 1.0);
    out.node = a.node_layer.x;
    out.layer = a.node_layer.y;
    return out;
}

struct FragmentOutput {
    @location(0)
    color: vec4f,
    @location(1)
    node: u32,
}

@fragment
fn fs_poly(in: VertexOutput) -> FragmentOutput {
    let state = atomicLoad(&s_nodes[in.node]);

    let layer_color = LAYER_COLORS[in.layer];
    let state_color = STATE_COLORS[(state | (state >> 2)) & 3];
    // alpha blend the layer and state color
    var out = FragmentOutput();
    out.color = layer_color * (1.0 - state_color.a) + state_color * state_color.a;
    out.node = (in.node << 8) | state;
    return out;
}

struct Transistor {
  gate: u32,
  c1_c2: u32,
}

// states for the node being connected to power or ground
// neither is floating, both is a short-circut
const LO = 1u;
const HI = 2u;

// directly connected to power or ground
const PULL_LO = 4u;
const PULL_HI = 8u;

// not cleared by cs_weaken
const INPUT = 16u;

@group(0) @binding(0)
var<storage, read_write> s_nodes: array<atomic<u32>>;
@group(0) @binding(1)
var<storage> s_transistors: array<Transistor>;

@compute @workgroup_size(256, 1, 1)
fn cs_weaken(
    @builtin(global_invocation_id)
    gid: vec3u,
) {
    let node_index = gid.x;
    let node = &s_nodes[node_index];
    let state = atomicLoad(node);
    let input = state & INPUT;
    let pull_strong = (state >> 2) & 3;
    let pull_weak = state & 3;
    let pull_new = select(pull_weak, pull_strong, pull_strong != 0);
    let update = pull_new | select(0, pull_strong << 2, input != 0) | input;
    atomicStore(node, update);
}

@compute @workgroup_size(256, 1, 1)
fn cs_update(
    @builtin(global_invocation_id)
    gid: vec3u,
) {
    let transistor_index = gid.x;

    let t = s_transistors[transistor_index];
    let c1i = extractBits(t.c1_c2, 0, 16);
    let c2i = extractBits(t.c1_c2, 16, 16);

    // can use the results of these to detect updates, but I don't have
    // a good approach to handle looping until *all* updates are done
    // entirely in the shader.
    // For now, just run a bunch of times, and JS will detect if it stops changing.
//    for (var i = 0; i < 1000; i++) {
        propagate_transistor(t.gate, c1i, c2i);
//    }
}

fn propagate_transistor(gate: u32, c1i: u32, c2i: u32) {
    // check for a weak or strong pull high
    let on = (atomicLoad(&s_nodes[gate]) & (HI | PULL_HI)) != 0;
    if (!on) {
        return;
    }
    let c1 = &s_nodes[c1i];
    let c2 = &s_nodes[c2i];

   // if the gate is on, then the source is connected to the drain
   // and the circut is closed. I think in theory the source to gate
   // should act as a diode, but I can't find good information about
   // this, and the JS behavior didn't depend on it.

   let v1 = atomicLoad(c1);
   let v2 = atomicLoad(c2);

   // get combined weak and strong pulls
   let old_pull = (v1 | v2) & 0xF;

   // if there's a strong pull (a connection to an external pin),
   // then override the weak pull
   let strong_pull = old_pull >> 2;
   let new_pull = select(
     old_pull,
     (strong_pull << 2) | strong_pull,
     strong_pull != 0);

   atomicOr(c1, new_pull);
   atomicOr(c2, new_pull);
}
