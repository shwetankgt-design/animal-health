import { prisma } from "@/lib/prisma";
import { addDays, dateOnly } from "@/lib/dates";
import { LineInput, validateLine, RowValidationResult } from "@/lib/validation/engine";

export async function getPriorDayCumulative(stateId: string, diseaseId: string, reportDate: Date) {
  const prevDate = addDays(dateOnly(reportDate), -1);
  const prevLine = await prisma.submissionLine.findFirst({
    where: {
      diseaseId,
      submission: { stateId, reportDate: prevDate },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!prevLine) return null;
  return { cumulativeCases: prevLine.cumulativeCases, cumulativeDeaths: prevLine.cumulativeDeaths };
}

export interface SaveLineParams {
  stateId: string;
  reportDate: Date;
  diseaseId: string;
  districtId?: string | null;
  village?: string | null;
  block?: string | null;
  speciesIds: string[];
  input: LineInput;
  actorUserId: string;
  reason?: string | null; // required for post-submit edits
}

export async function getOrCreateDraftSubmission(stateId: string, reportDate: Date) {
  const normalizedDate = dateOnly(reportDate);
  let submission = await prisma.submission.findUnique({
    where: { stateId_reportDate: { stateId, reportDate: normalizedDate } },
  });
  if (!submission) {
    submission = await prisma.submission.create({
      data: { stateId, reportDate: normalizedDate, status: "DRAFT" },
    });
  }
  return submission;
}

export async function validateAndSaveLine(params: SaveLineParams): Promise<RowValidationResult> {
  const prior = await getPriorDayCumulative(params.stateId, params.diseaseId, params.reportDate);
  const result = validateLine(params.input, { prior: prior ?? undefined });

  if (result.status === "REJECTED" || !result.normalized) {
    return result;
  }

  const submission = await getOrCreateDraftSubmission(params.stateId, params.reportDate);

  const isLockedForEditing = submission.status === "SUBMITTED" || submission.status === "CORRECTION_REQUESTED";
  if (isLockedForEditing && !params.reason) {
    return {
      status: "REJECTED",
      issues: [
        {
          field: "reason",
          rule:
            submission.status === "CORRECTION_REQUESTED"
              ? "DAHD has requested a correction on this day's report. A one-line reason is required to save your correction and is recorded in the audit trail."
              : "This day's report is already locked (submitted). Editing requires a one-line reason and is recorded in the audit trail.",
          valueReceived: "(no reason provided)",
          expected: "a reason for the correction",
          severity: "BLOCK",
        },
      ],
      normalized: null,
    };
  }

  const existingLine = await prisma.submissionLine.findUnique({
    where: { submissionId_diseaseId: { submissionId: submission.id, diseaseId: params.diseaseId } },
    include: { speciesLinks: true },
  });

  const n = result.normalized;

  const data = {
    districtId: params.districtId ?? null,
    village: params.village ?? null,
    block: params.block ?? null,
    isNil: !!params.input.isNil,
    probableCases: n.probableCases,
    labConfirmed: n.labConfirmed,
    totalCasesToday: n.totalCasesToday,
    deathsToday: n.deathsToday,
    cumulativeCases: n.cumulativeCases,
    activeCases: n.activeCases,
    cumulativeDeaths: n.cumulativeDeaths,
    recoveredCumulative: n.recoveredCumulative,
    vaccinationCumulative: n.vaccinationCumulative,
    culledCount: n.culledCount,
    controlMeasures: params.input.controlMeasures ?? null,
    remarks: params.input.remarks ?? null,
    decreaseReason: params.input.decreaseReason ?? null,
  };

  const line = existingLine
    ? await prisma.submissionLine.update({ where: { id: existingLine.id }, data })
    : await prisma.submissionLine.create({ data: { submissionId: submission.id, diseaseId: params.diseaseId, ...data } });

  // sync species links
  await prisma.submissionLineSpecies.deleteMany({ where: { lineId: line.id } });
  if (params.speciesIds.length > 0) {
    await prisma.submissionLineSpecies.createMany({
      data: params.speciesIds.map((speciesId) => ({ lineId: line.id, speciesId })),
    });
  }

  const fieldChanges = existingLine
    ? diffFields(existingLine, data)
    : { created: true };

  await prisma.auditLog.create({
    data: {
      submissionId: submission.id,
      entityType: "SubmissionLine",
      entityId: line.id,
      action: existingLine ? (isLockedForEditing ? "CORRECTION" : "UPDATE") : "CREATE",
      fieldChanges: JSON.stringify(fieldChanges),
      reason: params.reason ?? null,
      actorUserId: params.actorUserId,
    },
  });

  return result;
}

function diffFields(existing: Record<string, unknown>, next: Record<string, unknown>) {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(next)) {
    if (existing[key] !== next[key]) {
      changes[key] = { old: existing[key], new: next[key] };
    }
  }
  return changes;
}

export async function lockSubmission(submissionId: string, userId: string) {
  const updated = await prisma.submission.update({
    where: { id: submissionId },
    data: { status: "SUBMITTED", submittedAt: new Date(), submittedById: userId },
  });
  // Resubmitting resolves any outstanding correction requests DAHD had raised on this day's report
  await prisma.correctionRequest.updateMany({
    where: { submissionId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  return updated;
}

export async function declareZeroReport(stateId: string, reportDate: Date, userId: string) {
  const normalizedDate = dateOnly(reportDate);
  return prisma.zeroReport.upsert({
    where: { stateId_reportDate: { stateId, reportDate: normalizedDate } },
    update: {},
    create: { stateId, reportDate: normalizedDate, declaredById: userId },
  });
}
