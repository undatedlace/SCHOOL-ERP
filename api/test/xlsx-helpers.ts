import ExcelJS from 'exceljs';
import type { Agent } from './helpers.js';

/** Downloads an .xlsx from the API and opens it. */
export async function downloadXlsx(agent: Agent, url: string) {
  const res = await agent
    .get(url)
    .buffer(true)
    .parse((r, done) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => done(null, Buffer.concat(chunks)));
    })
    .expect(200);
  expect(res.headers['content-type']).toContain('spreadsheetml');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body as ExcelJS.Buffer);
  return wb;
}

/** Writes rows into a template sheet by column key (row 1 holds the keys; data starts on row 3). */
export function fillSheet(
  wb: ExcelJS.Workbook,
  sheet: string,
  rows: Record<string, unknown>[],
  firstRow = 3,
) {
  const ws = wb.getWorksheet(sheet);
  if (!ws) throw new Error(`no sheet ${sheet}`);
  const keys = ws.getRow(1).values as unknown[];
  rows.forEach((values, i) => {
    const row = ws.getRow(firstRow + i);
    for (const [key, value] of Object.entries(values)) {
      const col = keys.indexOf(key);
      if (col < 1) throw new Error(`no column ${key} in ${sheet}`);
      row.getCell(col).value = value as ExcelJS.CellValue;
    }
  });
}

/** Uploads a workbook and checks the status code. */
export async function uploadXlsx(
  agent: Agent,
  url: string,
  wb: ExcelJS.Workbook,
  status: number,
  name = 'filled.xlsx',
) {
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return agent.post(url).attach('file', buffer, name).expect(status);
}
