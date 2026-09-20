import { PrismaClient, RoleName } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const STATES: { code: string; name: string; type: "State" | "UT" }[] = [
  { code: "AP", name: "Andhra Pradesh", type: "State" },
  { code: "AR", name: "Arunachal Pradesh", type: "State" },
  { code: "AS", name: "Assam", type: "State" },
  { code: "BR", name: "Bihar", type: "State" },
  { code: "CG", name: "Chhattisgarh", type: "State" },
  { code: "GA", name: "Goa", type: "State" },
  { code: "GJ", name: "Gujarat", type: "State" },
  { code: "HR", name: "Haryana", type: "State" },
  { code: "HP", name: "Himachal Pradesh", type: "State" },
  { code: "JH", name: "Jharkhand", type: "State" },
  { code: "KA", name: "Karnataka", type: "State" },
  { code: "KL", name: "Kerala", type: "State" },
  { code: "MP", name: "Madhya Pradesh", type: "State" },
  { code: "MH", name: "Maharashtra", type: "State" },
  { code: "MN", name: "Manipur", type: "State" },
  { code: "ML", name: "Meghalaya", type: "State" },
  { code: "MZ", name: "Mizoram", type: "State" },
  { code: "NL", name: "Nagaland", type: "State" },
  { code: "OD", name: "Odisha", type: "State" },
  { code: "PB", name: "Punjab", type: "State" },
  { code: "RJ", name: "Rajasthan", type: "State" },
  { code: "SK", name: "Sikkim", type: "State" },
  { code: "TN", name: "Tamil Nadu", type: "State" },
  { code: "TG", name: "Telangana", type: "State" },
  { code: "TR", name: "Tripura", type: "State" },
  { code: "UP", name: "Uttar Pradesh", type: "State" },
  { code: "UK", name: "Uttarakhand", type: "State" },
  { code: "WB", name: "West Bengal", type: "State" },
  { code: "AN", name: "Andaman and Nicobar Islands", type: "UT" },
  { code: "CH", name: "Chandigarh", type: "UT" },
  { code: "DNHDD", name: "Dadra and Nagar Haveli and Daman and Diu", type: "UT" },
  { code: "DL", name: "Delhi", type: "UT" },
  { code: "JK", name: "Jammu and Kashmir", type: "UT" },
  { code: "LA", name: "Ladakh", type: "UT" },
  { code: "LD", name: "Lakshadweep", type: "UT" },
  { code: "PY", name: "Puducherry", type: "UT" },
];

const SAMPLE_DISTRICTS: Record<string, string[]> = {
  MH: ["Pune", "Nagpur", "Nashik", "Aurangabad", "Kolhapur"],
  UP: ["Lucknow", "Kanpur", "Varanasi", "Agra", "Meerut"],
  RJ: ["Jaipur", "Jodhpur", "Udaipur", "Bikaner", "Kota"],
  GJ: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar"],
  KA: ["Bengaluru Urban", "Mysuru", "Belagavi", "Hubballi-Dharwad", "Mangaluru"],
  TN: ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli"],
  PB: ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda"],
  HR: ["Gurugram", "Faridabad", "Panipat", "Karnal", "Hisar"],
  MP: ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Ujjain"],
  WB: ["Kolkata", "Howrah", "Darjeeling", "Malda", "Bardhaman"],
};

const DISEASES = [
  { code: "FMD", name: "Foot & Mouth Disease" },
  { code: "BRC", name: "Brucellosis" },
  { code: "PPR", name: "PPR" },
  { code: "CSF", name: "Classical Swine Fever" },
  { code: "HPAI", name: "Highly Pathogenic Avian Influenza" },
  { code: "LSD", name: "Lumpy Skin Disease" },
  { code: "ASF", name: "African Swine Fever" },
  { code: "GLD", name: "Glanders" },
  { code: "HS", name: "Haemorrhagic Septicemia" },
  { code: "OTHER", name: "Any other important disease", isCatchAll: true },
];

const SPECIES = [
  { code: "CATTLE", name: "Cattle" },
  { code: "BUFFALO", name: "Buffalo" },
  { code: "SHEEP", name: "Sheep" },
  { code: "GOAT", name: "Goat" },
  { code: "PIG", name: "Pig/Swine" },
  { code: "POULTRY", name: "Poultry" },
  { code: "EQUINE", name: "Equine" },
  { code: "CANINE", name: "Canine" },
  { code: "OTHER", name: "Other" },
];

async function main() {
  console.log("Seeding master data...");

  for (const s of STATES) {
    await prisma.stateUT.upsert({
      where: { code: s.code },
      update: { name: s.name, type: s.type },
      create: s,
    });
  }

  for (const d of DISEASES) {
    await prisma.disease.upsert({
      where: { code: d.code },
      update: { name: d.name, isCatchAll: d.isCatchAll ?? false },
      create: { code: d.code, name: d.name, isCatchAll: d.isCatchAll ?? false },
    });
  }

  for (const sp of SPECIES) {
    await prisma.species.upsert({
      where: { code: sp.code },
      update: { name: sp.name },
      create: sp,
    });
  }

  for (const [stateCode, districtNames] of Object.entries(SAMPLE_DISTRICTS)) {
    const state = await prisma.stateUT.findUnique({ where: { code: stateCode } });
    if (!state) continue;
    for (const dName of districtNames) {
      await prisma.district.upsert({
        where: { stateId_name: { stateId: state.id, name: dName } },
        update: {},
        create: { stateId: state.id, name: dName },
      });
    }
  }

  // Demo users
  const passwordHash = await bcrypt.hash("Password@123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@dahd.gov.in" },
    update: {},
    create: {
      name: "DAHD Admin",
      email: "admin@dahd.gov.in",
      passwordHash,
      role: RoleName.DAHD_ADMIN,
    },
  });

  const analyst = await prisma.user.upsert({
    where: { email: "analyst@dahd.gov.in" },
    update: {},
    create: {
      name: "DAHD Analyst",
      email: "analyst@dahd.gov.in",
      passwordHash,
      role: RoleName.DAHD_ANALYST,
    },
  });

  const maha = await prisma.stateUT.findUnique({ where: { code: "MH" } });
  const raj = await prisma.stateUT.findUnique({ where: { code: "RJ" } });
  const guj = await prisma.stateUT.findUnique({ where: { code: "GJ" } });

  if (maha) {
    const sdrnoMH = await prisma.user.upsert({
      where: { email: "sdrno.mh@dahd.gov.in" },
      update: {},
      create: {
        name: "Dr. A. Deshmukh",
        email: "sdrno.mh@dahd.gov.in",
        passwordHash,
        role: RoleName.SDRNO,
        stateId: maha.id,
      },
    });
    await prisma.nodalOfficer.upsert({
      where: { stateId: maha.id },
      update: {},
      create: {
        name: "Dr. A. Deshmukh",
        designation: "Joint Director, Animal Husbandry",
        mobile: "9876500001",
        email: "sdrno.mh@dahd.gov.in",
        stateId: maha.id,
        userId: sdrnoMH.id,
      },
    });

    const fieldVetMH = await prisma.district.findFirst({ where: { stateId: maha.id } });
    if (fieldVetMH) {
      await prisma.user.upsert({
        where: { email: "vet.pune@dahd.gov.in" },
        update: {},
        create: {
          name: "Dr. S. Patil",
          email: "vet.pune@dahd.gov.in",
          passwordHash,
          role: RoleName.FIELD_VET,
          stateId: maha.id,
          districtId: fieldVetMH.id,
        },
      });
    }
  }

  if (raj) {
    const sdrnoRJ = await prisma.user.upsert({
      where: { email: "sdrno.rj@dahd.gov.in" },
      update: {},
      create: {
        name: "Dr. K. Sharma",
        email: "sdrno.rj@dahd.gov.in",
        passwordHash,
        role: RoleName.SDRNO,
        stateId: raj.id,
      },
    });
    await prisma.nodalOfficer.upsert({
      where: { stateId: raj.id },
      update: {},
      create: {
        name: "Dr. K. Sharma",
        designation: "Joint Director, Animal Husbandry",
        mobile: "9876500002",
        email: "sdrno.rj@dahd.gov.in",
        stateId: raj.id,
        userId: sdrnoRJ.id,
      },
    });
  }

  if (guj) {
    await prisma.user.upsert({
      where: { email: "sdrno.gj@dahd.gov.in" },
      update: {},
      create: {
        name: "Dr. R. Trivedi",
        email: "sdrno.gj@dahd.gov.in",
        passwordHash,
        role: RoleName.SDRNO,
        stateId: guj.id,
      },
    });
  }

  await prisma.user.upsert({
    where: { email: "lab@dahd.gov.in" },
    update: {},
    create: {
      name: "Central Lab User",
      email: "lab@dahd.gov.in",
      passwordHash,
      role: RoleName.LAB_USER,
    },
  });

  console.log("Seed complete.");
  console.log("Demo login password for all users: Password@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
