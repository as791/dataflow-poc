import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
import PipelineCanvasPage from './pages/PipelineCanvasPage';
import AIBuilderPage from './pages/AIBuilderPage';
import { LoginPage, RegisterPage, VerifyEmailPage, ForgotPasswordPage, AcceptInvitePage } from './pages/auth';
import { TeamPage } from './pages/TeamPage';
import { ConnectorsPage } from './pages/ConnectorsPage';
import { BillingPage } from './pages/BillingPage';
import { AnalyticsPage } from './pages/AnalyticsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />

          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route index element={<PipelineCanvasPage />} />
            <Route path="ai-builder" element={<AIBuilderPage />} />
            <Route path="connectors" element={<ConnectorsPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="team" element={<TeamPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
