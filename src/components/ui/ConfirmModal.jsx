import { useEffect } from 'react'

export default function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onClose }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-3" onClick={e => e.stopPropagation()}>
        {title && (
          <div className="flex items-center gap-2">
            <span className={`text-lg ${danger ? 'text-red-500' : 'text-green-600'}`}>
              {danger ? '⚠️' : '✅'}
            </span>
            <h3 className="font-bold text-gray-900">{title}</h3>
          </div>
        )}
        <p className="text-gray-600 text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3 pt-1 justify-end">
          <button onClick={onClose} className="btn-secondary text-sm px-4">Cancel</button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${
              danger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
