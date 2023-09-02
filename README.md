# WebGPU 6502 Simulator

This reimplements the [visual 6502 JS simulator](https://github.com/trebonian/visual6502) with WebGPU.

It is automatically deployed to [Github Pages](https://simonbuchan.github.io/webgpu-6502/).

It is currently in progress:
- [x] Load polygons and draw with WebGPU
- [ ] Load transistor definitions and simulate with WebGPU
- [ ] Implement a simple 6502 environment (voltage, clock, RAM, etc.)
- [ ] Display transistor state
- [ ] Add "Kiosk" UI to control simulation
- [ ] Add expert UI

And future work like a memory viewer, debugger, and assembler could be neat.

## Simulation

See my reverse-engineered documentation of the JS simulator [here](./docs/original-simulator.md).
