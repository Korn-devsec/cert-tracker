/** การ์ดและหัวข้อการ์ดตาม Design System (radius 16px, เงาบาง, หัวข้อมีแถบน้ำเงินซ้าย) */

interface CardProps {
  children: React.ReactNode;
  /** `flush` = การ์ดที่ไม่มี padding สำหรับใส่ตารางเต็มความกว้าง */
  flush?: boolean;
  className?: string;
}

export function Card({ children, flush = false, className = '' }: CardProps): React.JSX.Element {
  const classes = ['card', flush ? 'card-flush' : '', className].filter(Boolean).join(' ');
  return <section className={classes}>{children}</section>;
}

export function CardTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h2 className="card-title">{children}</h2>;
}
