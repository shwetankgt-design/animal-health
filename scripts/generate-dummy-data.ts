import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Generate 2000 dummy submission records across the last 60 days
async function generateDummyData() {
  console.log("Fetching master data...");
  const states = await prisma.stateUT.findMany({ where: { active: true } });
  const diseases = await prisma.disease.findMany({ where: { active: true } });
  const species = await prisma.species.findMany({ where: { active: true } });
  const users = await prisma.user.findMany({ where: { role: "SDRNO" } });

  if (states.length === 0 || diseases.length === 0 || users.length === 0) {
    console.error("Missing master data. Run seed first.");
    return;
  }

  console.log(`Found ${states.length} states, ${diseases.length} diseases, ${species.length} species, ${users.length} SDRNO users`);

  let count = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Generate ~33 submissions per day across 60 days to reach ~2000
  for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
    const reportDate = new Date(today);
    reportDate.setUTCDate(reportDate.getUTCDate() - dayOffset);

    // ~33 submissions per day (across states)
    for (let i = 0; i < 33; i++) {
      const randomState = states[Math.floor(Math.random() * states.length)];
      const randomUser = users.find((u) => u.stateId === randomState.id) || users[0];

      // Check if submission already exists
      const existingSubmission = await prisma.submission.findUnique({
        where: { stateId_reportDate: { stateId: randomState.id, reportDate } },
      });

      if (existingSubmission) continue;

      // Create submission
      const submission = await prisma.submission.create({
        data: {
          stateId: randomState.id,
          reportDate,
          status: "SUBMITTED",
          submittedById: randomUser.id,
          submittedAt: new Date(),
          source: "MANUAL",
        },
      });

      // Add 3-7 disease lines per submission
      const diseaseCount = Math.floor(Math.random() * 5) + 3;
      for (let d = 0; d < diseaseCount; d++) {
        const randomDisease = diseases[Math.floor(Math.random() * diseases.length)];

        // Skip if already has this disease
        const existing = await prisma.submissionLine.findUnique({
          where: { submissionId_diseaseId: { submissionId: submission.id, diseaseId: randomDisease.id } },
        });
        if (existing) continue;

        // Generate realistic case numbers
        const probable = Math.floor(Math.random() * 50);
        const labConfirmed = Math.floor(Math.random() * probable);
        const deathsToday = Math.floor(Math.random() * (labConfirmed > 0 ? labConfirmed / 10 : 2));
        const cumulativeCases = Math.floor(Math.random() * 500) + 100;
        const activeCases = Math.floor(Math.random() * cumulativeCases);
        const cumulativeDeaths = Math.floor(Math.random() * (cumulativeCases / 20));
        const recovered = cumulativeCases - activeCases - cumulativeDeaths;

        // Create line
        const line = await prisma.submissionLine.create({
          data: {
            submissionId: submission.id,
            diseaseId: randomDisease.id,
            districtId: undefined,
            village: undefined,
            block: undefined,
            probableCases: probable,
            labConfirmed,
            totalCasesToday: probable + labConfirmed,
            deathsToday,
            cumulativeCases,
            activeCases,
            cumulativeDeaths,
            recoveredCumulative: Math.max(0, recovered),
            vaccinationCumulative: Math.floor(Math.random() * cumulativeCases),
            culledCount: Math.floor(Math.random() * activeCases),
            controlMeasures: ["Quarantine", "Vaccination", "Monitoring"].join("; "),
            remarks: "Routine reporting",
            isNil: false,
          },
        });

        // Add random species
        const speciesCount = Math.floor(Math.random() * 3) + 1;
        const selectedSpecies = new Set<string>();
        for (let s = 0; s < speciesCount; s++) {
          const sp = species[Math.floor(Math.random() * species.length)];
          selectedSpecies.add(sp.id);
        }
        for (const spId of selectedSpecies) {
          await prisma.submissionLineSpecies.create({
            data: { lineId: line.id, speciesId: spId },
          });
        }

        count++;
        if (count % 100 === 0) {
          console.log(`Generated ${count} submission lines...`);
        }
      }
    }
  }

  console.log(`✅ Generated ${count} submission lines across 60 days`);
  await prisma.$disconnect();
}

generateDummyData().catch((e) => {
  console.error(e);
  process.exit(1);
});
