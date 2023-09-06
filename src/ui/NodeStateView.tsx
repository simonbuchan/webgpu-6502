import { type NodeState } from "./state";

export default function NodeStateView(props: { state: NodeState }) {
  return (
    <div>
      <div>Weak: {props.state.weak}</div>
      <div>Strong: {props.state.strong}</div>
      {props.state.input && <div>Input</div>}
      {props.state.changed && <div>Changed</div>}
    </div>
  );
}
