import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import PageLoader from './components/PageLoader';
import { useAuthStore } from './stores/auth';
import { useGeoStore } from './stores/geo';

const AdminLayout = lazy(() => import('./components/AdminLayout'));
const RequireAdmin = lazy(() => import('./components/RequireAdmin'));
const AppShell = lazy(() => import('./components/research/AppShell'));

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Pricing = lazy(() => import('./pages/Pricing'));
// 业务页面:市场调研(research)
const Projects = lazy(() => import('./pages/Projects'));
const ResearchNew = lazy(() => import('./pages/ResearchNew'));
const ProjectWorkspace = lazy(() => import('./pages/ProjectWorkspace'));
const ResearchCompare = lazy(() => import('./pages/ResearchCompare'));
const Orders = lazy(() => import('./pages/Orders'));
const StripeCheckoutReturn = lazy(() => import('./pages/StripeCheckoutReturn'));
const StripeEmbeddedCheckout = lazy(() => import('./pages/StripeEmbeddedCheckout'));
const StripeCheckoutComplete = lazy(() => import('./pages/StripeCheckoutComplete'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const VerificationSent = lazy(() => import('./pages/VerificationSent'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail'));
const AdminLogs = lazy(() => import('./pages/admin/AdminLogs'));
const AdminLoginHistory = lazy(() => import('./pages/admin/AdminLoginHistory'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminFeedback = lazy(() => import('./pages/admin/AdminFeedback'));
const AdminChangePassword = lazy(() => import('./pages/admin/AdminChangePassword'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

// 市场调研深色外壳布局(需登录)。research 路由从浅色 AntD AppLayout 拆出,改用 MarketIntel AppShell。
function ResearchLayout() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <AppShell />;
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const fetchGeo = useGeoStore((s) => s.fetchGeo);
  useEffect(() => {
    if (localStorage.getItem('accessToken')) fetchMe();
    fetchGeo();
  }, [fetchMe, fetchGeo]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* --- Admin routes (separate layout, no top-bar) --- */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          <Route path="change-password" element={<AdminChangePassword />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="logins" element={<AdminLoginHistory />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="feedback" element={<AdminFeedback />} />
        </Route>

        {/* --- 全屏深色认证页(无 AntD 外壳) --- */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* --- Public + user routes(浅色 AntD 外壳:定价/支付/找回密码等) --- */}
        <Route element={<AppLayout />}>
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/checkout/stripe" element={<RequireAuth><StripeEmbeddedCheckout /></RequireAuth>} />
          <Route path="/checkout/stripe/complete" element={<RequireAuth><StripeCheckoutComplete /></RequireAuth>} />
          <Route path="/checkout/stripe/success" element={<RequireAuth><StripeCheckoutReturn mode="success" /></RequireAuth>} />
          <Route path="/checkout/stripe/cancel" element={<RequireAuth><StripeCheckoutReturn mode="cancel" /></RequireAuth>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/verification-sent" element={<VerificationSent />} />

          <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
        </Route>

        {/* --- 市场调研业务路由:MarketIntel 深色外壳(独立于 AntD AppLayout) --- */}
        <Route element={<ResearchLayout />}>
          <Route path="/projects" element={<Projects />} />
          <Route path="/research/new" element={<ResearchNew />} />
          <Route path="/research/compare" element={<ResearchCompare />} />
          <Route path="/research/:id" element={<ProjectWorkspace />} />
        </Route>

        {/* 入口直达深色应用:首页/未知路由 → /projects(未登录会再跳 /login) */}
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </Suspense>
  );
}
