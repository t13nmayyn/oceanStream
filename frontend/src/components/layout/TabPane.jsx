import { useApp } from '../../context/AppContext';

export default function TabPane({ id, children }) {
  const { activeTab } = useApp();
  if (activeTab !== id) return null;
  return <div className="h-full w-full">{children}</div>;
}
