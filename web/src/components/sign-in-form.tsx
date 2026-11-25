"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Placeholder form: no working auth yet (HEM-003 scope). */
export function SignInForm() {
  const [notice, setNotice] = React.useState(false);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setNotice(true);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="email" className="text-body">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="name@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-body">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" />
        <div className="text-right">
          <Link
            href="/sign-in"
            className="inline-flex min-h-11 items-center text-small font-medium text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>
      {notice ? (
        <p role="status" className="rounded-md bg-warning-subtle px-3 py-2 text-small text-warning">
          Sign-in is not available yet. It arrives in a later release.
        </p>
      ) : null}
      <Button type="submit" className="w-full">Sign in</Button>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-small text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button type="button" variant="outline" className="w-full">
        Continue with Google
      </Button>

      <p className="text-center text-body text-muted-foreground">
        New to HemFin?{" "}
        <Link href="/sign-in" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
