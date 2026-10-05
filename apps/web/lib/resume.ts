import mammoth from 'mammoth';

const knownSkills = ['python','typescript','javascript','react','next.js','node.js','sql','postgresql','java','c++','c#','rust','golang','swift','kotlin','aws','azure','docker','kubernetes','terraform','git','figma','sketch','adobe','photoshop','illustrator','design systems','user research','ux','ui','accessibility','data analysis','machine learning','pandas','numpy','pytorch','tensorflow','excel','tableau','power bi','financial modeling','accounting','marketing','seo','salesforce','hubspot','copywriting','project management','agile','scrum','distributed systems','graphql','rest','html','css'];
export function resumeSkills(text: string): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g,' ');
  return knownSkills.filter(skill => new RegExp(`(^|[^a-z0-9])${skill.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}($|[^a-z0-9])`).test(normalized)).slice(0,30);
}
export async function extractResume(file: File) {
  if (file.size > 2 * 1024 * 1024 || file.size === 0) throw new Error('Upload a non-empty file up to 2 MB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split('.').pop()?.toLowerCase();
  let text = '';
  let mime = '';
  if (extension === 'txt') { mime = 'text/plain'; text = bytes.toString('utf8'); }
  else if (extension === 'pdf') {
    if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('The file is not a valid PDF.');
    mime = 'application/pdf';
    // unpdf bundles a DOM-free pdf.js build; pdf-parse needs DOMMatrix, which serverless runtimes lack.
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    text = (await extractText(pdf, { mergePages: true })).text;
  } else if (extension === 'docx') {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('The file is not a valid DOCX.');
    mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    text = (await mammoth.extractRawText({ buffer: bytes })).value;
  } else throw new Error('Use a PDF, DOCX or TXT resume.');
  text = text.replace(/\u0000/g,'').trim().slice(0,80_000);
  if (text.length < 20) throw new Error('No readable resume text found. Use a text-based PDF, DOCX or TXT file.');
  return { bytes, text, mime, fileName: file.name.replace(/[\r\n\\/]/g,'_').slice(0,200) };
}
