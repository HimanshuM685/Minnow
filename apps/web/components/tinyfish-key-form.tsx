'use client';
import { useActionState } from 'react';
import { setTinyfishKey } from '@/app/(dashboard)/credits/actions';

export function TinyfishKeyForm({ hasKey }: { hasKey: boolean }) {
  const [state, action, pending] = useActionState(setTinyfishKey, null);
  return <form action={action} className="email-auth-form">
    <label>TinyFish API key<input name="key" type="password" autoComplete="off" placeholder={hasKey ? 'Key saved. Paste a new one to replace it.' : 'sk-tinyfish-…'} /></label>
    {state?.error && <p className="form-error" role="alert">{state.error}</p>}
    {state?.ok && <p className="field-hint" role="status">{state.ok}</p>}
    <div className="form-buttons">
      <button className="primary-button" disabled={pending}>{hasKey ? 'Replace key' : 'Save key'}</button>
      {hasKey && <button name="remove" value="1" className="secondary-button" disabled={pending} formNoValidate>Remove key</button>}
    </div>
  </form>;
}
