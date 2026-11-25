import type { Metadata } from "next";
import { AuthLayout } from "@/components/layout/auth-layout";
import { CheckEmail } from "@/components/auth/check-email";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthLayout title="Check your email" brandPanel={false}>
      <CheckEmail />
    </AuthLayout>
  );
}
