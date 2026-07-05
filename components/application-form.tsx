import { updateApplicationAction } from "@/lib/actions/jobs";

const input =
  "w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm";

export default function ApplicationForm({
  jobId,
  values,
}: {
  jobId: number;
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
      <p className="text-xs text-stone-500">
        Submitted {values.submittedAt ? values.submittedAt.slice(0, 10) : "—"}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Resume version</span>
          <input
            name="resumeVersion"
            defaultValue={values.resumeVersion ?? ""}
            className={input}
            placeholder="fde-v2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Next action</span>
          <input
            name="nextAction"
            defaultValue={values.nextAction ?? ""}
            className={input}
            placeholder="Follow up with recruiter"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Due</span>
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
        className="justify-self-start rounded border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
      >
        Save application
      </button>
    </form>
  );
}
