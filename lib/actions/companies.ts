"use server";

import { count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companies, contacts, jobs } from "@/lib/db/schema";
import { ATS_TYPES, ROLE_TYPES, type AtsType, type RoleType } from "@/lib/types";

function parseCompanyForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const domain = String(formData.get("domain") ?? "").trim() || null;
  const atsTypeRaw = String(formData.get("atsType") ?? "");
  const atsType = (ATS_TYPES as readonly string[]).includes(atsTypeRaw)
    ? (atsTypeRaw as AtsType)
    : null;
  const atsSlug = String(formData.get("atsSlug") ?? "").trim() || null;
  const atsTenant = String(formData.get("atsTenant") ?? "").trim() || null;
  const atsHost = String(formData.get("atsHost") ?? "").trim() || null;
  const atsSite = String(formData.get("atsSite") ?? "").trim() || null;
  const roleTypes = formData
    .getAll("roleTypes")
    .map(String)
    .filter((r): r is RoleType => (ROLE_TYPES as readonly string[]).includes(r));
  const visaSponsor = formData.get("visaSponsor") === "on";
  return { name, domain, atsType, atsSlug, atsTenant, atsHost, atsSite, roleTypes, visaSponsor };
}

export async function createCompanyAction(formData: FormData) {
  const f = parseCompanyForm(formData);
  if (!f.name) redirect(`/companies?error=${encodeURIComponent("Name is required")}`);

  const existing = db
    .select({ id: companies.id })
    .from(companies)
    .where(sql`lower(${companies.name}) = ${f.name.toLowerCase()}`)
    .get();
  if (existing) {
    redirect(`/companies?error=${encodeURIComponent(`"${f.name}" already exists`)}`);
  }

  db.insert(companies)
    .values({
      name: f.name,
      domain: f.domain,
      roleTypes: f.roleTypes.length ? f.roleTypes : null,
      visaSponsor: f.visaSponsor,
      source: "manual",
      atsType: f.atsType,
      atsSlug: f.atsSlug,
      atsTenant: f.atsTenant,
      atsHost: f.atsHost,
      atsSite: f.atsSite,
      createdAt: new Date().toISOString(),
    })
    .run();
  revalidatePath("/companies");
  redirect("/companies");
}

export async function updateCompanyAction(id: number, formData: FormData) {
  const f = parseCompanyForm(formData);
  if (!f.name) {
    redirect(`/companies/${id}?error=${encodeURIComponent("Name is required")}`);
  }
  db.update(companies)
    .set({
      name: f.name,
      domain: f.domain,
      roleTypes: f.roleTypes.length ? f.roleTypes : null,
      visaSponsor: f.visaSponsor,
      atsType: f.atsType,
      atsSlug: f.atsSlug,
      atsTenant: f.atsTenant,
      atsHost: f.atsHost,
      atsSite: f.atsSite,
    })
    .where(eq(companies.id, id))
    .run();
  revalidatePath("/companies");
  redirect("/companies");
}

export async function deleteCompanyAction(id: number) {
  const jobCount = db
    .select({ n: count() })
    .from(jobs)
    .where(eq(jobs.companyId, id))
    .get();
  if (jobCount && jobCount.n > 0) {
    redirect(
      `/companies/${id}?error=${encodeURIComponent(
        `Blocked: ${jobCount.n} job(s) reference this company`,
      )}`,
    );
  }
  db.delete(contacts).where(eq(contacts.companyId, id)).run();
  db.delete(companies).where(eq(companies.id, id)).run();
  revalidatePath("/companies");
  redirect("/companies");
}
