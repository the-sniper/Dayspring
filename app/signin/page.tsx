import SignInForm from "@/components/sign-in-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <SignInForm />
    </div>
  );
}
