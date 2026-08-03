/**
 * ตัวห่อ Chart.js แบบบางที่สุด — ใช้ Chart.js ตรงๆ ตาม Tech Stack ใน CLAUDE.md
 * (ไม่เพิ่ม react-chartjs-2 เพราะที่ต้องการคือ mount/update/destroy เท่านั้น)
 *
 * ลงทะเบียน component ของ Chart.js เองตามที่ใช้ (tree-shaking) + ปลั๊กอิน datalabels
 */
import { useEffect, useRef } from 'react';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type ChartType,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(
  ArcElement,
  BarElement,
  BarController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  ChartDataLabels,
);

interface ChartCanvasProps<T extends ChartType> {
  type: T;
  data: ChartData<T>;
  options: ChartOptions<T>;
  /** ข้อความสำหรับผู้ใช้ screen reader (canvas ไม่มีเนื้อหาให้อ่าน) */
  ariaLabel: string;
}

export function ChartCanvas<T extends ChartType>({
  type,
  data,
  options,
  ariaLabel,
}: ChartCanvasProps<T>): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<T> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const chart = new Chart<T>(canvas, { type, data, options });
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
    // สร้างใหม่เมื่อเปลี่ยนชนิดกราฟเท่านั้น — การอัปเดตข้อมูลอยู่ใน effect ด้านล่าง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart === null) {
      return;
    }
    // อัปเดตในที่เดิมเพื่อให้เปลี่ยนตัวกรองแล้วกราฟไม่กระพริบ
    chart.data = data;
    chart.options = options;
    chart.update();
  }, [data, options]);

  return <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />;
}
