@group(1) @binding(0)
var<uniform> u_view: mat2x3f;

struct Transistor {
  gate: u32,
  c1_c2: u32,
}

// states for the node being connected to power or ground
// neither is floating, both is a short-circut
const LO = 1u;
const HI = 2u;

// States from before the last input
const LAST_LO = 4u;
const LAST_HI = 8u;

const CHANGED = 32u;
const NODE_GATE = 64u;
const NODE_C1C2 = 128u;

@group(0) @binding(0)
var<storage> s_node_inputs: array<u32>;
@group(0) @binding(1)
var<storage, read_write> s_nodes: array<atomic<u32>>;
@group(0) @binding(2)
var<storage> s_transistors: array<Transistor>;

const LAYER_COLORS = array<vec4f, 6>(
    vec4f(0.6, 0.6, 0.5, 0.4), // metal
    vec4f(0.6, 0.6, 0.0, 1.0), // switched diffusion
    vec4f(0.6, 0.0, 0.6, 1.0), // input diode
    vec4f(0.3, 0.6, 0.3, 1.0), // grounded diffusion
    vec4f(0.6, 0.3, 0.3, 1.0), // powered diffusion
    vec4f(0.4, 0.2, 0.5, 1.0), // polysilicon
);

const STATE_COLORS = array<vec4f, 8>(
    vec4f(0.0, 0.0, 0.0, 0.0), // floating
    vec4f(0.0, 0.7, 0.0, 0.4), // low
    vec4f(1.0, 0.0, 0.25, 0.4), // high
    vec4f(1.0, 0.0, 0.4, 0.4), // short
    // changed
    vec4f(1.0, 1.0, 1.0, 0.8), // floating
    vec4f(0.5, 1.0, 0.5, 0.8), // low
    vec4f(1.0, 0.0, 0.5, 0.8), // high
    vec4f(1.0, 0.0, 0.4, 0.8), // short
);

const HOVER_COLORS = array<vec4f, 4>(
    vec4f(0.0, 0.0, 0.0, 0.0),
    vec4f(1.0, 1.0, 0.0, 0.6), // gate
    vec4f(0.0, 0.0, 1.0, 0.6), // c1c2
    vec4f(1.0, 0.0, 0.0, 0.6), // both!?
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
    let highlight = select(0u, 4u, (state & CHANGED) != 0);

    let layer_color = LAYER_COLORS[in.layer];

    let state_color = STATE_COLORS[(state & 3) | highlight];

    let hover_color = HOVER_COLORS[state >> 6];

    // alpha blend the layer and state color
    var out = FragmentOutput();
    out.color = mix(
        mix(layer_color, state_color, state_color.a),
        hover_color,
        hover_color.a);
    out.node = (in.node << 16) | (in.layer << 8) | state;
    return out;
}

@compute @workgroup_size(256, 1, 1)
fn cs_hover_update(
    @builtin(global_invocation_id)
    gid: vec3u,
) {
    let node_index = gid.x;
    let input = s_node_inputs[node_index] & (NODE_GATE | NODE_C1C2);
    atomicAnd(&s_nodes[node_index], ~(NODE_GATE | NODE_C1C2));
    atomicOr(&s_nodes[node_index], input);
}

@compute @workgroup_size(256, 1, 1)
fn cs_input(
    @builtin(global_invocation_id)
    gid: vec3u,
) {
    let node_index = gid.x;
    let input = s_node_inputs[node_index] & 3;
    let node = &s_nodes[node_index];
    if (input != 0) {
        atomicStore(node, input);
    } else {
        // LO|HI => LAST_LO|HI
        atomicStore(node, (atomicLoad(node) & 3) << 2);
    }
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
    let gate_state = atomicLoad(&s_nodes[gate]);
    // use last input's value if we don't have a current value
    let gate_last = (gate_state >> 2) & 3;
    let gate_this = gate_state & 3;
    let gate_value = select(gate_this, gate_last, gate_this == 0);
    if ((gate_value & HI) == 0) {
        return;
    }

   // if the gate is on, then the source is connected to the drain
   // and the circut is closed. I think in theory the source to gate
   // should act as a diode, but I can't find good information about
   // this, and the JS behavior didn't depend on it.
   let c1 = &s_nodes[c1i];
   let c2 = &s_nodes[c2i];

   let v1 = atomicLoad(c1) & 3;
   let v2 = atomicLoad(c2) & 3;

   atomicOr(c1, v2);
   atomicOr(c2, v1);
}
