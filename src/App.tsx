import { Navigate, Route, Routes } from 'react-router-dom';
import { Gauge, RefreshCw } from 'lucide-react';
import { Layout } from './components/Layout';
import { StoreProvider, useStore } from './store';
import { useAuth, usePermissions } from './auth';
import Dashboard from './pages/Dashboard';
import Vehicles, { NewVehicle } from './pages/Vehicles';
import VehicleDetail from './pages/VehicleDetail';
import Maintenance, { NewSchedule, ScheduleDetail } from './pages/Maintenance';
import WorkOrders, { NewWorkOrder, WorkOrderDetail } from './pages/WorkOrders';
import Checks, { CheckDetail, NewCheck } from './pages/Checks';
import Defects, { DefectDetail, NewDefect } from './pages/Defects';
import Parts, { NewPart, PartDetail } from './pages/Parts';
import Drivers, { DriverDetail, NewDriver } from './pages/Drivers';
import FuelLog from './pages/FuelLog';
import Ncrs, { NcrDetail, NewNcr } from './pages/Ncrs';
import Audits, { AuditDetail, NewAudit } from './pages/Audits';
import Compliance from './pages/Compliance';
import Reminders from './pages/Reminders';
import Calendar from './pages/Calendar';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import { AwaitingAccess, Login, SetNewPassword } from './pages/Login';
import { Empty } from './components/ui';

function Splash({ text }: { text: string }) {
  return (
    <div className="auth-page">
      <div className="splash"><span className="brand-mark spin"><Gauge size={22} /></span><span className="muted">{text}</span></div>
    </div>
  );
}

export default function App() {
  const { mode, loading, session, recovery, role } = useAuth();

  if (mode === 'cloud') {
    if (loading) return <Splash text="Starting Torqline…" />;
    if (recovery && session) return <SetNewPassword />;
    if (!session) return <Login />;
    if (role === 'pending') return <AwaitingAccess />;
  }

  // Keyed by user so switching accounts never shows the previous person's data.
  return (
    <StoreProvider cloud={mode === 'cloud'} key={session?.user.id ?? 'local'}>
      <Workspace />
    </StoreProvider>
  );
}

function Workspace() {
  const { sync, reload } = useStore();
  const { isAdmin } = usePermissions();

  if (sync.status === 'loading') return <Splash text="Loading your fleet…" />;
  if (sync.status === 'error') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Can't reach the database</h1>
          <p className="muted">{sync.error}</p>
          <button className="btn btn-primary" onClick={() => reload()}><RefreshCw size={16} /> Try again</button>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/vehicles/new" element={<NewVehicle />} />
        <Route path="/vehicles/:id" element={<VehicleDetail />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/maintenance/new" element={<NewSchedule />} />
        <Route path="/maintenance/:id" element={<ScheduleDetail />} />
        <Route path="/work-orders" element={<WorkOrders />} />
        <Route path="/work-orders/new" element={<NewWorkOrder />} />
        <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
        <Route path="/checks" element={<Checks />} />
        <Route path="/checks/new" element={<NewCheck />} />
        <Route path="/checks/:id" element={<CheckDetail />} />
        <Route path="/defects" element={<Defects />} />
        <Route path="/defects/new" element={<NewDefect />} />
        <Route path="/defects/:id" element={<DefectDetail />} />
        <Route path="/parts" element={<Parts />} />
        <Route path="/parts/new" element={<NewPart />} />
        <Route path="/parts/:id" element={<PartDetail />} />
        <Route path="/drivers" element={<Drivers />} />
        <Route path="/drivers/new" element={<NewDriver />} />
        <Route path="/drivers/:id" element={<DriverDetail />} />
        <Route path="/fuel" element={<FuelLog />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/ncr" element={<Ncrs />} />
        <Route path="/ncr/new" element={<NewNcr />} />
        <Route path="/ncr/:id" element={<NcrDetail />} />
        <Route path="/audits" element={<Audits />} />
        <Route path="/audits/new" element={<NewAudit />} />
        <Route path="/audits/:id" element={<AuditDetail />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={isAdmin ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Empty title="Page not found">Use the menu to find your way back.</Empty>} />
      </Routes>
    </Layout>
  );
}
