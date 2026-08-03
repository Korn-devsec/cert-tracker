import { describe, expect, it } from 'vitest';
import {
  NotificationTier,
  RISK_LEVEL_LABEL_TH,
  RiskLevel,
  WORK_STATUS_LABEL_TH,
  WorkStatus,
} from '../src';

describe('shared enums', () => {
  it('RiskLevel มี 4 ระดับตามการ์ดสรุปในดีไซน์', () => {
    expect(Object.values(RiskLevel)).toEqual(['HIGH', 'MEDIUM', 'LOW', 'SAFE']);
  });

  it('WorkStatus ครอบ workflow ทั้งเส้นรวม Cancelled', () => {
    expect(Object.values(WorkStatus)).toEqual([
      'NEW',
      'ASSIGNED',
      'IN_PROGRESS',
      'WAITING_VENDOR',
      'WAITING_CA',
      'TESTING',
      'COMPLETED',
      'CANCELLED',
    ]);
  });

  it('NotificationTier ครอบ 4 ขั้นบันได', () => {
    expect(Object.values(NotificationTier)).toEqual(['DAY_90', 'DAY_60', 'DAY_30', 'DAY_7']);
  });

  it('ทุกค่าใน enum มี label ภาษาไทย', () => {
    for (const risk of Object.values(RiskLevel)) {
      expect(RISK_LEVEL_LABEL_TH[risk]).toBeTruthy();
    }
    for (const status of Object.values(WorkStatus)) {
      expect(WORK_STATUS_LABEL_TH[status]).toBeTruthy();
    }
  });
});
