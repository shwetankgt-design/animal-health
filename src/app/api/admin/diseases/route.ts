import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "DAHD_ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { code, name } = await req.json();
  if (!code || !name) return NextResponse.json({ error: "code and name are required" }, { status: 400 });

  const existing = await prisma.disease.findUnique({ where: { code: code.toUpperCase() } });
  if (existing) return NextResponse.json({ error: `A disease with code "${code}" already exists.` }, { status: 400 });

  const disease = await prisma.disease.create({
    data: { code: code.toUpperCase(), name, isCatchAll: false, approved: true },
  });
  return NextResponse.json({ disease });
}
