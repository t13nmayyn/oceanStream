import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useApiHealth } from '../hooks/useApiHealth';
import AppNav from '../components/navigation/AppNav';
import ArgoView from '../components/argo/ArgoView';
import { Eye } from 'lucide-react';

function ObservationsInner() {
  useApiHealth();

  return (
    <div className="flex flex-col h-full" style={{ paddingTop: '56px' }}>
      {/* Page header */}
      <div
        className="px-6 py-4"
        style={{ borderBottom: '1px solid rgba(30, 48, 85, 0.5)', background: 'rgba(9, 14, 26, 0.8)' }}
      >
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Eye size={18} style={{ color: '#00e08c' }} />
          <div>
            <h1
              className="text-[20px] font-bold text-white leading-none"
              style={{ fontFamily: 'Outfit, Inter, sans-serif' }}
            >
              Ocean Observations
            </h1>
            <p className="text-muted text-[12px] mt-0.5">
              Core Argo & BGC-Argo float data via{' '}
              <span className="font-mono" style={{ color: '#00e08c' }}>/argo/nearest</span>
              {' '}and{' '}
              <span className="font-mono" style={{ color: '#00e08c' }}>/argo/profile</span>
            </p>
          </div>

          {/* Legend */}
          <div className="ml-auto flex gap-4">
            {[
              { label: 'Core Argo', color: '#7b5af5', desc: 'T/S profiles to 2000m' },
              { label: 'BGC-Argo', color: '#00e08c', desc: 'O₂, Chl, NO₃, pH, pCO₂' },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-2 text-[12px]">
                <div className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                <div>
                  <div style={{ color: l.color }}>{l.label}</div>
                  <div className="text-muted text-[10px]">{l.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ArgoView fills remaining space */}
      <div className="flex-1 overflow-hidden">
        <ArgoView />
      </div>
    </div>
  );
}

export default function ObservationsPage() {
  useEffect(() => {
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen"
      style={{ background: '#06090f', display: 'flex', flexDirection: 'column' }}
    >
      <AppNav />
      <div style={{ flex: 1, minHeight: 0 }}>
        <ObservationsInner />
      </div>
    </motion.div>
  );
}
