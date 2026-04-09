import { STATUS_LABEL, STATUS_CLASS } from '../../utils/balanceCalculator'

export default function BalanceBadge({ status }) {
  const cls = STATUS_CLASS[status] ?? 'badge-good'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
