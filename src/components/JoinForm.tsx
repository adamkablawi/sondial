"use client";

import { useActionState } from "react";
import { joinRoom } from "@/app/actions";

export function JoinForm() {
  const [state, action, pending] = useActionState(joinRoom, { error: "" });

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex max-w-sm items-stretch border border-rule focus-within:border-bone">
        <input
          name="code"
          placeholder="have a code?"
          aria-label="Room code"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] tracking-wide text-bone placeholder:text-bone-faint focus:outline-none"
          style={{ fontFamily: "var(--font-mono), monospace" }}
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 border-l border-rule px-5 text-[14px] text-bone transition-colors enabled:hover:bg-bone enabled:hover:text-ground disabled:text-bone-faint"
        >
          {pending ? "Opening" : "Join"}
        </button>
      </div>

      {state.error && <p className="text-[13px] text-rust">{state.error}</p>}
    </form>
  );
}
