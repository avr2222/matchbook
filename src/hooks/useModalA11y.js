import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessibility helper for modal dialogs. Returns a ref to attach to the dialog
 * element. While mounted it: moves focus into the dialog, traps Tab/Shift+Tab
 * within it, closes on Escape, locks body scroll, and restores focus to the
 * previously focused element on unmount.
 *
 * @param {() => void} onClose - called when Escape is pressed
 * @param {boolean} [enabled=true] - when false the helper is inert (for modals
 *   that render null while closed but must still call the hook unconditionally)
 */
export default function useModalA11y(onClose, enabled = true) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusables = () => (dialog ? Array.from(dialog.querySelectorAll(FOCUSABLE)) : [])
    const first = focusables()[0]
    if (first) first.focus()
    else if (dialog) dialog.focus()

    const handleKey = e => {
      if (e.key === 'Escape') { onClose?.(); return }
      if (e.key !== 'Tab' || !dialog) return
      const items = focusables()
      if (!items.length) { e.preventDefault(); return }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === firstEl || !dialog.contains(document.activeElement)) {
          e.preventDefault()
          lastEl.focus()
        }
      } else if (document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus()
    }
  }, [onClose, enabled])

  return dialogRef
}
