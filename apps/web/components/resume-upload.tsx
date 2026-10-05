'use client';
import { useActionState } from 'react';
import { Upload } from 'lucide-react';
import { uploadResume } from '@/app/app/resume/actions';
export function ResumeUpload({ replacing }: { replacing: boolean }) {
  const [state, action, pending] = useActionState(uploadResume, null);
  return <form action={action} className="resume-upload"><Upload size={28} /><h2>{replacing ? 'Replace your resume' : 'Bring your skills into the hunt.'}</h2><p>PDF, DOCX or TXT · up to 2 MB. Parsed on the web server; your raw file is never sent to TinyFish.</p><label htmlFor="resume-file">Resume file</label><input id="resume-file" name="resume" type="file" accept=".pdf,.docx,.txt" required disabled={pending} />{state?.error && <p className="form-error" role="alert">{state.error}</p>}{state?.ok && <p className="success-message">Resume saved. Your next hunt will use its skill hints.</p>}<button className="primary-button" disabled={pending}>{pending ? 'Extracting text…' : replacing ? 'Replace resume' : 'Upload resume'}</button></form>;
}
