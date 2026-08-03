import { describe, expect, it } from 'vitest';
import { RiskLevel, WorkStatus } from '@cert-tracker/shared';
import type { DashboardSummary } from '../lib/types';
import {
  DATALABEL_STYLE,
  riskDoughnutData,
  riskDoughnutOptions,
  statusBarData,
  statusBarOptions,
} from './chart-data';

const summary: DashboardSummary = {
  asOf: '2026-08-03T00:00:00.000Z',
  companyId: null,
  month: null,
  status: null,
  total: 10,
  byRisk: { HIGH: 4, MEDIUM: 3, LOW: 2, SAFE: 1 },
  byStatus: {
    NEW: 5,
    ASSIGNED: 0,
    IN_PROGRESS: 2,
    WAITING_VENDOR: 0,
    WAITING_CA: 0,
    TESTING: 0,
    COMPLETED: 2,
    CANCELLED: 1,
  },
  byRiskStatus: {
    HIGH: { done: 1, pending: 3, cancelled: 0 },
    MEDIUM: { done: 1, pending: 2, cancelled: 0 },
    LOW: { done: 0, pending: 1, cancelled: 1 },
    SAFE: { done: 0, pending: 1, cancelled: 0 },
  },
  noTask: 0,
  expiringSoon: 3,
  expired: 1,
  completed: 2,
  pending: 7,
  cancelled: 1,
};

describe('riskDoughnutData', () => {
  it('เรียงข้อมูล สูง → กลาง → ต่ำ → ปกติ พร้อมสีตามไฟล์เดิม', () => {
    const data = riskDoughnutData(summary);

    expect(data.labels).toEqual(['สูง', 'กลาง', 'ต่ำ', 'ปกติ']);
    expect(data.datasets[0].data).toEqual([4, 3, 2, 1]);
    expect(data.datasets[0].backgroundColor).toEqual(['#ef4444', '#f97316', '#eab308', '#22c55e']);
    expect(data.datasets[0].borderWidth).toBe(0);
  });

  it('ค่าที่หายไปใน byRisk ให้เป็น 0 ไม่ใช่ undefined (กราฟจะพังถ้าเป็น undefined)', () => {
    const partial = { ...summary, byRisk: { HIGH: 2 } as DashboardSummary['byRisk'] };
    expect(riskDoughnutData(partial).datasets[0].data).toEqual([2, 0, 0, 0]);
  });

  it('ตั้งค่ากราฟตรงกับไฟล์เดิม: cutout 70% + legend ล่าง + ฟอนต์ Sarabun', () => {
    expect(riskDoughnutOptions.cutout).toBe('70%');
    expect(riskDoughnutOptions.plugins?.legend?.position).toBe('bottom');
    expect(riskDoughnutOptions.plugins?.legend?.labels?.font).toEqual({ family: 'Sarabun' });
    expect(riskDoughnutOptions.maintainAspectRatio).toBe(false);
  });
});

describe('statusBarData', () => {
  it('2 ชุดข้อมูล: เรียบร้อยแล้ว (เขียว) และอยู่ระหว่างดำเนินการ (ส้ม) ต่อกลุ่มความเสี่ยง', () => {
    const data = statusBarData(summary);

    expect(data.datasets.map((dataset) => dataset.label)).toEqual([
      'เรียบร้อยแล้ว',
      'อยู่ระหว่างดำเนินการ',
    ]);
    expect(data.datasets[0].data).toEqual([1, 1, 0, 0]);
    expect(data.datasets[1].data).toEqual([3, 2, 1, 1]);
    expect(data.datasets[0].backgroundColor).toBe('#22c55e');
    expect(data.datasets[1].backgroundColor).toBe('#f97316');
    expect(data.datasets[0].borderRadius).toBe(4);
  });

  it('แกน y เริ่มที่ 0 และเดินทีละ 1 (จำนวนใบรับรองเป็นจำนวนเต็ม)', () => {
    // ชนิดของ scales.y ใน Chart.js เป็น union ของทุกชนิดแกน — ระบุรูปร่างที่ใช้จริงเพื่ออ่านค่า
    const yScale = statusBarOptions.scales?.y as {
      beginAtZero: boolean;
      ticks: { stepSize: number };
    };
    expect(yScale.beginAtZero).toBe(true);
    expect(yScale.ticks.stepSize).toBe(1);
  });

  it('ตัวเลขบนแท่งอยู่เหนือแท่งและใช้สีเข้ม (พื้นหลังการ์ดเป็นสีขาว)', () => {
    const datalabels = statusBarOptions.plugins?.datalabels as {
      anchor: string;
      align: string;
      color: string;
    };
    expect(datalabels.anchor).toBe('end');
    expect(datalabels.align).toBe('top');
    expect(datalabels.color).toBe('#475569');
  });
});

describe('DATALABEL_STYLE', () => {
  it('ตัวหนาสีขาวขนาด 14 ฟอนต์ Sarabun ตามไฟล์เดิม', () => {
    expect(DATALABEL_STYLE.color).toBe('#fff');
    expect(DATALABEL_STYLE.font).toEqual({ weight: 'bold', size: 14, family: 'Sarabun' });
  });

  it('ซ่อนเลข 0 ไม่ให้รบกวนสายตา', () => {
    expect(DATALABEL_STYLE.formatter(0)).toBe('');
    expect(DATALABEL_STYLE.formatter(7)).toBe('7');
  });
});

describe('ข้อมูลกราฟต้องมาจาก summary ที่ api ส่งมาเท่านั้น', () => {
  it('ผลรวมของ Doughnut เท่ากับ total ที่ api คำนวณ', () => {
    const doughnut = riskDoughnutData(summary).datasets[0].data;
    expect(doughnut.reduce((sum, value) => sum + value, 0)).toBe(summary.total);
  });

  it('ผลรวมของ Bar (done + pending) + ยกเลิก เท่ากับ total', () => {
    const [done, pending] = statusBarData(summary).datasets;
    const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
    expect(sum(done.data) + sum(pending.data) + summary.cancelled).toBe(summary.total);
    expect(sum(done.data)).toBe(summary.byStatus[WorkStatus.COMPLETED]);
    expect(RiskLevel.HIGH in summary.byRiskStatus).toBe(true);
  });
});
