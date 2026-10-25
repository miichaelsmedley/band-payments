import { isConfigured, supabase } from "@/lib/supabase";
import { loadData } from "@/lib/data";
import { Login } from "./ui/login";
import { Dashboard } from "./ui/dashboard";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  if (!isConfigured()) return <Login configured={false} local={false} />;
  const data = await loadData((await searchParams).workspace);
  if (!data) {
    const client = await supabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    return (
      <Login
        configured
        local={
          process.env.APP_ENV === "local" &&
          process.env.NODE_ENV !== "production"
        }
        signedIn={Boolean(user)}
      />
    );
  }
  return <Dashboard key={data.workspace.id} data={data} />;
}
