import { useState, useEffect, useRef } from 'react'
import { IconX } from '@tabler/icons-react'

let _addToast = null
let _nextId = 0

const TTL = 3500

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), TTL)
    return () => clearTimeout(t)
  }, [toast.id, onDismiss])

  const bg = toast.type === 'error' ? 'bg-red-600' : toast.type === 'warn' ? 'bg-amber-600' : 'bg-[#10b981]'
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-white text-sm font-medium shadow-lg ${bg}`}>
      {toast.message}
      <button onClick={() => onDismiss(toast.id)} aria-label="Dismiss" className="ml-2 opacity-70 hover:opacity-100">
        <IconX size={14} />
      </button>
    </div>
  )
}

export function ToastProvider() {
  const [toasts, setToasts] = useState([])
  const dismiss = useRef(id => setToasts(list => list.filter(t => t.id !== id))).current

  useEffect(() => {
    _addToast = (message, type) => setToasts(list => [...list, { id: _nextId++, message, type }])
    return () => { _addToast = null }
  }, [])

  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end" role="status" aria-live="polite">
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
    </div>
  )
}

export function showToast(message, type = 'success') {
  _addToast?.(message, type)
}
