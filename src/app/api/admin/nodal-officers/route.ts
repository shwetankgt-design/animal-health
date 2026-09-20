import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "DAHD_ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { stateId, name, designation, mobile, email } = await req.json();
  if (!stateId || !name || !designation || !mobile || !email) {
    return NextResponse.json({ error: "all fields are required" }, { status: 400 });
  }

  const officer = await prisma.nodalOfficer.upsert({
    where: { stateId },
    update: { name, designation, mobile, email },
    create: { stateId, name, designation, mobile, email },
  });
  return NextResponse.json({ officer });
}
