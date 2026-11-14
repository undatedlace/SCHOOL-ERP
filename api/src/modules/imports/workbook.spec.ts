import ExcelJS from 'exceljs';
import { Lists, addTable, newWorkbook, readTables } from './workbook.js';

describe('addTable', () => {
  it('writes a sheet with no rows (an empty register) that opens again', async () => {
    const wb = newWorkbook();
    const lists = new Lists(wb);
    const marks = lists.add('Marks', ['P', 'A']);
    addTable(
      wb,
      'Staff',
      [
        { key: 'employeeNo', header: 'Employee no', given: true },
        { key: 'd:2026-06-01', header: '1', list: marks },
      ],
      [],
      { prepared: 0 },
    );
    const buffer = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buffer);
    expect(readTables(back).find((t) => t.sheet === 'Staff')?.rows).toEqual([]);
  });
});
