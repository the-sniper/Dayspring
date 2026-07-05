import ImportPanel from "@/components/import-panel";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold">Import</h1>
      <p className="mt-1 text-sm text-stone-500">
        Bridges for the closed products — bring jobs in from anywhere, review
        the parse, then confirm. Nothing touches the tracker until you click
        Import.
      </p>
      <div className="mt-5">
        <ImportPanel hasKey={!!process.env.ANTHROPIC_API_KEY} />
      </div>
    </div>
  );
}
