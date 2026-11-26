import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/layout/auth-layout";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <AuthLayout title="Create your account" description="It takes a minute. We will email you a link to confirm your address.">
      <Suspense>
        <SignUpForm />
      </Suspense>
    </AuthLayout>
  );
}
