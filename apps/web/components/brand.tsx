export function Fish({ className = '', small = false }: { className?: string; small?: boolean }) {
  return <svg className={className} viewBox="0 0 56 32" fill="none" aria-hidden="true">
    <path d="M2 5v22l15-9C28 32 45 26 54 16 45 6 28 0 17 14L2 5Z" fill="currentColor" />
    {!small && <circle cx="41" cy="13" r="2" fill="white" />}
  </svg>;
}

export function CurrentIllustration() {
  return <svg className="current-illustration" viewBox="0 0 370 155" fill="none" aria-hidden="true">
    <path d="M-10 55C80 15 108 110 207 68S302 12 390 39M-10 81C80 41 108 136 207 94S302 38 390 65M-10 107C80 67 108 162 207 120S302 64 390 91" stroke="#bfdbe8" strokeWidth="1.4" />
    <g color="#176b9b" transform="translate(255 38) rotate(-15)"><path d="M0 0v26l17-10c12 15 33 10 43-3C50 0 29-5 17 10L0 0Z" fill="currentColor" /><circle cx="46" cy="9" r="2.2" fill="white" /></g>
    <g fill="#76b4c9"><path d="M166 69v15l10-6c7 9 20 6 26-2-6-7-19-10-26-1z" /><path d="M111 47v11l8-4c5 6 14 4 19-2-5-5-14-7-19-1z" /></g>
    <g fill="#96c8c6"><path d="M215 109v13l9-5c6 7 16 5 22-2-6-6-16-9-22-1z" /><path d="M78 96v10l7-4c5 6 13 4 17-1-4-5-12-7-17-1z" /></g>
    <circle cx="333" cy="28" r="3" fill="#b0d7dc" /><circle cx="351" cy="18" r="2" fill="#c8e3e9" />
  </svg>;
}
