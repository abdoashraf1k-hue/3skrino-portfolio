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
  const { key } = await searchParams;
  if (typeof key !== "string" || !isValidAdminKey(key)) redirect("/");
  return <AdminClient />;
}
