import { describe, expect, it } from 'vitest';
import { RISK_LEVEL_LABEL_TH, RiskLevel, WorkStatus } from '@cert-tracker/shared';

// ตรวจว่า web (ESM/bundler) resolve @cert-tracker/shared ได้จริง
describe('@cert-tracker/shared resolution จากฝั่ง web', () => {
  it('import enum และ label ได้', () => {
    expect(RiskLevel.SAFE).toBe('SAFE');
    expect(WorkStatus.NEW).toBe('NEW');
    expect(RISK_LEVEL_LABEL_TH[RiskLevel.HIGH]).toBe('ความเสี่ยงสูง');
  });
});
