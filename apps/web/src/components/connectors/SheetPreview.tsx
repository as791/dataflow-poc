interface SheetPreviewProps {
  headers: string[];
  rows: string[][];
}

export function SheetPreview({ headers, rows }: SheetPreviewProps) {
  if (!headers.length) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-white/5">
            {headers.map(h => (
              <th key={h} className="px-2 py-1 text-left text-white/50 font-medium border-b border-white/10 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5">
              {headers.map((_, j) => (
                <td key={j} className="px-2 py-1 text-white/70 max-w-[120px] truncate">
                  {String(row[j] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
