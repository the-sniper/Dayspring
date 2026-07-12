"use server";

import { revalidatePath } from "next/cache";
import { clearKey, setKey, SERVICE_KEYS, type ServiceKey } from "@/lib/keys";

function assertService(name: string): ServiceKey {
  if (!(SERVICE_KEYS as readonly string[]).includes(name)) {
    throw new Error("Unknown service key");
  }
  return name as ServiceKey;
}

export async function saveKeyAction(
  name: string,
  value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await setKey(assertService(name), value);
    revalidatePath("/", "layout"); // key-gated features light up everywhere
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save the key" };
  }
}

export async function clearKeyAction(
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await clearKey(assertService(name));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't clear the key" };
  }
}
