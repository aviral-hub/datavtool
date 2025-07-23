"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "@/hooks/use-toast"

/**
 * A minimal representation of the file structure we need.
 * Adapt this to your actual type from `app/page` if it differs.
 */
export interface FileData {
  name?: string
  headers: string[]
  rows: Record<string, unknown>[]
}

type CleaningActionType = "trim" | "fillNulls" | "standardizeCase" | "removeDuplicates"

export interface CleaningAction {
  id: string
  type: CleaningActionType
  column?: string
  rowIndex?: number
  description: string
  applied: boolean
}

interface InteractiveDataCleanerProps {
  file: FileData
  onFileUpdate: (file: FileData) => void
}

/**
 * Simple, local-only heuristics for suggestions when the network / AI is unavailable.
 */
function generateLocalSuggestions(file: FileData): CleaningAction[] {
  const suggestions: CleaningAction[] = []
  const nullish = (v: unknown) => v === null || v === undefined || v === ""

  file.headers.forEach((header) => {
    const nullCount = file.rows.filter((r) => nullish(r[header])).length
    if (nullCount > 0) {
      suggestions.push({
        id: `${header}-fill-null`,
        type: "fillNulls",
        column: header,
        description: `Replace ${nullCount} missing values in “${header}”`,
        applied: false,
      })
    }

    const needsTrim = file.rows.some((r) => typeof r[header] === "string" && /^\s|\s$/.test(r[header] as string))
    if (needsTrim) {
      suggestions.push({
        id: `${header}-trim`,
        type: "trim",
        column: header,
        description: `Trim extra spaces in “${header}”`,
        applied: false,
      })
    }

    const needsCase = file.rows.some(
      (r) =>
        typeof r[header] === "string" && (r[header] as string).match(/[A-Z]/) && (r[header] as string).match(/[a-z]/),
    )
    if (needsCase) {
      suggestions.push({
        id: `${header}-standardize`,
        type: "standardizeCase",
        column: header,
        description: `Standardize text casing for “${header}”`,
        applied: false,
      })
    }
  })

  return suggestions
}

export default function InteractiveDataCleaner({ file, onFileUpdate }: InteractiveDataCleanerProps) {
  const [actions, setActions] = React.useState<CleaningAction[]>(() => generateLocalSuggestions(file))
  const [selectedRows, setSelectedRows] = React.useState<Set<number>>(new Set())

  // -----------------------------------------------------------------------
  // HELPER FUNCTIONS
  // -----------------------------------------------------------------------
  function applyAction(action: CleaningAction) {
    if (action.applied) return

    const updatedRows = file.rows.map((row, idx) => {
      if (action.rowIndex !== undefined && action.rowIndex !== idx) return row
      if (action.column && !(action.column in row)) return row

      const draft = { ...row }

      switch (action.type) {
        case "trim": {
          const v = draft[action.column as string]
          if (typeof v === "string") draft[action.column as string] = v.trim()
          break
        }
        case "fillNulls": {
          const v = draft[action.column as string]
          if (v === null || v === undefined || v === "") draft[action.column as string] = "N/A"
          break
        }
        case "standardizeCase": {
          const v = draft[action.column as string]
          if (typeof v === "string") draft[action.column as string] = (v as string).toLowerCase()
          break
        }
        default:
          break
      }
      return draft
    })

    setActions((prev) => prev.map((a) => (a.id === action.id ? { ...a, applied: true } : a)))
    onFileUpdate({ ...file, rows: updatedRows })
    toast({ title: "Fix applied", description: action.description })
  }

  function toggleRow(idx: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  // Memoized stats for the overview tab
  const totalNulls = React.useMemo(() => {
    return file.rows.reduce((acc, row) => {
      return (
        acc +
        file.headers.reduce((inner, h) => {
          const v = row[h]
          return inner + (v === null || v === undefined || v === "" ? 1 : 0)
        }, 0)
      )
    }, 0)
  }, [file])

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Interactive Data Cleaner</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
            <TabsTrigger value="rows">Rows</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="pt-4">
            <p className="mb-2">
              File: <strong>{file.name ?? "Unnamed dataset"}</strong>
            </p>
            <p className="mb-2">
              Total rows: <strong>{file.rows.length}</strong>
            </p>
            <p className="mb-4">
              Null / empty cells: <strong>{totalNulls}</strong>
            </p>
          </TabsContent>

          {/* SUGGESTIONS TAB */}
          <TabsContent value="suggestions" className="pt-4 space-y-3">
            {actions.length === 0 && <p>No issues detected 🎉</p>}

            {actions.map((action) => (
              <div key={action.id} className="flex items-center justify-between border rounded-md p-3">
                <span className={action.applied ? "line-through text-muted-foreground" : ""}>{action.description}</span>
                <Button size="sm" variant="outline" disabled={action.applied} onClick={() => applyAction(action)}>
                  {action.applied ? "Done" : "Fix"}
                </Button>
              </div>
            ))}
          </TabsContent>

          {/* ROWS TAB */}
          <TabsContent value="rows" className="pt-4">
            <ScrollArea className="max-h-[50vh] border rounded-md">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-2 sticky left-0 bg-muted">#</th>
                    {file.headers.map((h) => (
                      <th key={h} className="p-2 border-l">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {file.rows.map((row, idx) => {
                    const selected = selectedRows.has(idx)
                    return (
                      <tr key={idx} className={selected ? "bg-muted/50" : ""}>
                        <td className="p-2 sticky left-0 bg-background border-r">
                          <Checkbox
                            aria-label={`Select row ${idx + 1}`}
                            checked={selected}
                            onCheckedChange={() => toggleRow(idx)}
                          />
                        </td>
                        {file.headers.map((h) => (
                          <td key={h} className="p-2 border-l">
                            {(row[h] ?? "").toString()}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ScrollArea>
            {selectedRows.size > 0 && (
              <Button
                className="mt-3"
                onClick={() => {
                  // very simple removal example; you can expand
                  const remaining = file.rows.filter((_, idx) => !selectedRows.has(idx))
                  onFileUpdate({ ...file, rows: remaining })
                  setSelectedRows(new Set())
                  toast({
                    title: "Rows removed",
                    description: `${selectedRows.size} row(s) deleted`,
                  })
                }}
              >
                Delete selected rows
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
