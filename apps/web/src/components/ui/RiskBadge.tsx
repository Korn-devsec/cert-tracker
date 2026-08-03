/** badge ความเสี่ยงแบบ pill (radius 6px พื้นสีตาม risk ตัวอักษรขาว) ตาม Design System */
import type { RiskLevel } from '@cert-tracker/shared';
import { RISK_COLOR, RISK_SHORT_LABEL, riskLabel } from '../../lib/format';

export function RiskBadge({ risk }: { risk: RiskLevel }): React.JSX.Element {
  return (
    <span className="badge" style={{ background: RISK_COLOR[risk] }} title={riskLabel(risk)}>
      {RISK_SHORT_LABEL[risk]}
    </span>
  );
}
