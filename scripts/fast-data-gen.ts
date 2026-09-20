import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fastDataGen() {
  console.time("Data generation");

  const states = await prisma.stateUT.findMany({ where: { active: true } });
  const diseases = await prisma.disease.findMany({ where: { active: true } });
  const species = await prisma.species.findMany({ where: { active: true } });
  const users = await prisma.user.findMany({ where: { role: "SDRNO" } });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let lineCount = 0;
  const batch = [];

  // Fast generation: 2000 records across 30 days
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const reportDate = new Date(today);
    reportDate.setUTCDate(reportDate.getUTCDate() - dayOffset);

    // 67 submissions per day = 2000 total
    for (let stateIdx = 0; stateIdx < 67; stateIdx++) {
      const state = states[stateIdx % states.length];
      const user = users.find((u) => u.stateId === state.id) || users[0];

      // Check if submission exists
      const existing = await prisma.submission.count({
        where: { stateId: state.id, reportDate },
      });
      if (existing > 0) continue;

      const submission = await prisma.submission.create({
        data: { stateId: state.id, reportDate, status: "SUBMITTED", submittedById: user.id, submittedAt: new Date() },
      });

      // Add 2-4 disease lines
      const usedDiseases = new Set<string>();
      const diseaseCount = Math.floor(Math.random() * 3) + 2;
      for (let d = 0; d < diseaseCount; d++) {
        let disease = diseases[Math.floor(Math.random() * diseases.length)];
        let attempts = 0;
        while (usedDiseases.has(disease.id) && attempts < 5) {
          disease = diseases[Math.floor(Math.random() * diseases.length)];
          attempts++;
        }
        if (usedDiseases.has(disease.id)) continue;
        usedDiseases.add(disease.id);

        const probable = Math.floor(Math.random() * 100);
        const labConfirmed = Math.floor(probable * 0.6);
        const deathsToday = Math.floor(labConfirmed * 0.1);
        const cumulative = Math.floor(Math.random() * 1000) + 100;
        const active = Math.floor(cumulative * 0.4);
        const cumulativeDeaths = Math.floor(cumulative * 0.05);

        await prisma.submissionLine.create({
          data: {
            submissionId: submission.id,
            diseaseId: disease.id,
            probableCases: probable,
            labConfirmed,
            totalCasesToday: probable + labConfirmed,
            deathsToday,
            cumulativeCases: cumulative,
            activeCases: active,
            cumulativeDeaths,
            recoveredCumulative: Math.max(0, cumulative - active - cumulativeDeaths),
            vaccinationCumulative: Math.floor(cumulative * 0.7),
            culledCount: Math.floor(active * 0.1),
            controlMeasures: "Monitoring; Quarantine",
            remarks: "Routine",
            isNil: false,
          },
        });

        lineCount++;
        if (lineCount % 500 === 0) {
          console.log(`Generated ${lineCount}...`);
        }
      }
    }
  }

  console.timeEnd("Data generation");
  console.log(`✅ Total: ${lineCount} lines across ${30} days`);
  await prisma.$disconnect();
}

fastDataGen().catch((e) => {
  console.error(e);
  process.exit(1);
});
