import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import RouteFallback from './components/RouteFallback.jsx';

import Login from './pages/Login.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useRouteFocus } from './utils/useRouteFocus.js';
import { useTheme } from './context/ThemeContext.jsx';

// Route-level splitting. Only the login screen is eager — every other page is
// behind auth, so an unauthenticated visitor should never download them.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Prompts = lazy(() => import('./pages/Prompts.jsx'));
const PromptDetails = lazy(() => import('./pages/PromptDetails.jsx'));
const Contests = lazy(() => import('./pages/Contests.jsx'));
const ContestCreate = lazy(() => import('./pages/ContestCreate.jsx'));
const ContestEdit = lazy(() => import('./pages/ContestEdit.jsx'));
const ContestDetail = lazy(() => import('./pages/ContestDetail.jsx'));

function Shell({ children }) {
  const { user } = useAuth();
  const mainRef = useRouteFocus();
  const mainProps = { id: 'main-content', ref: mainRef, tabIndex: -1, className: 'outline-none' };

  return (
    // overflow-x-hidden keeps the page from ever scrolling horizontally; tables
    // inside individual pages provide their own overflow-x-auto so they scroll
    // within their card rather than pushing the whole page sideways.
    <div className="min-h-screen flex flex-col overflow-x-hidden">
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
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
              <Route path="/prompts" element={<ProtectedRoute><Prompts /></ProtectedRoute>} />
              <Route path="/prompts/:id" element={<ProtectedRoute><PromptDetails /></ProtectedRoute>} />
              <Route path="/contests" element={<ProtectedRoute><Contests /></ProtectedRoute>} />
              <Route path="/contests/new" element={<ProtectedRoute><ContestCreate /></ProtectedRoute>} />
              <Route path="/contests/:id/edit" element={<ProtectedRoute><ContestEdit /></ProtectedRoute>} />
              <Route path="/contests/:id" element={<ProtectedRoute><ContestDetail /></ProtectedRoute>} />
          <Route
            path="*"
            element={
              <div className="max-w-3xl mx-auto p-10 text-center">
                <h1 className="text-2xl font-semibold text-ink">Page not found</h1>
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
    <Shell>
      <ThemedToaster />
      <AnimatedRoutes />
    </Shell>
  );
}
