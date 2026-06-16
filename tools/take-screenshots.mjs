// Script para tirar screenshots de cada tela do CISPR 15 LABELO
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE   = 'http://localhost:3000';
const OUTDIR = path.join(process.cwd(), 'screenshots_manual');

if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

const PAGES = [
  { name: '01_tela_principal',   url: '/cispr15',           title: 'Formulário CISPR 15 — aba Formulário', delay: 2000 },
  { name: '02_aba_clientes',     url: '/cispr15',           title: 'Aba Clientes', delay: 1500, clickSelector: 'button:has-text("Clientes")' },
  { name: '03_aba_emendas',      url: '/cispr15',           title: 'Aba Emendas', delay: 1500, clickSelector: 'button:has-text("Emendas")' },
  { name: '04_aba_relatorios',   url: '/cispr15',           title: 'Aba Relatórios', delay: 1500, clickSelector: 'button:has-text("Relatórios")' },
  { name: '05_configuracoes',    url: '/configuracoes',     title: 'Configurações', delay: 2000 },
  { name: '06_agenda',           url: '/agenda',            title: 'Agenda de Execução', delay: 2000 },
  { name: '07_agenda_analise',   url: '/agenda',            title: 'Agenda — Aba Análise', delay: 1500, clickSelector: 'button:has-text("Análise")' },
  { name: '08_relatorio_pdf',    url: '/cispr15/relatorio', title: 'Visualização do Relatório PDF', delay: 3000 },
];

(async () => {
  console.log('Iniciando browser...');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  for (const item of PAGES) {
    try {
      console.log(`  → ${item.title} (${BASE + item.url})`);
      await page.goto(BASE + item.url, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, item.delay ?? 1500));

      if (item.clickSelector) {
        try {
          // find button by text content
          const text = item.clickSelector.match(/:has-text\("(.+)"\)/)?.[1];
          if (text) {
            const handles = await page.$$('button');
            for (const h of handles) {
              const t = await h.evaluate(el => el.textContent?.trim());
              if (t?.includes(text)) { await h.click(); break; }
            }
            await new Promise(r => setTimeout(r, 1200));
          }
        } catch (e) { console.log('    (click ignorado:', e.message, ')'); }
      }

      const file = path.join(OUTDIR, item.name + '.png');
      await page.screenshot({ path: file, fullPage: false });
      console.log(`    Salvo: ${file}`);
    } catch (err) {
      console.log(`    ERRO em ${item.title}: ${err.message}`);
    }
  }

  // Screenshot extra da tela de senha (gate modal)
  try {
    console.log('  → Modal de senha...');
    await page.goto(BASE + '/cispr15', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    // Injetar o modal de senha abrindo-o via JS (simulação)
    await page.evaluate(() => {
      // Tentar achar o botão de configurações para abrir a tela
    });
  } catch {}

  await browser.close();
  console.log('\nscreenshots concluídos em:', OUTDIR);
})();
