/** ข้อความสถานะของหน้า: กำลังโหลด / ว่าง / ผิดพลาด — ใช้โทนเดียวกันทุกหน้า */

export function LoadingBlock({
  label = 'กำลังโหลดข้อมูล…',
}: {
  label?: string;
}): React.JSX.Element {
  return (
    <div className="state-block" role="status">
      {label}
    </div>
  );
}

export function EmptyBlock({ label }: { label: string }): React.JSX.Element {
  return <div className="state-block">{label}</div>;
}

export function ErrorBlock({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}): React.JSX.Element {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="state-block error" role="alert">
      {message}
      {onRetry !== undefined && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={onRetry}>
            ลองใหม่
          </button>
        </div>
      )}
    </div>
  );
}
