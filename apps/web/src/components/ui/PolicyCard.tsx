/**
 * การ์ดสรุปความเสี่ยง 4 ใบ — คัดลอกโครงและข้อความจาก legacy/report-jul69.html
 * (แถบสีหนา 5px ที่ขอบล่าง, ตัวเลข 2.2rem หนา 700 ชิดขวา)
 */
import { RiskLevel } from '@cert-tracker/shared';

/** ข้อความบนการ์ดตรงกับไฟล์เดิมทุกบรรทัด — เกณฑ์ตรวจรับคือเปิดเทียบแล้วเหมือน */
const POLICY_META: Record<
  RiskLevel,
  { modifier: string; heading: string; color: string; lines: [string, string] }
> = {
  [RiskLevel.HIGH]: {
    modifier: 'high',
    heading: 'ความเสี่ยงสูง (High)',
    color: 'var(--red)',
    lines: ['เหลืออายุน้อยกว่า 30 วัน', 'ต้องดำเนินการทันที'],
  },
  [RiskLevel.MEDIUM]: {
    modifier: 'medium',
    heading: 'ความเสี่ยงกลาง (Medium)',
    color: 'var(--orange)',
    lines: ['เหลืออายุ 31 - 60 วัน', 'ควรเริ่มวางแผนต่ออายุ'],
  },
  [RiskLevel.LOW]: {
    modifier: 'low',
    heading: 'ความเสี่ยงต่ำ (Low)',
    color: 'var(--risk-low-text)',
    lines: ['เหลืออายุ 61 - 90 วัน', 'อยู่ในเกณฑ์เฝ้าระวัง'],
  },
  [RiskLevel.SAFE]: {
    modifier: 'info',
    heading: 'ปกติ (Safe)',
    color: 'var(--green)',
    lines: ['เหลืออายุมากกว่า 91 วัน', 'สถานะใบรับรองปลอดภัย'],
  },
};

interface PolicyCardProps {
  risk: RiskLevel;
  count: number;
}

export function PolicyCard({ risk, count }: PolicyCardProps): React.JSX.Element {
  const meta = POLICY_META[risk];
  return (
    <div className={`policy-card ${meta.modifier}`}>
      <div className="policy-info">
        <h4 style={{ color: meta.color }}>{meta.heading}</h4>
        <p>
          {meta.lines[0]}
          <br />
          {meta.lines[1]}
        </p>
      </div>
      <div className="policy-count">{count}</div>
    </div>
  );
}
