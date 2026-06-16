export async function extrairTextoOCR(imagemBase64: string): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['por', 'eng'])
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' } as never)
    const { data: { text } } = await worker.recognize(`data:image/jpeg;base64,${imagemBase64}`)
    return text.trim()
  } finally {
    await worker.terminate()
  }
}
