import { useEffect, useRef, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, getApiErrorMessage, registerReauthentication } from '@/lib/shopflow-api'

export default function ReauthenticationDialog() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null)
  useEffect(() => {
    const unregister = registerReauthentication(() => new Promise<void>((resolve, reject) => {
      pending.current = { resolve, reject }; setPassword(''); setError(''); setOpen(true)
    }))
    return () => { unregister(); pending.current?.reject(new Error('Confirmation cancelled.')); pending.current = null }
  }, [])
  function close() {
    pending.current?.reject(new Error('Confirmation cancelled.')); pending.current = null
    setPassword(''); setOpen(false)
  }
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) close() }}>
    <DialogContent>
      <DialogHeader><DialogTitle>Confirm your password</DialogTitle><DialogDescription>Confirm your identity before this sensitive change.</DialogDescription></DialogHeader>
      <form className="grid gap-4" onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError('')
        try {
          await api.post('/api/auth/reauthenticate', { password })
          const operation = pending.current; pending.current = null
          setPassword(''); setOpen(false); operation?.resolve()
        } catch (cause) { setError(getApiErrorMessage(cause, 'Confirmation failed.')) }
        finally { setBusy(false) }
      }}>
        <label className="grid gap-2 text-sm">Current password<Input type="password" required maxLength={128} autoComplete="current-password" autoFocus value={password} onChange={event => setPassword(event.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy}><KeyRound />{busy ? 'Confirming…' : 'Confirm'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>
}