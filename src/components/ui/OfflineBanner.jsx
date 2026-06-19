import { IconWifiOff } from '@tabler/icons-react'
import useOnlineStatus from '../../hooks/useOnlineStatus'

export default function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-amber-900/30 border-b border-amber-700/30 px-4 py-1.5 text-sm text-amber-300"
    >
      <IconWifiOff size={15} className="shrink-0" />
      <span>You're offline — showing cached data.</span>
    </div>
  )
}
