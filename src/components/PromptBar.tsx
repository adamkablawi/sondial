"use client";

import { useState, type FormEvent } from "react";

interface PromptBarProps {
  onSubmit: (instruction: string) => Promise<void>;
  /** True once the room has an object — changes the ask from "what" to "what next". */
  hasObject: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function PromptBar({ onSubmit, hasObject, disabled, disabledReason }: PromptBarProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text || sending || disabled) return;

    setSending(true);
    setError(null);
    try {
      await onSubmit(text);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handle} className="flex flex-col gap-2">
      <div className="flex items-stretch gap-0 border border-rule focus-within:border-bone">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled || sending}
          placeholder={
            hasObject ? "Describe a change" : "Describe an object"
          }
          aria-label={hasObject ? "Describe a change" : "Describe an object"}
          className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[15px] text-bone placeholder:text-bone-faint focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!value.trim() || sending || disabled}
          className="shrink-0 border-l border-rule px-6 text-[14px] text-bone transition-colors enabled:hover:bg-bone enabled:hover:text-ground disabled:text-bone-faint"
        >
          {sending ? "Sending" : "Shape"}
        </button>
      </div>

      {(error || disabledReason) && (
        <p className={`text-[13px] ${error ? "text-rust" : "text-bone-faint"}`}>
          {error ?? disabledReason}
        </p>
      )}
    </form>
  );
}
