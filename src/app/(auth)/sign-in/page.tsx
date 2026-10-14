"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/components/auth/auth-client";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoadingState } from "@/components/layout/loading-state";
import { safeNextPath, withNext } from "@/lib/safe-redirect";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

// useSearchParams needs a Suspense boundary under Cache Components.
export default function SignInPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <SignInContent />
    </Suspense>
  );
}

function SignInContent() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await signIn.email({ email, password });

    if (error) {
      setError(error.message ?? "Sign in failed");
      setLoading(false);
      return;
    }

    router.push(safeNextPath(next));
  }

  return (
    <AuthShell
      title="Sign in to JobPilot"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            href={withNext("/sign-up", next)}
            className="font-medium text-primary underline underline-offset-4"
          >
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField id="email" label="Email">
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          )}
        </FormField>

        <FormField id="password" label="Password">
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          )}
        </FormField>

        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <Button type="submit" loading={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
