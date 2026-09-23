import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import VehicleDetail from './pages/VehicleDetail';
import Maintenance from './pages/Maintenance';
import WorkOrders from './pages/WorkOrders';
import Checks from './pages/Checks';
import Defects from './pages/Defects';
import Parts from './pages/Parts';
import Drivers from './pages/Drivers';
import FuelLog from './pages/FuelLog';
import Calendar from './pages/Calendar';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import { Empty } from './components/ui';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/vehicles/:id" element={<VehicleDetail />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/work-orders" element={<WorkOrders />} />
        <Route path="/checks" element={<Checks />} />
        <Route path="/defects" element={<Defects />} />
        <Route path="/parts" element={<Parts />} />
        <Route path="/drivers" element={<Drivers />} />
        <Route path="/fuel" element={<FuelLog />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Empty title="Page not found">Use the menu to find your way back.</Empty>} />
      </Routes>
    </Layout>
  );
}
