import { useState, useEffect } from 'react'

let _setToast = null

export function ToastProvider() {
  const [toast, setToast] = useState(null)
  _setToast = setToast

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast) return null
  const bg = toast.type === 'error' ? 'bg-red-600' : toast.type === 'warn' ? 'bg-yellow-500' : 'bg-green-600'
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg text-white shadow-lg text-sm font-medium ${bg}`}>
      {toast.message}
      <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
    </div>
  )
}

export function showToast(message, type = 'success') {
  _setToast?.({ message, type })
}
