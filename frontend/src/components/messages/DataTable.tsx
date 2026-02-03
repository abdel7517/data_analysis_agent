import { useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DataTableJSON } from '@/types/chat'

interface DataTableProps {
  json: DataTableJSON | string
}

export function DataTable({ json }: DataTableProps) {
  const { columns, rows } = useMemo<{ columns: string[]; rows: (string | number | null)[][] }>(() => {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json
    return {
      columns: parsed.columns || [],
      rows: parsed.data || [],
    }
  }, [json])

  if (columns.length === 0) return null

  return (
    <div className="w-full rounded-lg border">
      <ScrollArea className="w-full">
        <div className="max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <TableRow>
                {columns.map((col, i) => (
                  <TableHead key={i} className="text-xs font-semibold whitespace-nowrap">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIdx) => (
                <TableRow key={rowIdx}>
                  {row.map((cell, cellIdx) => (
                    <TableCell key={cellIdx} className="text-xs whitespace-nowrap">
                      {cell === null || cell === undefined
                        ? '—'
                        : typeof cell === 'number'
                          ? cell.toLocaleString('fr-FR')
                          : String(cell)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>
      <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
        {rows.length} ligne{rows.length > 1 ? 's' : ''} × {columns.length} colonne{columns.length > 1 ? 's' : ''}
      </div>
    </div>
  )
}
