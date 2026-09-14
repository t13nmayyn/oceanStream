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

export default function TimelineChart({ labels = [], temps = [], salinities = [] }) {
  const data = {
    labels,
    datasets: [
      {
        label: 'Temperature (°C)',
        data: temps,
        borderColor: '#00c8ff',
        backgroundColor: 'rgba(0, 200, 255, 0.1)',
        tension: 0.3,
        fill: true,
        yAxisID: 'y',
      },
      {
        label: 'Salinity (PSU)',
        data: salinities,
        borderColor: '#00e08c',
        backgroundColor: 'transparent',
        tension: 0.3,
        fill: false,
        yAxisID: 'y',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: '#1e3055' },
        ticks: { color: '#6b83a6', font: { family: 'JetBrains Mono, monospace', size: 11 } },
      },
      y: {
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
    <div className="w-full h-full min-h-[380px]">
      <Line data={data} options={options} />
    </div>
  );
}
