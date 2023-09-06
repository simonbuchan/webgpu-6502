import type { JSX } from "solid-js";

export default function Button(props: JSX.IntrinsicElements["button"]) {
  return (
    <button
      {...props}
      class="rounded bg-blue-500 px-2 py-1 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
    />
  );
}
