import { createRoom } from "./actions";
import { JoinForm } from "@/components/JoinForm";
import { ModelStage } from "@/components/ModelStage";

/**
 * The hero is the thing itself: a real object on a real stage that you can grab
 * and spin before you have signed up for anything.
 */
export default function LobbyPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[var(--shell)] flex-col px-6">
      <header className="py-6 text-[15px] text-bone-dim">Studio</header>

      <div className="grid flex-1 items-center gap-10 pb-16 lg:grid-cols-[1fr_0.9fr] lg:gap-16">
        <div className="max-w-[38ch]">
          <h1
            className="text-[clamp(2.5rem,6.5vw,4.25rem)] leading-[0.98] text-bone"
            style={{ fontStretch: "125%", fontWeight: 500 }}
          >
            Make one object, together.
          </h1>

          <p className="mt-6 text-[17px] leading-relaxed text-bone-dim">
            Open a room and share the code. Anyone in it can describe the object
            or ask for a change, and everyone watches the same thing take shape.
            When it&rsquo;s right, put it on the table in front of you.
          </p>

          <div className="mt-10 flex flex-col gap-5">
            <form action={createRoom}>
              <button
                type="submit"
                className="w-full border border-bone bg-bone px-6 py-3.5 text-[15px] text-ground transition-colors hover:bg-transparent hover:text-bone sm:w-auto"
              >
                Start a room
              </button>
            </form>

            <JoinForm />
          </div>
        </div>

        {/* The stage. Same component the room uses — this is not a mockup. */}
        <div className="relative aspect-square w-full border border-rule bg-ground-deep lg:aspect-auto lg:h-[min(62vh,560px)]">
          <ModelStage
            glbUrl="/samples/mock.glb"
            alt="A sample object you can rotate"
            className="h-full w-full"
          />
          <p className="pointer-events-none absolute bottom-4 left-4 text-[13px] text-bone-faint">
            Drag to turn it
          </p>
        </div>
      </div>
    </main>
  );
}
