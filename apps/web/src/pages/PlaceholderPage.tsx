/**
 * หน้าที่ยังไม่ถึงคิวทำ — มีเมนูให้กดได้ตาม PLAN.md Phase 6 แต่บอกตรงๆ ว่าจะเสร็จเฟสไหน
 * (ดีกว่าเมนูที่กดแล้วไม่มีอะไรเกิดขึ้น)
 */
import { Card, CardTitle } from '../components/ui/Card';

interface PlaceholderPageProps {
  title: string;
  phase: string;
  description: string;
}

export function PlaceholderPage({
  title,
  phase,
  description,
}: PlaceholderPageProps): React.JSX.Element {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      <Card>
        <CardTitle>ยังไม่เปิดใช้งาน</CardTitle>
        <div className="placeholder-note">หน้านี้จะพัฒนาใน {phase} ตามแผนงานใน docs/PLAN.md</div>
      </Card>
    </>
  );
}
