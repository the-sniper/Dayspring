// Local avatar override (server-side): drop an image at
//   public/avatars/<role-id>.<png|jpg|jpeg|webp|svg>
// and it automatically replaces that employee's generated DiceBear avatar
// everywhere (org chart, directory, detail pages). No registry edit needed —
// generate portraits with any image tool, name them by role id, done.
// Falls back to the registry's `avatar` URL when no file exists (including on
// hosted deployments where public/ isn't visible to the server function).
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Employee } from "@/lib/orchestra/registry";

const EXTS = ["png", "jpg", "jpeg", "webp", "svg"] as const;

export function localAvatar(e: Employee): string | undefined {
  try {
    for (const ext of EXTS) {
      if (existsSync(join(process.cwd(), "public", "avatars", `${e.id}.${ext}`))) {
        return `/avatars/${e.id}.${ext}`;
      }
    }
  } catch {
    // fs unavailable (edge/hosted) — generated avatar it is
  }
  return e.avatar;
}
