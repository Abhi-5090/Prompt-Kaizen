import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import RouteFallback from './components/RouteFallback.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useRouteFocus } from './utils/useRouteFocus.js';
import { useTheme } from './context/ThemeContext.jsx';

// Routes below the fold are split into their own chunks. Everything used to
// ship in one ~920 KB entry bundle, so a visitor on the landing page paid to
// download the contest engine, the dashboard charts and the share-card
// renderer before seeing anything. Landing/Login/Register stay eager — they
// are the first paint, and deferring them would add a round trip.
const VerifyEmail = lazy(() => import('./pages/VerifyEmail.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const PromptAnalyzer = lazy(() => import('./pages/PromptAnalyzer.jsx'));
const PromptResult = lazy(() => import('./pages/PromptResult.jsx'));
const PromptHistory = lazy(() => import('./pages/PromptHistory.jsx'));
const PromptDetails = lazy(() => import('./pages/PromptDetails.jsx'));
const DailyChallenge = lazy(() => import('./pages/DailyChallenge.jsx'));
const Contests = lazy(() => import('./pages/Contests.jsx'));
const ContestTake = lazy(() => import('./pages/ContestTake.jsx'));
const ContestLeaderboard = lazy(() => import('./pages/ContestLeaderboard.jsx'));
const ContestSpecificLeaderboard = lazy(() => import('./pages/ContestSpecificLeaderboard.jsx'));

function AppShell({ children }) {
  const { user } = useAuth();
  const mainRef = useRouteFocus();

  // Shared so the skip link, the landmark and the focus target cannot drift.
  const mainProps = {
    id: 'main-content',
    ref: mainRef,
    tabIndex: -1,
    // Suppresses the focus ring when focus is moved programmatically on
    // navigation; :focus-visible still shows it for real keyboard focus.
    className: 'outline-none',
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* First element in the tab order. Without it, reaching page content by
          keyboard means tabbing past the entire nav on every single route. */}
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Navbar />
      <div className="flex-1">
        {user ? (
          <main
            {...mainProps}
            className={`${mainProps.className} max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-10 py-8`}
          >
            {children}
          </main>
        ) : (
          <main {...mainProps}>{children}</main>
        )}
      </div>
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  // Pass `location` to <Routes> so that during AnimatePresence's exit phase
  // the outgoing page keeps rendering the OLD route until its exit completes.
  // Without this, the old motion.div would render the new route's content
  // mid-exit, causing a visible flash.
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Routes location={location}>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
          {/* Target of the emailed reset link: /reset-password?token=…&email=… */}
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/analyze" element={<ProtectedRoute><PromptAnalyzer /></ProtectedRoute>} />
              <Route path="/challenge" element={<ProtectedRoute><DailyChallenge /></ProtectedRoute>} />
              <Route path="/contests" element={<ProtectedRoute><Contests /></ProtectedRoute>} />
              <Route path="/contests/leaderboard" element={<ProtectedRoute><ContestLeaderboard /></ProtectedRoute>} />
              <Route path="/contests/:id/leaderboard" element={<ProtectedRoute><ContestSpecificLeaderboard /></ProtectedRoute>} />
              <Route path="/contests/:id" element={<ProtectedRoute><ContestTake /></ProtectedRoute>} />
              <Route path="/result/:id" element={<ProtectedRoute><PromptResult /></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><PromptHistory /></ProtectedRoute>} />
              <Route path="/prompts/:id" element={<ProtectedRoute><PromptDetails /></ProtectedRoute>} />

          <Route
            path="*"
            element={
              <div className="max-w-3xl mx-auto p-10 text-center">
                <h1 className="text-2xl font-semibold text-ink">Page not found</h1>
                <p className="text-brand-text mt-2">The page you were looking for doesn't exist.</p>
              </div>
            }
          />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Toasts styled from the design tokens.
 *
 * react-hot-toast takes inline style objects rather than class names, so its
 * colours cannot come from Tailwind. Hardcoded, every toast stayed dark-on-
 * dark in the dark theme.
 */
function ThemedToaster() {
  const { resolved } = useTheme();
  const read = (name, fallback) => {
    if (typeof window === 'undefined') return fallback;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
    return raw ? `rgb(${raw})` : fallback;
  };
  // Keyed on the resolved theme so the whole Toaster remounts with fresh
  // colours when it changes.
  return (
    <Toaster
      key={resolved}
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          borderRadius: '12px',
          background: read('surface-raised', '#ffffff'),
          color: read('ink', '#212529'),
          border: `1px solid ${read('border', '#dee2e6')}`,
          fontSize: '13px',
          fontWeight: 500,
          padding: '10px 14px',
          boxShadow: '0 18px 40px -16px rgb(var(--shadow-strength))',
        },
        success: { iconTheme: { primary: read('brand', '#F15D23'), secondary: read('brand-fg', '#ffffff') } },
        error:   { iconTheme: { primary: read('danger', '#c82d2d'), secondary: read('brand-fg', '#ffffff') } },
      }}
    />
  );
}

export default function App() {
  return (
    <AppShell>
      <ThemedToaster />
      <AnimatedRoutes />
    </AppShell>
  );
}
