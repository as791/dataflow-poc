import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CatalogProvider } from './context/CatalogContext';
import { ThemeProvider } from './context/ThemeContext';
import { FeatureProvider } from './context/FeatureContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
import PipelineCanvasPage from './pages/PipelineCanvasPage';
import AIBuilderPage from './pages/AIBuilderPage';
import LifecyclePage from './pages/LifecyclePage';
import RunsPage from './pages/RunsPage';
import RunDetailPage from './pages/RunDetailPage';
import { LoginPage, AcceptInvitePage } from './pages/auth';
import { TeamPage } from './pages/TeamPage';
import { ConnectorsPage } from './pages/ConnectorsPage';
import { BillingPage } from './pages/BillingPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import LineagePage from './pages/LineagePage';
import MonitoringPage from './pages/MonitoringPage';
import PipelinesPage from './pages/PipelinesPage';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />

            {/* Canvas page: full-viewport, no AppShell chrome */}
            <Route element={<ProtectedRoute><FeatureProvider><CatalogProvider><Outlet /></CatalogProvider></FeatureProvider></ProtectedRoute>}>
              <Route index element={<PipelineCanvasPage />} />
            </Route>

            <Route element={<ProtectedRoute><FeatureProvider><CatalogProvider><AppShell /></CatalogProvider></FeatureProvider></ProtectedRoute>}>
              <Route path="ai-builder" element={<AIBuilderPage />} />
              <Route path="pipelines" element={<PipelinesPage />} />
              <Route path="lifecycle" element={<LifecyclePage />} />
              <Route path="runs" element={<RunsPage />} />
              <Route path="runs/:id" element={<RunDetailPage />} />
              <Route path="lineage" element={<LineagePage />} />
              <Route path="monitoring" element={<MonitoringPage />} />
              <Route path="connectors" element={<ConnectorsPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="team" element={<TeamPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
