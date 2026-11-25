import type { Metadata } from "next";
import { AuthLayout } from "@/components/layout/auth-layout";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Forgot your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Forgot your password"
      description="Enter your email address and we will send you a link to choose a new one."
      brandPanel={false}
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
