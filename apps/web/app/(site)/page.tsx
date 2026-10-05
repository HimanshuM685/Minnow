import Link from 'next/link';
import { ArrowUpRight, Check, MapPin, Search, FileText, Sparkles, X } from 'lucide-react';
import '../landing.css';

const sources = ['Greenhouse', 'Lever', 'Ashby', 'Workable', 'Company careers', 'Public job boards', 'ATS pages', 'Internship boards'];
const steps = [
  { icon: Search, title: 'Search discovers', text: 'Find live careers and ATS pages for your own role and location.', url: 'minnow.app/search', rows: ['“Software engineer” · Bengaluru', '12 careers pages found'] },
  { icon: FileText, title: 'Fetch reads', text: 'Read current openings as clean markdown and extract the useful details.', url: 'minnow.app/read', rows: ['careers.example.com/jobs', '34 openings parsed'] },
  { icon: Sparkles, title: 'Agent navigates', text: 'Use filters and interactive boards only when the reader needs help.', url: 'minnow.app/agent', rows: ['Filter: Remote · Engineering', 'Only when needed'] },
];
const compare: [string, string, string, string][] = [
  ['Live pages, not stale posts', 'yes', 'Sometimes', 'Manual'],
  ['Matched to your role & location', 'yes', 'Partly', 'Manual'],
  ['Skills from your resume boost ranking', 'yes', 'no', 'no'],
  ['Honest sponsorship signals', 'yes', 'Rarely', 'Manual'],
  ['Every hunt shows its sources', 'yes', 'no', 'no'],
  ['Time to first shortlist', 'Minutes', 'Hours', 'Days'],
];
const cell = (v: string) => v === 'yes' ? <Check size={18} className="ok" aria-label="Yes" /> : v === 'no' ? <X size={18} className="no" aria-label="No" /> : v;
const faqs = [
  ['Where do the listings come from?', 'Minnow reads live company careers pages and public ATS boards (Greenhouse, Lever, Ashby and more) at the moment you hunt. Nothing is invented; every result links to its source.'],
  ['What does a hunt cost?', 'Every account starts with 10 credits and a live hunt uses one. Replaying a cached hunt is free.'],
  ['Can I use my own TinyFish key?', 'Yes. Add it on the Credits page and your hunts use it instead of credits.'],
  ['Does Minnow tell me about visa sponsorship?', 'It shows what the page says, and marks it clearly as not stated when the page is silent.'],
  ['How do I get more credits?', 'Message @HimanshuM685 on Telegram, or bring your own TinyFish key.'],
];

export default function Landing() {
  return <main id="main" className="landing">
    <section className="hero page-width">
      <p className="eyebrow"><span className="live-dot" />Live careers pages · no tab-hopping</p>
      <h1>Find your next<br /><span className="grad">current.</span></h1>
      <p className="hero-sub">Live jobs and internships, gathered from across the web. Matched to you. Ready to explore.</p>
      <div className="hero-actions">
        <Link className="primary-button lg" href="/dashboard">Start your hunt <ArrowUpRight size={18} /></Link>
        <Link className="secondary-button lg" href="#how">See how it works</Link>
      </div>
      <p className="hero-note">10 free hunts · No card required · Bring your own TinyFish key</p>
    </section>
    <div className="marquee" aria-hidden="true"><div>{[...sources, ...sources, ...sources].map((name, i) => <span key={i}>{name}</span>)}</div></div>

    <section className="section page-width">
      <p className="eyebrow">Your shortlist</p>
      <h2>The weekly careers check,<br />without the tab-hopping.</h2>
      <p className="section-sub">Tell Minnow your role, profession, location and experience. Add a resume for skill hints. Get a fresh shortlist with real application links and clear reasons it fits.</p>
      <div className="window">
        <div className="window-bar"><i /><i /><i /><span>minnow.app/dashboard/listings</span><em>Illustrative sample · not live</em></div>
        <div className="window-body">
          {[{ title: 'Software Engineer Intern', company: 'Example employer', location: 'Bengaluru, India', reason: 'Python matches your resume', fit: 92 }, { title: 'Graduate Product Designer', company: 'Sample design team', location: 'London, UK', reason: 'Design systems keyword', fit: 86 }, { title: 'Data Analyst', company: 'Demo company', location: 'Remote', reason: 'SQL matches your resume', fit: 81 }].map(job => <article className="sample-card" key={job.title}>
            <div><p>{job.company}</p><h3>{job.title}</h3><span><MapPin size={13} />{job.location}</span><small><Check size={12} />{job.reason}</small></div>
            <b>{job.fit} fit</b>
          </article>)}
        </div>
      </div>
      <p className="sample-caption">Your actual shortlist comes only from live pages when you run a hunt.</p>
    </section>

    <section className="section alt" id="how"><div className="page-width">
      <p className="eyebrow">How it works</p>
      <h2>Search. Read. Explore.</h2>
      <p className="section-sub">Three TinyFish endpoints, each with a job to do.</p>
      <div className="steps">{steps.map(({ icon: Icon, title, text, url, rows }, i) => <article className="step-card" key={title}>
        <span className="step-num">0{i + 1}</span>
        <div className="mini-window"><div className="window-bar"><i /><i /><i /><span>{url}</span></div><div className="mini-body"><Icon size={20} />{rows.map(r => <p key={r}>{r}</p>)}</div></div>
        <h3>{title}</h3><p>{text}</p>
      </article>)}</div>
    </div></section>

    <section className="section page-width">
      <p className="eyebrow">Before vs. after</p>
      <h2>Minnow vs. doing it by hand</h2>
      <div className="versus">
        <div className="versus-card"><h3>Searching yourself</h3><ul><li><X size={16} className="no" />Dozens of careers tabs every week</li><li><X size={16} className="no" />Stale posts and duplicates</li><li><X size={16} className="no" />Sponsorship buried in the fine print</li></ul></div>
        <div className="versus-card good"><h3>With Minnow</h3><ul><li><Check size={16} className="ok" />One hunt across many companies and ATS boards</li><li><Check size={16} className="ok" />Deduplicated, ranked and source-backed</li><li><Check size={16} className="ok" />Sponsorship uncertainty shown honestly</li></ul></div>
      </div>
    </section>

    <section className="section alt"><div className="page-width">
      <p className="eyebrow">Why Minnow</p>
      <h2>Not another job board.</h2>
      <div className="table-wrap"><table className="compare"><thead><tr><th><span className="sr-only">Feature</span></th><th className="hl">Minnow</th><th>Job boards</th><th>Manual search</th></tr></thead>
        <tbody>{compare.map(([label, a, b, c]) => <tr key={label}><td>{label}</td><td className="hl">{cell(a)}</td><td>{cell(b)}</td><td>{cell(c)}</td></tr>)}</tbody></table></div>
    </div></section>

    <section className="section page-width" id="pricing">
      <p className="eyebrow">Credits</p>
      <h2>Simple, fair, no card.</h2>
      <p className="section-sub">Every hunt uses one credit. Cached replays are free.</p>
      <div className="plans">
        <article className="plan featured"><span className="badge">Included</span><h3>Free</h3><p className="price">10 <small>hunts</small></p><ul><li><Check size={16} className="ok" />Live careers-page hunts</li><li><Check size={16} className="ok" />Resume skill hints</li><li><Check size={16} className="ok" />Full trace of every source</li></ul><Link className="primary-button" href="/dashboard">Start your hunt</Link></article>
        <article className="plan"><h3>Your own key</h3><p className="price">∞ <small>hunts</small></p><ul><li><Check size={16} className="ok" />Use your TinyFish API key</li><li><Check size={16} className="ok" />No credit limit</li><li><Check size={16} className="ok" />Stored server-side</li></ul><Link className="secondary-button" href="/credits">Add your key</Link></article>
        <article className="plan"><h3>Need more?</h3><p className="price">Ask <small>on Telegram</small></p><ul><li><Check size={16} className="ok" />Message @HimanshuM685</li><li><Check size={16} className="ok" />Credits added to your account</li></ul><a className="secondary-button" href="https://t.me/HimanshuM685" target="_blank" rel="noopener noreferrer">Open Telegram</a></article>
      </div>
    </section>

    <section className="section alt"><div className="page-width narrow">
      <p className="eyebrow">FAQ</p>
      <h2>Frequently asked questions</h2>
      <div className="faq">{faqs.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </div></section>

    <section className="cta page-width">
      <h2>Ready to find your current?</h2>
      <p>Set your preferences once. Minnow checks the live pages for you.</p>
      <Link className="primary-button lg" href="/dashboard">Start your hunt <ArrowUpRight size={18} /></Link>
    </section>
  </main>;
}
