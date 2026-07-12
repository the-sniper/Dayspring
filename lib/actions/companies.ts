"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, cleanDoc, convex } from "@/lib/convex/server";
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

  const existing = await convex().query(api.companies.getByName, { name: f.name });
  if (existing) {
    redirect(`/companies?error=${encodeURIComponent(`"${f.name}" already exists`)}`);
  }

  await convex().mutation(api.companies.create, {
    doc: cleanDoc({
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
    }),
  });
  revalidatePath("/companies");
  redirect("/companies");
}

export async function updateCompanyAction(id: string, formData: FormData) {
  const f = parseCompanyForm(formData);
  if (!f.name) {
    redirect(`/companies/${id}?error=${encodeURIComponent("Name is required")}`);
  }
  await convex().mutation(api.companies.update, {
    id: id as never,
    patch: cleanDoc({
      name: f.name,
      domain: f.domain,
      roleTypes: f.roleTypes.length ? f.roleTypes : null,
      visaSponsor: f.visaSponsor,
      atsType: f.atsType,
      atsSlug: f.atsSlug,
      atsTenant: f.atsTenant,
      atsHost: f.atsHost,
      atsSite: f.atsSite,
    }),
  });
  revalidatePath("/companies");
  redirect("/companies");
}

export async function deleteCompanyAction(id: string) {
  const jobCount = await convex().query(api.companies.jobCount, { id: id as never });
  if (jobCount > 0) {
    redirect(
      `/companies/${id}?error=${encodeURIComponent(
        `Blocked: ${jobCount} job(s) reference this company`,
      )}`,
    );
  }
  await convex().mutation(api.companies.removeCascade, { id: id as never });
  revalidatePath("/companies");
  redirect("/companies");
}
