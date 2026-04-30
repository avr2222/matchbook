import { useEffect } from 'react'

export default function ConfirmModal({ message, confirmLabel = 'Confirm', danger = false, onConfirm, onClose }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        <p className="text-gray-800 text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3 mt-5 justify-end">
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
