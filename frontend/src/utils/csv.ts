export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
