import { type NodeState } from "./state";

export default function NodeStateView(props: { state: NodeState }) {
  return (
    <div>
      <div>Charge: {props.state.charge}</div>
      {props.state.changed && <div>Changed</div>}
    </div>
  );
}
