import { updateApplicationAction } from "@/lib/actions/jobs";

const input =
  "w-full rounded-lg border border-border bg-secondary/30 px-2.5 py-1.5 text-sm text-foreground transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function ApplicationForm({
  jobId,
  values,
}: {
  jobId: string;
  values: {
    resumeVersion: string | null;
    submittedAt: string | null;
    nextAction: string | null;
    nextActionDue: string | null;
  };
}) {
  const action = updateApplicationAction.bind(null, jobId);
  return (
    <form action={action} className="grid gap-3">
      <p className="text-xs font-medium text-muted-foreground">
        Submitted {values.submittedAt ? values.submittedAt.slice(0, 10) : "—"}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Resume version</span>
          <input
            name="resumeVersion"
            defaultValue={values.resumeVersion ?? ""}
            className={input}
            placeholder="fde-v2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Next action</span>
          <input
            name="nextAction"
            defaultValue={values.nextAction ?? ""}
            className={input}
            placeholder="Follow up with recruiter"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Due</span>
          <input
            name="nextActionDue"
            type="date"
            defaultValue={values.nextActionDue ?? ""}
            className={input}
          />
        </label>
      </div>
      <button
        type="submit"
        className="justify-self-start rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
      >
        Save application
      </button>
    </form>
  );
}
