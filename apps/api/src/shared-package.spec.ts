import { RiskLevel, WORK_STATUS_LABEL_TH, WorkStatus } from '@cert-tracker/shared';

// ตรวจว่า api (CommonJS) resolve @cert-tracker/shared ได้จริง — กันปัญหา build ของ monorepo
describe('@cert-tracker/shared resolution จากฝั่ง api', () => {
  it('import enum ได้', () => {
    expect(RiskLevel.HIGH).toBe('HIGH');
    expect(WorkStatus.WAITING_CA).toBe('WAITING_CA');
  });

  it('import label ภาษาไทยได้', () => {
    expect(WORK_STATUS_LABEL_TH[WorkStatus.COMPLETED]).toBe('เรียบร้อยแล้ว');
  });
});
