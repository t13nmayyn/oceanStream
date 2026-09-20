import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AppProvider } from './context/AppContext';

import LandingPage from './pages/LandingPage';
import ExplorerPage from './pages/ExplorerPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ObservationsPage from './pages/ObservationsPage';
import DiagnosticsPage from './pages/DiagnosticsPage';
import AboutPage from './pages/AboutPage';

import Toast from './components/ui/Toast';

// WebSocket + API health hooks are initialized inside pages that need them
// to avoid re-mounting on route changes

export default function App() {
  const location = useLocation();

  return (
    <AppProvider>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/explorer" element={<ExplorerPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/observations" element={<ObservationsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/system" element={<DiagnosticsPage />} />
          {/* Fallback to landing */}
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </AnimatePresence>
      <Toast />
    </AppProvider>
  );
}
