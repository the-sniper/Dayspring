import { Zap } from "lucide-react";
import ApplyQueue from "@/components/apply-queue";
import PageHeader from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function ApplyQueuePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Pipeline"
        icon={<Zap size={14} />}
        title="Auto-Apply"
        description={
          <span>
            Queue roles, pick the resume for each, then run the batch — you
            approve every submission.
          </span>
        }
      />
      <ApplyQueue />
    </div>
  );
}
