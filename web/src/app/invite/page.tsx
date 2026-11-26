import type { Metadata } from "next";
import { InviteFlow } from "@/components/invitations/invite-flow";

// The token is in the URL fragment, which the server never receives, so this page is a static shell
// and the client component does all the work. No token is ever a prop, a param or part of this HTML.
// `Referrer-Policy: no-referrer` for this path is set in next.config.ts; the meta tag is a second layer.
export const metadata: Metadata = {
  title: "Join a household",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function InvitePage() {
  return (
    <>
      <noscript>
        <p className="px-4 py-2 text-center text-body">HemFin needs JavaScript on to open this invitation.</p>
      </noscript>
      <InviteFlow />
    </>
  );
}
