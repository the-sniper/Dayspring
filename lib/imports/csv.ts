import type { CandidateJob, JobStatus, RoleType } from "@/lib/types";
import { ROLE_TYPES } from "@/lib/types";

// Hand-rolled RFC-4180-ish parser: quoted fields, embedded commas/newlines,
// escaped quotes. If real Simplify/JobRight exports ever break it, papaparse
// is the named escape hatch.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // strip BOM

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// Case-insensitive header aliases → CandidateJob field. Extend as real
// exports from Simplify / JobRight / MigrateMate reveal their headers.
const HEADER_ALIASES: Record<keyof CandidateJob, string[]> = {
  company: ["company", "company name", "employer", "organization"],
  title: ["title", "position", "job title", "role", "job"],
  url: ["url", "link", "job url", "job link", "application link", "posting url"],
  location: ["location", "city", "job location"],
  roleType: ["role type", "role_type"],
  status: ["status", "stage"],
  description: ["notes", "description", "summary", "note"],
  date: ["date", "applied date", "date applied", "applied", "saved date", "date saved"],
};

const STATUS_VALUES: [JobStatus, string[]][] = [
  ["wishlist", ["saved", "bookmarked", "wishlist", "interested", "to apply"]],
  ["applied", ["applied", "application submitted", "submitted"]],
  ["screen", ["screen", "phone screen", "screening", "recruiter screen", "phone interview"]],
  ["interview", ["interview", "interviewing", "onsite", "final round", "technical interview"]],
  ["offer", ["offer", "offer received"]],
  ["rejected", ["rejected", "declined", "closed", "not selected"]],
];

function mapStatus(raw: string): JobStatus | undefined {
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  for (const [status, aliases] of STATUS_VALUES) {
    if (aliases.includes(v)) return status;
  }
  return "new";
}

export type CsvParseResult = {
  candidates: CandidateJob[];
  warnings: string[];
  unmappedHeaders: string[];
};

export function csvToCandidates(text: string): CsvParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return {
      candidates: [],
      warnings: rows.length === 0 ? ["File is empty."] : ["No data rows below the header."],
      unmappedHeaders: [],
    };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const fieldForColumn: (keyof CandidateJob | null)[] = headers.map((h) => {
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(h)) return field as keyof CandidateJob;
    }
    return null;
  });
  const unmappedHeaders = headers.filter((_, i) => fieldForColumn[i] === null);

  const mapped = new Set(fieldForColumn.filter(Boolean));
  const missing = (["company", "title"] as const).filter((f) => !mapped.has(f));
  if (missing.length) {
    return {
      candidates: [],
      warnings: [
        `Missing required column(s): ${missing.join(", ")}. Rename headers in your CSV — accepted names: ${missing
          .map((f) => HEADER_ALIASES[f].join(" / "))
          .join(" · ")}.`,
      ],
      unmappedHeaders,
    };
  }

  const candidates: CandidateJob[] = [];
  const warnings: string[] = [];
  for (let r = 1; r < rows.length; r++) {
    const raw: Partial<Record<keyof CandidateJob, string>> = {};
    rows[r].forEach((val, i) => {
      const field = fieldForColumn[i];
      if (field && val.trim()) raw[field] = val.trim();
    });
    if (!raw.company || !raw.title) {
      warnings.push(`Row ${r + 1}: skipped — missing company or title.`);
      continue;
    }
    const status = raw.status ? mapStatus(raw.status) : undefined;
    if (raw.status && status === "new") {
      warnings.push(`Row ${r + 1}: unknown status "${raw.status}" — importing as new.`);
    }
    candidates.push({
      company: raw.company,
      title: raw.title,
      url: raw.url,
      location: raw.location,
      roleType: (ROLE_TYPES as readonly string[]).includes(raw.roleType ?? "")
        ? (raw.roleType as RoleType)
        : undefined,
      status,
      description: raw.description,
      date: raw.date,
    });
  }
  return { candidates, warnings, unmappedHeaders };
}
