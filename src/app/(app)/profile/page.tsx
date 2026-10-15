import { Suspense } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/layout/loading-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  ProfileForm,
  SkillsSection,
  getMyProfile,
  listMySkills,
  toFormValues,
} from "@/features/candidate-profile";
import { requireUser } from "@/features/identity/server";

export const metadata = { title: "Your profile · JobPilot" };

export default function ProfilePage() {
  return (
    <PageShell>
      <PageHeader title="Your profile" />
      <Suspense fallback={<LoadingState label="Loading your profile…" />}>
        <ProfileContent />
      </Suspense>
    </PageShell>
  );
}

// Reads the session, so it streams in behind the Suspense boundary (Cache Components).
async function ProfileContent() {
  const user = await requireUser();
  const [profile, skills] = await Promise.all([getMyProfile(user), listMySkills(user)]);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <ProfileForm initialValues={toFormValues(profile)} />
        </CardContent>
      </Card>
      <SkillsSection skills={skills} />
    </div>
  );
}
