import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react'
import useModalA11y from '../../hooks/useModalA11y'

export default function ConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel, danger = false, onConfirm, onCancel, onClose }) {
  const dialogRef = useModalA11y(onClose)

  return (
    <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50 p-4" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'confirm-modal-title' : undefined}
        tabIndex={-1}
        className="bg-[#0c1e18] rounded-xl border border-white/[0.1] max-w-sm w-full p-6 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center gap-2">
            {danger
              ? <IconAlertTriangle size={18} className="text-red-500 shrink-0" />
              : <IconCircleCheck size={18} className="text-[#10b981] shrink-0" />
            }
            <h3 id="confirm-modal-title" className="font-medium text-white">{title}</h3>
          </div>
        )}
        <p className="text-gray-400 text-sm leading-relaxed">{message}</p>
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="btn-secondary text-sm px-4">Cancel</button>
            <button
              onClick={() => { onConfirm(); onClose() }}
              className={danger ? 'btn-danger text-sm px-4' : 'btn-primary text-sm px-4'}
            >
              {confirmLabel}
            </button>
          </div>
          {cancelLabel && onCancel && (
            <button
              onClick={() => { onCancel(); onClose() }}
              className="w-full text-xs text-gray-400 hover:text-gray-200 py-1.5 underline underline-offset-2 text-center transition-colors"
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
