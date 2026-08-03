import { NotificationTier, WorkStatus } from '@prisma/client';
import { RiskLevel } from '@cert-tracker/shared';
import { buildNotificationMessage, type NotificationMessageInput } from './message';

const base: NotificationMessageInput = {
  commonName: 'egp.smebank.co.th',
  endpoint: '172.17.7.13:443',
  owner: 'IT Sec',
  issuer: 'CN=DigiCert Global G2 TLS RSA SHA256 2020 CA1,O=DigiCert Inc,C=US',
  companyName: 'SME Bank',
  companyCode: 'SMEBANK',
  expiresAt: new Date('2026-09-18T23:59:59.000Z'),
  daysUntilExpiry: 45,
  riskLevel: RiskLevel.MEDIUM,
  tier: NotificationTier.DAY_60,
  workStatus: WorkStatus.NEW,
};

describe('buildNotificationMessage', () => {
  it('หัวข้อบอกชื่อใบรับรอง จำนวนวันคงเหลือ และรหัสบริษัท', () => {
    const message = buildNotificationMessage(base);
    expect(message.subject).toBe('[แจ้งเตือน SSL] egp.smebank.co.th เหลือ 45 วัน (SMEBANK)');
  });

  it('เนื้อหาเป็นภาษาไทย ใช้ปี พ.ศ. และมีข้อมูลที่ต้องใช้ตัดสินใจครบ', () => {
    const { text } = buildNotificationMessage(base);

    expect(text).toContain('18 กันยายน 2569'); // พ.ศ. ตาม Design System
    expect(text).toContain('SME Bank (SMEBANK)');
    expect(text).toContain('egp.smebank.co.th');
    expect(text).toContain('172.17.7.13:443');
    expect(text).toContain('IT Sec');
    expect(text).toContain('ความเสี่ยงกลาง');
    expect(text).toContain('รายการใหม่');
    expect(text).toContain('แจ้งเตือนล่วงหน้า 60 วัน');
  });

  it('ขั้น 90/60 ไม่ใช่ขั้นด่วน ส่วน 30/7 เป็นขั้นด่วน', () => {
    expect(buildNotificationMessage({ ...base, tier: NotificationTier.DAY_90 }).isCritical).toBe(
      false,
    );
    expect(buildNotificationMessage(base).isCritical).toBe(false);
    expect(
      buildNotificationMessage({ ...base, tier: NotificationTier.DAY_30, daysUntilExpiry: 20 })
        .isCritical,
    ).toBe(true);
    expect(
      buildNotificationMessage({ ...base, tier: NotificationTier.DAY_7, daysUntilExpiry: 5 })
        .isCritical,
    ).toBe(true);
  });

  it('ใบที่หมดอายุแล้ว → ข้อความเปลี่ยนเป็น "หมดอายุแล้ว N วัน" และถือเป็นเรื่องด่วน', () => {
    const message = buildNotificationMessage({
      ...base,
      daysUntilExpiry: -5,
      riskLevel: RiskLevel.HIGH,
      tier: NotificationTier.DAY_7,
    });

    expect(message.subject).toContain('SSL หมดอายุแล้ว');
    expect(message.text).toContain('หมดอายุแล้ว 5 วัน');
    expect(message.text).toContain('โดยเร็วที่สุด');
    expect(message.isCritical).toBe(true);
  });

  it('ค่าที่ไม่มีในข้อมูล (owner/issuer/endpoint/งาน) แสดงเป็นค่าที่อ่านได้ ไม่ใช่ null', () => {
    const { text } = buildNotificationMessage({
      ...base,
      owner: null,
      issuer: null,
      endpoint: '',
      workStatus: null,
    });

    expect(text).toContain('ผู้ดูแล: -');
    expect(text).toContain('ผู้ออกใบรับรอง: -');
    expect(text).toContain('Endpoint: -');
    expect(text).toContain('ยังไม่มีงานต่ออายุ');
    expect(text).not.toContain('null');
  });
});
