import { PrismaClient } from "@prisma/client";

// Removes everything created by scripts/seed-transactions.ts (ids prefixed "dmy_").
const prisma = new PrismaClient();
const like = { startsWith: "dmy_" };

async function main() {
  const r = await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { id: like } }),
    prisma.correctionRequest.deleteMany({ where: { id: like } }),
    prisma.submissionLineSpecies.deleteMany({ where: { id: like } }),
    prisma.submissionLine.deleteMany({ where: { id: like } }),
    prisma.submission.deleteMany({ where: { id: like } }),
  ]);
  console.log("deleted:", r.map((x) => x.count));
}
main().finally(() => prisma.$disconnect());
