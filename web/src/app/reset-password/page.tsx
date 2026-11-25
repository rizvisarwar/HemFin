import type { Metadata } from "next";
import { AuthLayout } from "@/components/layout/auth-layout";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthLayout title="Choose a new password" brandPanel={false}>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
