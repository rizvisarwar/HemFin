import type { Metadata } from "next";
import { CircleUser } from "lucide-react";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <PlaceholderPage
      title="Profile"
      description="Your name, language and currency."
      icon={CircleUser}
      emptyTitle="Complete your profile"
      emptyDescription="Add your name, language and preferred currency so amounts look familiar."
      actionLabel="Edit profile"
      actionHref="/profile"
    />
  );
}
