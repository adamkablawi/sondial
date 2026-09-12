"use client";

export default function RoomError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6">
      <div className="max-w-[38ch] text-center">
        <h1 className="text-[2rem] leading-tight text-bone" style={{ fontStretch: "125%", fontWeight: 500 }}>
          This room won&rsquo;t load.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-bone-dim">
          The connection to the studio dropped. The room and everything in it is
          still there.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-8 border border-rule px-6 py-3 text-[15px] text-bone transition-colors hover:border-bone"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
