import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  buildFlattenFilename,
  flattenFormsAndScrubPdf,
  inspectPdfPrivacy,
} from '../flatten-clean.logic';

async function createSampleFormAndMetadataPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Kontrak Rahasia');
  doc.setAuthor('Budi Santoso');
  doc.setSubject('Draft Perjanjian');
  doc.setCreator('Internal Editor');
  doc.setProducer('SecretCorp Suite');
  doc.setKeywords(['kontrak', 'internal']);

  const page = doc.addPage([595, 842]);
  const form = doc.getForm();
  const nameField = form.createTextField('applicant.name');
  nameField.setText('Siti Rahma');
  nameField.addToPage(page, { x: 50, y: 700, width: 220, height: 28 });

  const agreeBox = form.createCheckBox('applicant.agree');
  agreeBox.check();
  agreeBox.addToPage(page, { x: 50, y: 650, width: 18, height: 18 });

  return doc.save();
}

describe('flatten-clean.logic', () => {
  it('inspects hidden metadata and AcroForm fields accurately', async () => {
    const sample = await createSampleFormAndMetadataPdf();
    const info = await inspectPdfPrivacy(sample);

    expect(info.pageCount).toBe(1);
    expect(info.formFieldCount).toBe(2);
    expect(info.metadata.author).toBe('Budi Santoso');
    expect(info.metadata.title).toBe('Kontrak Rahasia');
    expect(info.metadataFieldCount).toBeGreaterThanOrEqual(5);
  });

  it('flattens form fields and scrubs all metadata cleanly', async () => {
    const sample = await createSampleFormAndMetadataPdf();
    const result = await flattenFormsAndScrubPdf(sample, {
      flattenForms: true,
      stripMetadata: true,
      removeAnnotations: true,
    });

    expect(result.flattenedFieldCount).toBe(2);
    expect(result.scrubbedMetadataFields).toBeGreaterThanOrEqual(5);

    const after = await inspectPdfPrivacy(result.bytes);
    expect(after.pageCount).toBe(1);
    expect(after.formFieldCount).toBe(0);
    expect(after.annotationCount).toBe(0);
    expect(after.metadata.author).toBe('');
    expect(after.metadata.title).toBe('');
    expect(after.metadata.creator).toBe('');
    expect(after.metadata.producer).toBe('');
    expect(after.metadataFieldCount).toBe(0);
  });

  it('builds descriptive output filenames for both modes', () => {
    expect(buildFlattenFilename('kontrak.pdf', 'forms-and-metadata')).toBe('kontrak-clean.pdf');
    expect(buildFlattenFilename('Formulir.PDF', 'full-raster')).toBe('Formulir-flattened.pdf');
  });
});
