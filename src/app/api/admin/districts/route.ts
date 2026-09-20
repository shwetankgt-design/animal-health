import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "DAHD_ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { stateId, name } = await req.json();
  if (!stateId || !name) return NextResponse.json({ error: "stateId and name are required" }, { status: 400 });

  const existing = await prisma.district.findUnique({ where: { stateId_name: { stateId, name } } });
  if (existing) return NextResponse.json({ error: `District "${name}" already exists for this State/UT.` }, { status: 400 });

  const district = await prisma.district.create({ data: { stateId, name } });
  return NextResponse.json({ district });
}
