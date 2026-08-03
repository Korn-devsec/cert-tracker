/**
 * แปลง DashboardSummary จาก api เป็นข้อมูลของกราฟ — ฟังก์ชันล้วน ทดสอบได้ตรงๆ
 *
 * ค่าคงที่ของกราฟ (สี, cutout 70%, borderRadius 4, datalabels ตัวหนาสีขาว, legend ล่าง)
 * ถอดมาจาก legacy/report-jul69.html เพื่อให้หน้าตาเหมือนเดิม
 */
import type { ChartOptions } from 'chart.js';
import { RiskLevel } from '@cert-tracker/shared';
import { RISK_COLOR, RISK_ORDER, RISK_SHORT_LABEL } from '../lib/format';
import type { DashboardSummary } from '../lib/types';

export const RISK_LABELS = RISK_ORDER.map((risk) => RISK_SHORT_LABEL[risk]);
export const RISK_COLORS = RISK_ORDER.map((risk) => RISK_COLOR[risk]);

/** ฟอนต์ Sarabun ต้องใช้ในกราฟด้วย (Design System ระบุไว้ว่า "รวมถึงใน Chart") */
export const CHART_FONT_FAMILY = 'Sarabun';

export const DATALABEL_STYLE = {
  color: '#fff',
  font: { weight: 'bold' as const, size: 14, family: CHART_FONT_FAMILY },
  /** ไฟล์เดิมซ่อนเลข 0 ไม่ให้รบกวนสายตา */
  formatter: (value: number): string => (value > 0 ? String(value) : ''),
};

export function riskDoughnutData(summary: DashboardSummary): {
  labels: string[];
  datasets: Array<{ data: number[]; backgroundColor: string[]; borderWidth: number }>;
} {
  return {
    labels: RISK_LABELS,
    datasets: [
      {
        data: RISK_ORDER.map((risk) => summary.byRisk[risk] ?? 0),
        backgroundColor: RISK_COLORS,
        borderWidth: 0,
      },
    ],
  };
}

export const riskDoughnutOptions: ChartOptions<'doughnut'> = {
  maintainAspectRatio: false,
  cutout: '70%',
  plugins: {
    datalabels: DATALABEL_STYLE,
    legend: { position: 'bottom', labels: { font: { family: CHART_FONT_FAMILY } } },
  },
};

/** Grouped bar: เรียบร้อยแล้ว (เขียว) / อยู่ระหว่างดำเนินการ (ส้ม) แยกตามกลุ่มความเสี่ยง */
export function statusBarData(summary: DashboardSummary): {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string;
    borderRadius: number;
  }>;
} {
  return {
    labels: RISK_LABELS,
    datasets: [
      {
        label: 'เรียบร้อยแล้ว',
        data: RISK_ORDER.map((risk) => summary.byRiskStatus[risk]?.done ?? 0),
        backgroundColor: RISK_COLOR[RiskLevel.SAFE],
        borderRadius: 4,
      },
      {
        label: 'อยู่ระหว่างดำเนินการ',
        data: RISK_ORDER.map((risk) => summary.byRiskStatus[risk]?.pending ?? 0),
        backgroundColor: RISK_COLOR[RiskLevel.MEDIUM],
        borderRadius: 4,
      },
    ],
  };
}

export const statusBarOptions: ChartOptions<'bar'> = {
  maintainAspectRatio: false,
  plugins: {
    // ตัวเลขอยู่เหนือแท่ง ใช้สีเข้มเพราะพื้นหลังเป็นสีขาว (ไฟล์เดิมทำแบบนี้)
    datalabels: { ...DATALABEL_STYLE, anchor: 'end', align: 'top', color: '#475569' },
    legend: { labels: { font: { family: CHART_FONT_FAMILY } } },
  },
  scales: {
    y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: CHART_FONT_FAMILY } } },
    x: { ticks: { font: { family: CHART_FONT_FAMILY } } },
  },
};
