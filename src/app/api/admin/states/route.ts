import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "DAHD_ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { code, name, type } = await req.json();
  if (!code || !name || !type) {
    return NextResponse.json({ error: "code, name and type are required" }, { status: 400 });
  }
  const existing = await prisma.stateUT.findUnique({ where: { code: code.toUpperCase() } });
  if (existing) return NextResponse.json({ error: `A State/UT with code "${code}" already exists.` }, { status: 400 });

  const state = await prisma.stateUT.create({
    data: { code: code.toUpperCase(), name, type },
  });
  return NextResponse.json({ state });
}
