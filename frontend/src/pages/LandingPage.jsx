import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { API_BASE } from '../config/api';

import HeroSection from '../components/landing/HeroSection';
import SectionChallenge from '../components/landing/SectionChallenge';
import SectionPipeline from '../components/landing/SectionPipeline';
import SectionVariables from '../components/landing/SectionVariables';
import SectionDepth from '../components/landing/SectionDepth';
import SectionModelObs from '../components/landing/SectionModelObs';
import SectionCTA from '../components/landing/SectionCTA';

const navLinks = [
  { href: '#challenge', label: 'Platform' },
  { href: '#variables', label: 'Variables' },
  { href: '#depth', label: 'Depth' },
  { href: '#models', label: 'Models' },
];

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      className={`os-landing-nav ${scrolled ? 'is-scrolled' : ''}`}
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="os-nav-inner">
        <Link to="/" className="os-brand" onClick={() => setMobileOpen(false)}>
          <span className="os-brand-mark">≈</span>

          <span className="os-brand-name">
            oceanStream
          </span>

          <span className="os-brand-sub">
            INCOIS · MoES
          </span>
        </Link>

        <div className="os-nav-links">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>

        <Link to="/explorer" className="os-nav-launch">
          Launch Explorer
          <ArrowUpRight size={15} />
        </Link>

        <button
          className="os-mobile-menu"
          onClick={() => setMobileOpen((value) => !value)}
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen && (
        <motion.div
          className="os-mobile-panel"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}

          <Link
            to="/explorer"
            onClick={() => setMobileOpen(false)}
          >
            Launch Explorer
            <ArrowUpRight size={15} />
          </Link>
        </motion.div>
      )}
    </motion.nav>
  );
}

function LandingFooter() {
  return (
    <footer className="os-footer" style={{ background: '#070f1a', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <div className="os-footer-main">
        <div className="os-footer-brand">
          <div className="os-footer-title">
            <span className="os-brand-mark">≈</span>
            oceanStream
          </div>

          <p>
            A multidimensional ocean intelligence platform
            for exploring models, observations and marine data.
          </p>
        </div>

        <div className="os-footer-column">
          <span>PLATFORM</span>
          <Link to="/explorer">Explorer</Link>
          <Link to="/analytics">Analytics</Link>
          <Link to="/observations">Observations</Link>
        </div>

        <div className="os-footer-column">
          <span>DATA</span>
          <a
            href="https://marine.copernicus.eu"
            target="_blank"
            rel="noopener noreferrer"
          >
            CMEMS
          </a>
          <a
            href="https://argo.ucsd.edu"
            target="_blank"
            rel="noopener noreferrer"
          >
            Argo
          </a>
          <a
            href="https://aodn.org.au"
            target="_blank"
            rel="noopener noreferrer"
          >
            AODN
          </a>
        </div>

        <div className="os-footer-column">
          <span>SYSTEM</span>
          <Link to="/system">Diagnostics</Link>
          <a
            href={`${API_BASE}/docs`}
            target="_blank"
            rel="noopener noreferrer"
          >
            API Docs
          </a>
        </div>
      </div>

      <div className="os-footer-bottom">
        <span>© 2026 oceanStream · SIH-26067</span>
        <span>INCOIS · MoES · Smart India Hackathon</span>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  useEffect(() => {
    document.body.style.overflow = 'auto';
    window.scrollTo(0, 0);

    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <motion.div
      className="os-landing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      <LandingNav />

      <main>
        {/* 1. HERO */}
        <HeroSection />

        {/* 2. 4D OCEAN */}
        <div id="challenge">
          <SectionChallenge />
        </div>

        {/* 3. UNIFIED DATA */}
        <div id="pipeline">
          <SectionPipeline />
        </div>

        {/* 4. VARIABLES */}
        <div id="variables">
          <SectionVariables />
        </div>

        {/* 5. DEPTH */}
        <div id="depth">
          <SectionDepth />
        </div>

        {/* 6. MODELS + OBSERVATIONS */}
        <div id="models">
          <SectionModelObs />
        </div>

        {/* 7. FINAL CTA */}
        <SectionCTA />
      </main>

      {/* 8. FOOTER */}
      <LandingFooter />
    </motion.div>
  );
}