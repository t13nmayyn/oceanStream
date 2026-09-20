import { Compass, Microscope } from 'lucide-react';
import { useApp, useAppDispatch } from '../../context/AppContext';

export default function ModeSwitcher({ className = '' }) {
  const { userMode } = useApp();
  const dispatch = useAppDispatch();
  const selectMode = (mode) => dispatch({ type: 'SET_USER_MODE', payload: mode });

  return <div className={`mode-switcher ${className}`} role="radiogroup" aria-label="Workspace mode">
    <button type="button" role="radio" aria-checked={userMode === 'explore'} className={userMode === 'explore' ? 'active' : ''} onClick={() => selectMode('explore')}><Compass size={14} />Explore</button>
    <button type="button" role="radio" aria-checked={userMode === 'analyze'} className={userMode === 'analyze' ? 'active' : ''} onClick={() => selectMode('analyze')}><Microscope size={14} />Analyze</button>
  </div>;
}
