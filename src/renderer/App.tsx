import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MedicinesPage from './pages/MedicinesPage';
import StockPage from './pages/StockPage';
import POSPage from './pages/POSPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import PurchaseOrderPage from './pages/PurchaseOrderPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import ConflictsPage from './pages/ConflictsPage';
import ReturnPage from './pages/ReturnPage';
import GSTReportsPage from './pages/GSTReportsPage';
import LedgerPage from './pages/LedgerPage';
import ImportDashboardPage from './pages/ImportDashboardPage';
import ImportWizardPage from './pages/ImportWizardPage';
import InvoiceHistoryPage from './pages/InvoiceHistoryPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuthStore();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="medicines" element={<MedicinesPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="pos" element={<POSPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="purchase-orders" element={<PurchaseOrderPage />} />
        <Route path="returns" element={<ReturnPage />} />
        <Route path="invoices" element={<InvoiceHistoryPage />} />
        <Route path="gst-reports" element={<GSTReportsPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="conflicts" element={<ConflictsPage />} />
        <Route path="import" element={<ImportDashboardPage />} />
        <Route path="import/wizard" element={<ImportWizardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
