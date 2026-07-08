"use client";

import { Trash2 } from "lucide-react";

export default function DeleteForm({
  action,
  confirmMessage,
  label,
  helperText,
}: {
  action: (formData: FormData) => void | Promise<void>;
  confirmMessage: string;
  label: string;
  helperText?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 py-3 text-sm font-bold text-destructive transition-all hover:bg-destructive hover:text-white active:scale-95 cursor-pointer"
      >
        <Trash2 size={16} />
        {label}
      </button>
      {helperText && (
        <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
          {helperText}
        </p>
      )}
    </form>
  );
}
