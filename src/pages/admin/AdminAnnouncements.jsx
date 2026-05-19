import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAnnouncements } from '../../hooks/useData'
import { writeAnnouncements } from '../../api/dataWriter'
import { showToast } from '../../components/ui/Toast'
import { PageSpinner } from '../../components/ui/Spinner'
import { generateId } from '../../utils/balanceCalculator'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import ConfirmModal from '../../components/ui/ConfirmModal'
import { format, parseISO } from 'date-fns'

const EMPTY = { title: '', body: '', expires_on: '', pinned: false }

function AnnRow({ ann, todayStr, onEdit, onDelete, deletingId, isAdmin }) {
  const isExpired = ann.expires_on && ann.expires_on < todayStr
  return (
    <div className={`py-3 flex items-start justify-between gap-4 ${isExpired ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {ann.pinned && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">Pinned</span>}
          <span className="font-medium text-gray-900 text-sm">{ann.title}</span>
        </div>
        <p className="text-sm text-gray-600 mt-0.5 truncate">{ann.body}</p>
        <p className="text-xs text-gray-400 mt-1">
          Posted {format(parseISO(ann.posted_on), 'MMM d, yyyy')}
          {ann.expires_on && ` · Expires ${format(parseISO(ann.expires_on), 'MMM d, yyyy')}`}
        </p>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => onEdit(ann)} className="text-xs text-blue-600 hover:underline">Edit</button>
          <button
            onClick={() => onDelete(ann)}
            disabled={deletingId === ann.id}
            className="text-xs text-red-500 hover:underline disabled:opacity-50"
          >
            {deletingId === ann.id ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function AdminAnnouncements() {
  const qc = useQueryClient()
  const { data, isLoading } = useAnnouncements()
  const isAdmin = useIsAdmin()
  const [editing, setEditing]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmData, setConfirmData] = useState(null)

  if (isLoading) return <PageSpinner />

  const todayStr      = new Date().toISOString().slice(0, 10)
  const announcements = (data?.announcements ?? []).sort((a, b) => b.posted_on.localeCompare(a.posted_on))
  const active  = announcements.filter(a => !a.expires_on || a.expires_on >= todayStr)
  const expired = announcements.filter(a => a.expires_on && a.expires_on < todayStr)

  function openNew() {
    setEditing({ ...EMPTY, id: generateId('ANN', announcements.map(a => a.id)), posted_on: todayStr })
  }

  function openEdit(a) {
    setEditing({ ...a, expires_on: a.expires_on ?? '' })
  }

  async function save() {
    if (!editing.title.trim() || !editing.body.trim()) { showToast('Title and body are required', 'error'); return }
    setSaving(true)
    try {
      const isNew = !announcements.find(a => a.id === editing.id)
      const entry = {
        id: editing.id,
        title: editing.title.trim(),
        body: editing.body.trim(),
        posted_on: editing.posted_on || todayStr,
        expires_on: editing.expires_on || null,
        pinned: editing.pinned ?? false,
      }
      const updated = isNew
        ? [...announcements, entry]
        : announcements.map(a => a.id === editing.id ? entry : a)
      await writeAnnouncements({ schema_version: 1, announcements: updated }, `${isNew ? 'Post' : 'Update'} announcement: ${entry.title}`)
      qc.invalidateQueries({ queryKey: ['announcements'] })
      setEditing(null)
      showToast(`Announcement ${isNew ? 'posted' : 'updated'}`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function deleteAnn(ann) {
    setConfirmData({
      message: `Delete announcement "${ann.title}"?`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setDeletingId(ann.id)
        try {
          const updated = announcements.filter(a => a.id !== ann.id)
          await writeAnnouncements({ schema_version: 1, announcements: updated }, `Delete announcement: ${ann.title}`)
          qc.invalidateQueries({ queryKey: ['announcements'] })
          showToast('Announcement deleted')
        } catch (e) {
          showToast(e.message, 'error')
        } finally {
          setDeletingId(null)
        }
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-medium text-gray-900">Announcements</h1>
        {isAdmin && <button onClick={openNew} className="btn-primary text-sm">+ New Announcement</button>}
      </div>

      <div className="card">
        <h2 className="font-medium text-gray-800 mb-2 text-sm">Active ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No active announcements.</p>
        ) : (
          <div className="divide-y divide-[rgba(0,0,0,0.04)]">
            {active.map(a => (
              <AnnRow key={a.id} ann={a} todayStr={todayStr} onEdit={openEdit} onDelete={deleteAnn} deletingId={deletingId} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </div>

      {expired.length > 0 && (
        <div className="card">
          <h2 className="font-medium text-gray-400 mb-2 text-sm">Expired ({expired.length})</h2>
          <div className="divide-y divide-[rgba(0,0,0,0.04)]">
            {expired.map(a => (
              <AnnRow key={a.id} ann={a} todayStr={todayStr} onEdit={openEdit} onDelete={deleteAnn} deletingId={deletingId} isAdmin={isAdmin} />
            ))}
          </div>
        </div>
      )}

      {confirmData && <ConfirmModal {...confirmData} onClose={() => setConfirmData(null)} />}

      {editing && isAdmin && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.12)] w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
              <h2 className="font-medium">
                {announcements.find(a => a.id === editing.id) ? 'Edit Announcement' : 'New Announcement'}
              </h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="label">Title</label>
                <input className="input" value={editing.title} onChange={e => setEditing(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label className="label">Body</label>
                <textarea
                  className="input h-24 resize-none"
                  value={editing.body}
                  onChange={e => setEditing(p => ({ ...p, body: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Expires On (optional)</label>
                <input className="input" type="date" value={editing.expires_on ?? ''} onChange={e => setEditing(p => ({ ...p, expires_on: e.target.value || null }))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[#1D9E75]"
                  checked={editing.pinned ?? false}
                  onChange={e => setEditing(p => ({ ...p, pinned: e.target.checked }))}
                />
                <span className="text-sm text-gray-700">Pin to top</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Post'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
