import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-6">
      <div className="max-w-[34ch] text-center">
        <h1 className="text-[2rem] leading-tight text-bone" style={{ fontStretch: "125%", fontWeight: 500 }}>
          That room isn&rsquo;t here.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-bone-dim">
          The code may be mistyped, or the room was never made.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block border border-rule px-6 py-3 text-[15px] text-bone transition-colors hover:border-bone"
        >
          Start a room
        </Link>
      </div>
    </main>
  );
}
