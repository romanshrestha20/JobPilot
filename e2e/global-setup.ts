import { connectTestDatabase } from "@/test/integration-db";

// Applies every migration to the dedicated test database (guarded: local `*_test` only).
export default async function globalSetup() {
  const { close } = await connectTestDatabase();
  await close();
}
