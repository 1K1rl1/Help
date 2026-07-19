import csv
import os
from pathlib import Path
from openpyxl import Workbook

SRC = Path('test_output.csv')
TMP = Path('test_output.tmp.csv')
XLSX = Path('test_output.xlsx')

HEADER_MAP = {
    'Object_Name': 'Объект',
    'Name_Error': 'Название ошибки',
    'Fix_Date': 'Дата фиксации',
    'Login': 'Логин оператора склада',
    'Error_Accrual_Method': 'Метод начисления ошибки',
    'Object_Identifier': 'Идентификатор объекта нарушения',
    'Operation_Location': 'Место операции',
    'Comment': 'Комментарий',
}

# Try to read with utf-8-sig, if fails fallback to cp1251
encodings = ['utf-8-sig', 'utf-8', 'cp1251']
rows = None
for enc in encodings:
    try:
        with SRC.open('r', encoding=enc, newline='') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            original_fieldnames = reader.fieldnames
        print('Read CSV with', enc)
        break
    except Exception as e:
        last_exc = e
else:
    raise last_exc

if rows is None:
    raise RuntimeError('Failed to read CSV')

new_fieldnames = [HEADER_MAP.get(fn, fn) for fn in original_fieldnames]

# Write new CSV with russian headers (utf-8-sig)
with TMP.open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(new_fieldnames)
    for r in rows:
        row = [r.get(fn, '') for fn in original_fieldnames]
        writer.writerow(row)

TMP.replace(SRC)
print('Rewrote CSV with Russian headers:', SRC)

# Generate XLSX
wb = Workbook()
ws = wb.active
ws.append(new_fieldnames)
for r in rows:
    ws.append([r.get(fn, '') for fn in original_fieldnames])
wb.save(XLSX)
print('Wrote XLSX:', XLSX)
