import RequireAuth from "../../components/requireAuth";
import DashboardView from "../DashboardView";

// Dashboard de OUTRO jogador. O username vem do URL (/dashboard/<username>) e o
// DashboardView usa /api/stats/user/:username. Em Next 16 os params sao uma
// Promise, por isso o componente e async.
export default async function Page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return (
    <RequireAuth>
      <DashboardView username={username} />
    </RequireAuth>
  );
}
