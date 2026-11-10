// This fixture runs only in the opt-in, isolated native Dev WebView.
(async () => {
  if (sessionStorage.getItem('scriptforge-v120-checked')) return;
  const { invoke } = window.__TAURI__.core;
  let record;
  try {
    if (!window.scriptForgeDev) throw new Error('Dev isolation marker is missing.');
    const { libraryRepository } = await import('/js/managed-library.js');
    const { createDraft } = await import('/js/library.js');
    if (location.pathname.endsWith('editor.html')) {
      const deadline = Date.now() + 20000;
      while (!window.scriptForge?.getFileState() && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const current = window.scriptForge.getDocument();
      if (!current.title.includes('Isolated native fixture')) throw new Error('Native library reopen failed.');
      const { createScreenplayPDF } = await import('/js/pdf-export.js');
      const pdf = await createScreenplayPDF(current);
      if (pdf.emojiFallback.length) throw new Error('Native emoji artwork unavailable: ' + pdf.emojiFallback.join(' '));
      const { exportDesktop } = await import('/js/desktop.js');
      const written = await exportDesktop(pdf.blob, 'native-emoji-proof.pdf');
      await libraryRepository.archive(current.id, (await libraryRepository.get(current.id)).revision);
      sessionStorage.setItem('scriptforge-v120-checked', '1');
      await invoke('desktop_diagnostics_report', { report: { success: true, pages: pdf.pages, filename: written.name } });
      return;
    }
    record = await createDraft(libraryRepository);
    const { createElement } = await import('/js/document.js');
    record.recovery.document.title = record.title = 'Isolated native fixture';
    record.recovery.document.elements.push(createElement('action', 'Native emojis 😘 👍🏽 🇺🇸 👩🏽‍💻 and searchable text.'));
    await libraryRepository.put(record, record.revision);
    location.href = '/editor.html?id=' + record.id;
  } catch (error) {
    await invoke('desktop_diagnostics_report', { report: { success: false, message: error.stack || error.message } });
  }
})();
