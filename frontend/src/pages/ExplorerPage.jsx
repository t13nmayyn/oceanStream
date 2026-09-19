import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApiHealth } from '../hooks/useApiHealth';
import { useDateControls } from '../hooks/useDateControls';

import AppNav from '../components/navigation/AppNav';
import StudentExplorer from '../components/student/StudentExplorer';
import ScientistExplorer from '../components/scientist/ScientistExplorer';
import OceanStreamCopilot from '../components/copilot/OceanStreamCopilot';

export default function ExplorerPage() {
  const { userMode } = useApp();
  const [selectedPoint, setSelectedPoint] = useState(null);
  useWebSocket();
  useApiHealth();
  useDateControls();

  // Lock body scroll in explorer
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handlePointClick = useCallback((lat, lon) => {
    setSelectedPoint({ lat, lon });
  }, []);

  return (
    <div
      className="explorer-layout flex flex-col w-screen h-screen overflow-hidden bg-slate-950 text-slate-100"
    >
      {/* Top navigation */}
      <AppNav />

      {/* Main View Area */}
      <div
        className="flex-1 relative overflow-hidden"
        style={{ paddingTop: '56px' }}
      >
        <AnimatePresence mode="wait">
          {userMode === 'student' ? (
            <motion.div
              key="student-mode"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full absolute inset-0"
            >
              <StudentExplorer />
            </motion.div>
          ) : (
            <motion.div
              key="scientist-mode"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full absolute inset-0"
            >
              <ScientistExplorer
                selectedPoint={selectedPoint}
                onPointClick={handlePointClick}
                onClearPoint={() => setSelectedPoint(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <OceanStreamCopilot
        selectedPoint={selectedPoint}
        onSelectPoint={setSelectedPoint}
      />
    </div>
  );
}
