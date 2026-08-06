import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/Toast";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import Home from "@/pages/Home";
import UploadPage from "@/pages/UploadPage";
import ExplorerPage from "@/pages/ExplorerPage";
import AnalysisPage from "@/pages/AnalysisPage";
import ScraperPage from "@/pages/ScraperPage";
import { useAuthStore } from "@/store/useAuthStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="/explorer" element={<ExplorerPage />} />
                <Route path="/analysis" element={<AnalysisPage />} />
                <Route path="/scraper" element={<ScraperPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </Router>
      </ToastProvider>
    </QueryClientProvider>
  );
}
