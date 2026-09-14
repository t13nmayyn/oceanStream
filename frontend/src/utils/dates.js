export function getCalculatedDates() {
  const now = new Date();
  const yest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const weekAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 8));
  const monthAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 31));
  const yearAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 366));
  const toIso = (d) => d.toISOString().slice(0, 10);
  return {
    today: toIso(now),
    yesterday: toIso(yest),
    weekAgo: toIso(weekAgo),
    monthAgo: toIso(monthAgo),
    yearAgo: toIso(yearAgo),
  };
}
