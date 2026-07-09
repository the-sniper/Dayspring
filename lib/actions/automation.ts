"use server";

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

const run = promisify(execFile);

// The 7:30am daily pipeline (pull → derive → score → follow-ups → digest) as a
// launchd agent — installed/removed by the same scripts the CLI used, now a
// Settings toggle. Local machine only.

export type DailyRunStatus = {
  installed: boolean;
  lastRun: string | null;
};

export async function dailyRunStatusAction(): Promise<DailyRunStatus> {
  let installed = false;
  try {
    await run("launchctl", ["print", `gui/${process.getuid!()}/com.dayspring.daily`]);
    installed = true;
  } catch {
    installed = false;
  }
  const lastRun =
    db.select().from(settings).where(eq(settings.key, "lastDailyRun")).get()?.value ??
    null;
  return { installed, lastRun };
}

export async function installDailyAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await run("/bin/sh", [path.join(process.cwd(), "scripts", "cron-install.sh")]);
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Install failed" };
  }
}

export async function uninstallDailyAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await run("/bin/sh", [path.join(process.cwd(), "scripts", "cron-uninstall.sh")]);
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Uninstall failed" };
  }
}
