// Single choke point that turns a raw job into the structured, filterable
// metadata the feed relies on. Shared by the ATS pull, manual/import create,
// and the backfill script so every row is derived identically.
import { detectEmploymentType } from "@/lib/jobs/employment-type";
import { detectWorkplaceType, isUsLocation } from "@/lib/jobs/location";
import { parseSalary } from "@/lib/jobs/salary";
import type { EmploymentType, WorkplaceType } from "@/lib/types";

export type JobMeta = {
  isUs: boolean | null;
  workplaceType: WorkplaceType | null;
  employmentType: EmploymentType;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
};

export function deriveJobMeta(input: {
  title: string;
  location: string | null | undefined;
  description: string | null | undefined;
}): JobMeta {
  const salary = parseSalary(input.description);
  return {
    isUs: isUsLocation(input.location),
    workplaceType: detectWorkplaceType(input.location),
    employmentType: detectEmploymentType(input.title, input.description),
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
  };
}
