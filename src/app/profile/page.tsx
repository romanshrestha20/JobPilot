import { Suspense } from "react";
import { ProfileForm, getMyProfile, toFormValues } from "@/features/candidate-profile";
import { requireUser } from "@/features/identity/server";

export const metadata = { title: "Your profile · JobPilot" };

export default function ProfilePage() {
  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Your profile
        </h1>
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading your profile…</p>}>
          <ProfileContent />
        </Suspense>
      </main>
    </div>
  );
}

// Reads the session, so it streams in behind the Suspense boundary (Cache Components).
async function ProfileContent() {
  const user = await requireUser();
  const profile = await getMyProfile(user);
  return <ProfileForm initialValues={toFormValues(profile)} />;
}
