import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function ProfileChart({ depths = [], temps = [], source = 'unknown' }) {
  const data = {
    labels: depths,
    datasets: [
      {
        label: 'Temperature (°C)',
        data: temps,
        borderColor: '#00c8ff',
        backgroundColor: 'rgba(0, 200, 255, 0.15)',
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        title: { display: true, text: 'Temperature (°C)', color: '#6b83a6' },
        grid: { color: '#1e3055' },
        ticks: { color: '#6b83a6', font: { family: 'JetBrains Mono, monospace', size: 11 } },
      },
      y: {
        reverse: true,
        title: { display: true, text: 'Depth (m)', color: '#6b83a6' },
        grid: { color: '#1e3055' },
        ticks: { color: '#6b83a6', font: { family: 'JetBrains Mono, monospace', size: 11 } },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: '#d4e3f7',
          font: { family: 'JetBrains Mono, monospace', size: 12 },
        },
      },
      tooltip: {
        backgroundColor: '#0d1525',
        titleColor: '#00c8ff',
        bodyColor: '#d4e3f7',
        borderColor: '#1e3055',
        borderWidth: 1,
      },
    },
  };

  return (
    <div className="w-full h-full min-h-[400px] relative">
      <div className="absolute right-2 top-1 z-10 text-[10px] text-muted">Source: {source}</div>
      <Line data={data} options={options} />
    </div>
  );
}
