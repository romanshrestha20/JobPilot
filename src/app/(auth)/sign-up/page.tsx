"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/components/auth/auth-client";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoadingState } from "@/components/layout/loading-state";
import { safeNextPath, withNext } from "@/lib/safe-redirect";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { linkClass } from "@/components/ui/link";

// useSearchParams needs a Suspense boundary under Cache Components.
export default function SignUpPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <SignUpContent />
    </Suspense>
  );
}

function SignUpContent() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await signUp.email({ name, email, password });

    if (error) {
      setError(error.message ?? "Sign up failed");
      setLoading(false);
      return;
    }

    router.push(safeNextPath(next));
  }

  return (
    <AuthShell
      title="Create your account"
      footer={
        <>
          Already have an account?{" "}
          <Link href={withNext("/sign-in", next)} className={linkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField id="name" label="Name">
          {(control) => (
            <Input
              {...control}
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
            />
          )}
        </FormField>

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

        <FormField id="password" label="Password" hint="At least 8 characters.">
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          )}
        </FormField>

        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <Button type="submit" loading={loading}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
