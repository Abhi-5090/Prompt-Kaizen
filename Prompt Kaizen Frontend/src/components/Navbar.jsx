import { Link, NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Sparkles, History, LogOut, LogIn, UserPlus, Menu, X, Calendar, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from './Logo.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItem = ({ isActive }) =>
    `relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'text-brand-fg' : 'text-ink hover:text-brand-text'
    }`;

  const links = user
    ? [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/analyze',   label: 'Analyze',   icon: Sparkles },
        { to: '/challenge', label: 'Challenge', icon: Calendar },
        { to: '/contests',  label: 'Contests',  icon: Trophy },
        { to: '/history',   label: 'History',   icon: History },
      ]
    : [];

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="sticky top-0 z-40 glass border-b border-line"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-2.5 shrink-0">
          <Logo />
          <div className="leading-tight">
            <p className="font-bold tracking-tight text-brand-text">Prompt Kaizen</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink font-semibold">Compatibility Analyzer</p>
          </div>
        </Link>

        {user ? (
          <nav className="hidden lg:flex items-center gap-1">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={navItem}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="navActive"
                        className="absolute inset-0 -z-10 rounded-lg bg-brand"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <l.icon className="w-4 h-4" strokeWidth={2} />
                    <span>{l.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        ) : (
          <nav className="hidden md:flex items-center gap-4 text-sm text-brand-text">
            <a href="#features" className="hover:text-ink transition">Features</a>
            <a href="#how" className="hover:text-ink transition">How it works</a>
            <a href="#scoring" className="hover:text-ink transition">Scoring</a>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {/* Reachable whether or not anyone is signed in — a visitor reading
              the landing page in a dark room needs it as much as a user. */}
          <span className="hidden sm:block"><ThemeToggle /></span>
          <span className="sm:hidden"><ThemeToggle compact /></span>

          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-2 pr-2">
                <div className="w-8 h-8 rounded-full bg-panel text-brand-fg flex items-center justify-center text-xs font-bold uppercase">
                  {user.name?.[0] || 'U'}
                </div>
                <span className="text-sm text-ink hidden lg:inline">{(user.name || 'User').split(' ')[0]}</span>
              </div>
              <button onClick={handleLogout} className="btn-ghost text-sm border-panel" aria-label="Log out">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
              <button
                onClick={() => setOpen((v) => !v)}
                className="lg:hidden btn-ghost p-2"
                aria-label="Menu"
              >
                {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost text-sm">
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Login</span>
              </Link>
              <Link to="/register" className="btn-primary text-sm">
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Register</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile drawer (authed) */}
      {user && open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="lg:hidden border-t border-line bg-surface"
        >
          <div className="px-4 py-3 flex flex-col gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive ? 'bg-brand text-brand-fg' : 'text-ink'
                  }`
                }
              >
                <l.icon className="w-4 h-4" />
                <span>{l.label}</span>
              </NavLink>
            ))}
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}
