import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { slugify } from "@/lib/identity";
import { renderDesignState, seedDesignState } from "@/lib/design-state";

export const maxDuration = 60;

/** GET -> every room, newest first, for the home page list. */
export async function GET() {
  try {
    const rooms = await db.room.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true } },
        _count: { select: { participants: true, messages: true } },
      },
    });

    const versionCounts = await db.objectVersion.groupBy({
      by: ["projectId"],
      _count: { _all: true },
    });
    const byProject = new Map(versionCounts.map((v) => [v.projectId, v._count._all]));

    return NextResponse.json({
      rooms: rooms.map((r) => ({
        slug: r.slug,
        name: r.name,
        createdAt: r.createdAt.toISOString(),
        participants: r._count.participants,
        messages: r._count.messages,
        versions: byProject.get(r.project.id) ?? 0,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST { name, brief, constraints? } -> { roomSlug }
 *
 * Seeds v1 as the brief itself: full design state, no geometry yet. Generated
 * meshes start at v2, which keeps the invariant that every version a job can be
 * grounded against already owns a design state.
 */
export async function POST(request: Request) {
  try {
    const { name, brief, constraints } = (await request.json()) as {
      name?: string;
      brief?: string;
      constraints?: string;
    };

    const trimmedName = name?.trim();
    const trimmedBrief = brief?.trim();

    if (!trimmedName || !trimmedBrief) {
      return NextResponse.json(
        { error: "'name' and 'brief' are required" },
        { status: 400 },
      );
    }

    const designState = await seedDesignState({
      brief: trimmedBrief,
      constraints: constraints?.trim() || null,
    });

    const slug = slugify(trimmedName);

    const project = await db.project.create({
      data: {
        name: trimmedName,
        slug: `p-${slug}`,
        constraints: constraints?.trim() || null,
        rooms: { create: { slug, name: trimmedName } },
      },
    });

    const version = await db.objectVersion.create({
      data: {
        projectId: project.id,
        versionNumber: 1,
        status: "COMPLETE",
        label: "Initial brief",
        description: {
          create: { ...designState, raw: renderDesignState(designState) },
        },
      },
    });

    await db.project.update({
      where: { id: project.id },
      data: { headVersionId: version.id },
    });

    return NextResponse.json({ roomSlug: slug });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
