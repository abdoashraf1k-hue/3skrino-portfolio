import { redirect } from "next/navigation";
import { isValidAdminKey } from "@/lib/admin/auth";
import AdminClient from "./AdminClient";

/**
 * Secret gate: /admin?key=SECRET. Missing or wrong key → "/". The response is
 * identical whether or not ADMIN_SECRET_KEY is configured, and the secret is
 * never passed to the client — AdminClient reads the key the user typed from
 * the URL itself.
 */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const params = await searchParams;
  const { key } = params;
  if (typeof key !== "string" || !isValidAdminKey(key)) redirect("/");
  // Filters + tab (never the key) so the first render already matches the URL.
  const initialParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k !== "key" && typeof v === "string") initialParams[k] = v;
  }
  return <AdminClient initialParams={initialParams} />;
}
