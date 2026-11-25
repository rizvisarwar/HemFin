import type { Metadata } from "next";
import { AuthLayout } from "@/components/layout/auth-layout";
import { SignInForm } from "@/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthLayout
      title="Sign in"
      description="Your personal finances stay private. Household finances are shared only with the family members you invite."
    >
      <SignInForm />
    </AuthLayout>
  );
}
