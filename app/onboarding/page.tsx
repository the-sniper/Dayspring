import OnboardingFlow from "@/components/onboarding-flow";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <OnboardingFlow />
    </div>
  );
}
