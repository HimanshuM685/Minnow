import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { PDFDocument,StandardFonts } from 'pdf-lib';
import { extractResume,resumeSkills } from '../lib/resume';

test('TXT resumes are parsed locally and produce keyword hints',async()=>{
  const file=new File(['Ada Lovelace. Python, SQL, TypeScript and distributed systems.'],'ada.txt',{type:'text/plain'});
  const result=await extractResume(file);
  assert.equal(result.mime,'text/plain');
  assert.ok(resumeSkills(result.text).includes('python'));
  assert.ok(resumeSkills(result.text).includes('distributed systems'));
});

test('real PDF bytes produce readable text on the web server',async()=>{
  const document=await PDFDocument.create();
  const font=await document.embedFont(StandardFonts.Helvetica);
  document.addPage().drawText('Ada Lovelace - Python SQL software engineering',{font,size:12});
  const bytes=await document.save({useObjectStreams:false});
  const result=await extractResume(new File([new Uint8Array(bytes)],'ada.pdf',{type:'application/pdf'}));
  assert.match(result.text,/Ada Lovelace/);
  assert.ok(resumeSkills(result.text).includes('sql'));
});

test('DOCX resumes are read as text, not HTML',async()=>{
  const archive=new JSZip();
  archive.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  archive.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  archive.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Ada Lovelace. Product design with Figma and design systems.</w:t></w:r></w:p></w:body></w:document>');
  const bytes=await archive.generateAsync({type:'uint8array'});
  const result=await extractResume(new File([new Uint8Array(bytes)],'ada.docx'));
  assert.ok(resumeSkills(result.text).includes('figma'));
  assert.ok(resumeSkills(result.text).includes('design systems'));
  assert.equal(result.text.includes('<w:'),false);
});

test('resume cap, unsupported files, corrupt signatures and unreadable text reject cleanly',async()=>{
  await assert.rejects(extractResume(new File([new Uint8Array(2*1024*1024+1)],'large.txt')),/2 MB/);
  await assert.rejects(extractResume(new File(['malformed PDF bytes long enough to parse'],'bad.pdf')),/valid PDF/);
  await assert.rejects(extractResume(new File(['not a document'],'bad.docx')),/valid DOCX/);
  await assert.rejects(extractResume(new File(['some long content with unknown extension'],'bad.exe')),/PDF, DOCX or TXT/);
  await assert.rejects(extractResume(new File(['short'],'short.txt')),/No readable/);
});
