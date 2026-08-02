import RequireAuth from "../components/requireAuth";
import DashboardView from "./DashboardView";

// O meu proprio dashboard. Sem username => DashboardView usa /api/stats/me.
export default function Page() {
  return (
    <RequireAuth>
      <DashboardView />
    </RequireAuth>
  );
}
