import { getResume } from '@minnow/db';
import { requireUser } from '@/lib/auth/session';
import { resumeSkills } from '@/lib/resume';
import { ResumeUpload } from '@/components/resume-upload';
export default async function ResumePage() {
  const user = await requireUser(); const resume = await getResume(user.id);
  const skills = resume ? resumeSkills(resume.extracted_text) : [];
  return <><div className="page-heading"><h1>Your resume</h1><p>A little context helps Minnow find a better fit.</p></div>{resume && <section className="content-card"><h2>{resume.file_name}</h2><p>{Math.ceil(resume.bytes/1024)} KB · uploaded {new Date(resume.uploaded_at).toLocaleDateString()}</p><a className="secondary-button" href="/api/resume/download">Download your file</a><h3>Headline skills</h3><div className="skill-tags">{skills.length ? skills.map(skill => <span key={skill}>{skill}</span>) : <p>No recognized headline skills. Your preferences still guide matching.</p>}</div><details><summary>Extracted text preview</summary><pre className="resume-preview">{resume.extracted_text.slice(0,1200)}</pre></details></section>}<ResumeUpload replacing={Boolean(resume)} /></>;
}
