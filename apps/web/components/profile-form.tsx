'use client';

import { useActionState } from 'react';
import { saveProfile, type ProfileActionResult } from '@/app/(dashboard)/dashboard/actions';
import { LoaderCircle, Check } from 'lucide-react';

interface ProfileFormProps {
  initial: {
    name: string;
    profession: string;
    headline: string;
  };
  email: string;
}

export function ProfileForm({ initial, email }: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState<ProfileActionResult, FormData>(
    saveProfile,
    {}
  );

  return (
    <form action={formAction} className="content-card settings-form">
      <label>
        Name
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={initial.name}
          disabled={isPending}
        />
      </label>
      <label>
        Profession
        <input
          name="profession"
          maxLength={120}
          defaultValue={initial.profession}
          disabled={isPending}
          placeholder="Engineering, design, finance…"
        />
        <span className="field-hint">Also used as your default hunt profession.</span>
      </label>
      <label>
        Headline
        <input
          name="headline"
          maxLength={250}
          defaultValue={initial.headline}
          disabled={isPending}
          placeholder="Brief professional summary"
        />
      </label>
      <p className="field-hint">Account email: {email}</p>
      {state?.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="success-message" role="status" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Check size={16} /> Profile settings saved successfully.
        </p>
      )}
      <button className="primary-button" type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <LoaderCircle size={16} className="spin" />
            Saving…
          </>
        ) : (
          'Save settings'
        )}
      </button>
    </form>
  );
}
