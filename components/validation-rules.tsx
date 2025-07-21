"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import type { FileData, ValidationResult } from "@/app/page"
import { Plus, Download, Play, Trash2, Edit, Save, AlertTriangle, CheckCircle } from "lucide-react"
import * as XLSX from "xlsx"
import { toast } from "sonner"

interface ValidationRulesProps {
  file: FileData
  onFileUpdate: (file: FileData) => void
}

interface CustomRule {
  id: string
  name: string
  description: string
  condition: string
  severity: "low" | "medium" | "high" | "critical"
  columns: string[]
  active: boolean
}

export function ValidationRules({ file, onFileUpdate }: ValidationRulesProps) {
  const [customRules, setCustomRules] = useState<CustomRule[]>([])
  const [newRule, setNewRule] = useState<Partial<CustomRule>>({
    severity: "medium",
    columns: [],
    active: true,
  })
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null)
  const [isAddingRule, setIsAddingRule] = useState(false)
  const [isEditingRule, setIsEditingRule] = useState(false)
  const [validationResults, setValidationResults] = useState<ValidationResult[]>(file.validationResults || [])
  const [isValidating, setIsValidating] = useState(false)
  const [selectedFixes, setSelectedFixes] = useState<Set<string>>(new Set())
  const [validationTab, setValidationTab] = useState("rules")
  const [isApplyingFixes, setIsApplyingFixes] = useState(false)

  // Load saved rules from file if available
  useEffect(() => {
    if (file.customRules) {
      setCustomRules(file.customRules)
    }
    if (file.validationResults) {
      setValidationResults(file.validationResults)
    }
  }, [file])

  // Save rules and results when they change
  // ❌ Remove (causes update-depth loop)

  const generateSQLFix = (result: ValidationResult): string => {
    switch (result.rule) {
      case "null_values":
        return `-- Remove rows with null values in critical columns
DELETE FROM your_table 
WHERE column_name IS NULL;

-- Or update with default values
UPDATE your_table 
SET column_name = 'default_value' 
WHERE column_name IS NULL;`

      case "duplicates":
        return `-- Remove duplicate rows
WITH CTE AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY column1, column2 
    ORDER BY id
  ) as rn
)
DELETE FROM CTE WHERE rn > 1;`

      case "invalid_email":
        return `-- Fix invalid email formats
UPDATE your_table 
SET email = LOWER(TRIM(email))
WHERE email IS NOT NULL;

-- Remove invalid emails
DELETE FROM your_table 
WHERE email NOT LIKE '%@%.%';`

      case "age_validation":
        return `-- Fix unrealistic ages
UPDATE your_table 
SET age = NULL 
WHERE age < 0 OR age > 150;`

      default:
        return `-- Custom validation fix
-- Review and update the problematic records
SELECT * FROM your_table 
WHERE condition_that_failed;`
    }
  }

  const generatePythonFix = (result: ValidationResult): string => {
    switch (result.rule) {
      case "null_values":
        return `import pandas as pd

# Remove rows with null values
df = df.dropna(subset=['column_name'])

# Or fill with default values
df['column_name'] = df['column_name'].fillna('default_value')

# For numeric columns, use mean/median
df['numeric_column'] = df['numeric_column'].fillna(df['numeric_column'].mean())`

      case "duplicates":
        return `import pandas as pd

# Remove duplicate rows
df = df.drop_duplicates()

# Or keep first occurrence
df = df.drop_duplicates(keep='first')

# Remove duplicates based on specific columns
df = df.drop_duplicates(subset=['column1', 'column2'])`

      case "invalid_email":
        return `import pandas as pd
import re

# Clean email format
df['email'] = df['email'].str.lower().str.strip()

# Validate email format
email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
df = df[df['email'].str.match(email_pattern, na=False)]`

      case "age_validation":
        return `import pandas as pd

# Fix unrealistic ages
df.loc[(df['age'] < 0) | (df['age'] > 150), 'age'] = None

# Or replace with median
median_age = df['age'].median()
df.loc[(df['age'] < 0) | (df['age'] > 150), 'age'] = median_age`

      default:
        return `import pandas as pd

# Custom validation fix
# Review and fix the problematic records
problematic_rows = df[condition_that_failed]
print(f"Found {len(problematic_rows)} problematic rows")

# Apply your fix logic here
# df.loc[condition, 'column'] = new_value`
    }
  }

  const runValidation = async () => {
    setIsValidating(true)
    setValidationTab("results")

    try {
      // Show progress toast
      const toastId = toast.loading("Running validation...", { duration: 3000 })

      // Simulate validation process with a small delay to show progress
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const results: ValidationResult[] = []

      // Check for null values
      file.headers.forEach((header) => {
        const nullCount = file.data.filter(
          (row) => row[header] === null || row[header] === undefined || row[header] === "",
        ).length

        if (nullCount > 0) {
          results.push({
            id: `null_${header}`,
            rule: "null_values",
            severity: nullCount > file.data.length * 0.1 ? "high" : "medium",
            affectedRows: file.data
              .map((row, index) =>
                row[header] === null || row[header] === undefined || row[header] === "" ? index : -1,
              )
              .filter((index) => index !== -1),
            description: `${nullCount} null values found in column "${header}"`,
            suggestion: `Consider filling null values with appropriate defaults or removing incomplete records`,
            sqlFix: generateSQLFix({ rule: "null_values" } as ValidationResult),
            pythonFix: generatePythonFix({ rule: "null_values" } as ValidationResult),
            canAutoFix: true,
          })
        }
      })

      // Check for duplicates
      const duplicateRows: number[] = []
      const seen = new Set<string>()
      file.data.forEach((row, index) => {
        const rowString = JSON.stringify(row)
        if (seen.has(rowString)) {
          duplicateRows.push(index)
        } else {
          seen.add(rowString)
        }
      })

      if (duplicateRows.length > 0) {
        results.push({
          id: "duplicates",
          rule: "duplicates",
          severity: "medium",
          affectedRows: duplicateRows,
          description: `${duplicateRows.length} duplicate rows found`,
          suggestion: "Remove duplicate rows to ensure data uniqueness",
          sqlFix: generateSQLFix({ rule: "duplicates" } as ValidationResult),
          pythonFix: generatePythonFix({ rule: "duplicates" } as ValidationResult),
          canAutoFix: true,
        })
      }

      // Run custom rules
      customRules
        .filter((rule) => rule.active)
        .forEach((rule) => {
          try {
            const affectedRows: number[] = []

            // Simple rule evaluation logic
            file.data.forEach((row, index) => {
              // Check for null values in specified columns
              if (rule.condition.toLowerCase().includes("null") && rule.columns.some((col) => !row[col])) {
                affectedRows.push(index)
              }

              // Check for numeric conditions
              else if (rule.columns.length > 0) {
                const column = rule.columns[0]
                const value = Number(row[column])

                if (!isNaN(value)) {
                  // Age validation
                  if (rule.condition.includes("age < 0") && value < 0) {
                    affectedRows.push(index)
                  } else if (rule.condition.includes("age > 120") && value > 120) {
                    affectedRows.push(index)
                  }

                  // Salary validation
                  else if (rule.condition.includes("salary") && rule.condition.includes("> 0") && value <= 0) {
                    affectedRows.push(index)
                  }
                }
              }

              // Email validation
              if (rule.condition.toLowerCase().includes("email") && rule.columns.length > 0) {
                const column = rule.columns[0]
                const value = String(row[column] || "")
                if (!value.includes("@") || !value.includes(".")) {
                  affectedRows.push(index)
                }
              }
            })

            if (affectedRows.length > 0) {
              results.push({
                id: rule.id,
                rule: rule.name,
                severity: rule.severity,
                affectedRows,
                description: `${rule.description} (${affectedRows.length} rows affected)`,
                suggestion: `Custom rule "${rule.name}" validation failed. Review the affected rows.`,
                sqlFix: generateSQLFix({ rule: rule.name } as ValidationResult),
                pythonFix: generatePythonFix({ rule: rule.name } as ValidationResult),
                canAutoFix: false,
              })
            }
          } catch (error) {
            console.error("Error running custom rule:", rule.name, error)
            toast.error(`Error running rule: ${rule.name}`)
          }
        })

      setValidationResults(results)

      // Update toast with results
      toast.success(`Validation complete: ${results.length} issues found`, {
        id: toastId,
      })

      // Save validation results to file
      const updatedFile = {
        ...file,
        validationResults: results,
      }
      onFileUpdate(updatedFile)
    } catch (error) {
      console.error("Validation error:", error)
      toast.error("Error running validation")
    } finally {
      setIsValidating(false)
    }
  }

  const applyFixes = async () => {
    if (selectedFixes.size === 0) return

    setIsApplyingFixes(true)
    const toastId = toast.loading("Applying fixes...", { duration: 3000 })

    try {
      let updatedData = [...file.data]
      let fixesApplied = 0

      selectedFixes.forEach((fixId) => {
        const result = validationResults.find((r) => r.id === fixId)
        if (!result) return

        switch (result.rule) {
          case "null_values":
            const column = fixId.replace("null_", "")
            // Instead of removing rows, fill with appropriate defaults
            updatedData = updatedData.map((row, index) => {
              if (result.affectedRows.includes(index)) {
                const dataType = file.analysis?.dataTypes?.[column] || "string"
                let defaultValue: any = ""

                // Choose appropriate default based on data type
                if (dataType === "number") {
                  defaultValue = 0
                } else if (dataType === "boolean") {
                  defaultValue = false
                } else if (dataType === "date") {
                  defaultValue = new Date().toISOString().split("T")[0]
                }

                return { ...row, [column]: defaultValue }
              }
              return row
            })
            fixesApplied += result.affectedRows.length
            break

          case "duplicates":
            const uniqueRows = new Map()
            updatedData = updatedData.filter((row, index) => {
              const rowString = JSON.stringify(row)
              if (uniqueRows.has(rowString)) {
                return false // Skip duplicate
              }
              uniqueRows.set(rowString, true)
              return true
            })
            fixesApplied += result.affectedRows.length
            break

          default:
            // For custom rules, we can't auto-fix but we can mark them as addressed
            fixesApplied += result.affectedRows.length
            break
        }
      })

      // Update the file with fixed data
      const updatedFile = {
        ...file,
        data: updatedData,
        efficiency: {
          ...file.efficiency!,
          fixesApplied: (file.efficiency?.fixesApplied || 0) + fixesApplied,
          dataQualityImprovement: 10, // Estimate improvement
        },
      }

      onFileUpdate(updatedFile)
      setSelectedFixes(new Set())

      // Re-run validation to update results
      await runValidation()

      toast.success(`Applied ${fixesApplied} fixes successfully`, {
        id: toastId,
      })
    } catch (error) {
      console.error("Error applying fixes:", error)
      toast.error("Error applying fixes")
    } finally {
      setIsApplyingFixes(false)
    }
  }

  const exportCleanedData = (format: "csv" | "xlsx") => {
    try {
      if (format === "csv") {
        // unchanged CSV logic
        const csv = [
          file.headers.join(","),
          ...file.data.map((row) =>
            file.headers
              .map((header) =>
                typeof row[header] === "string" && row[header]?.includes(",") ? `"${row[header]}"` : row[header] || "",
              )
              .join(","),
          ),
        ].join("\n")

        const blob = new Blob([csv], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${file.name.replace(/\.[^/.]+$/, "")}_cleaned.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success("CSV file exported successfully")
      } else {
        // NEW: browser-safe XLSX export
        const ws = XLSX.utils.json_to_sheet(file.data)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Cleaned Data")

        /* Write the workbook to an ArrayBuffer instead of the filesystem */
        const ab = XLSX.write(wb, { bookType: "xlsx", type: "array" })

        const blob = new Blob([ab], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${file.name.replace(/\.[^/.]+$/, "")}_cleaned.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success("Excel file exported successfully")
      }
    } catch (error) {
      console.error("Error exporting data:", error)
      toast.error("Error exporting data")
    }
  }

  const addCustomRule = () => {
    if (!newRule.name || !newRule.condition) {
      toast.error("Rule name and condition are required")
      return
    }

    const rule: CustomRule = {
      id: Date.now().toString(),
      name: newRule.name!,
      description: newRule.description || "",
      condition: newRule.condition!,
      severity: newRule.severity!,
      columns: newRule.columns || [],
      active: true,
    }

    setCustomRules((prev) => [...prev, rule])
    setNewRule({ severity: "medium", columns: [], active: true })
    setIsAddingRule(false)

    toast.success(`Rule "${rule.name}" added successfully`)

    // Save rules to file
    const updatedFile = {
      ...file,
      customRules: [...customRules, rule],
    }
    onFileUpdate(updatedFile)
  }

  const updateCustomRule = () => {
    if (!editingRule || !editingRule.name || !editingRule.condition) {
      toast.error("Rule name and condition are required")
      return
    }

    setCustomRules((prev) => prev.map((rule) => (rule.id === editingRule.id ? editingRule : rule)))
    setEditingRule(null)
    setIsEditingRule(false)

    toast.success(`Rule "${editingRule.name}" updated successfully`)

    // Save updated rules to file
    const updatedFile = {
      ...file,
      customRules: customRules.map((rule) => (rule.id === editingRule.id ? editingRule : rule)),
    }
    onFileUpdate(updatedFile)
  }

  const deleteCustomRule = (ruleId: string) => {
    const ruleToDelete = customRules.find((r) => r.id === ruleId)
    if (!ruleToDelete) return

    setCustomRules((prev) => prev.filter((r) => r.id !== ruleId))
    toast.success(`Rule "${ruleToDelete.name}" deleted`)

    // Save updated rules to file
    const updatedFile = {
      ...file,
      customRules: customRules.filter((r) => r.id !== ruleId),
    }
    onFileUpdate(updatedFile)
  }

  const toggleRuleActive = (ruleId: string) => {
    setCustomRules((prev) => prev.map((rule) => (rule.id === ruleId ? { ...rule, active: !rule.active } : rule)))

    // Save updated rules to file
    const updatedFile = {
      ...file,
      customRules: customRules.map((rule) => (rule.id === ruleId ? { ...rule, active: !rule.active } : rule)),
    }
    onFileUpdate(updatedFile)
  }

  const naturalLanguageExamples = [
    "Flag if age < 0 or age > 120",
    "Email must contain @ and .",
    "Salary must be greater than 0",
    "Start date must be before end date",
    "Phone number must be 10 digits",
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold">Validation Rules</h2>
          <p className="text-sm lg:text-base text-gray-600">Configure and run data validation rules</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runValidation} disabled={isValidating} className="flex-shrink-0">
            <Play className="h-4 w-4 mr-2" />
            {isValidating ? "Validating..." : "Run Validation"}
          </Button>
          <Dialog open={isAddingRule} onOpenChange={setIsAddingRule}>
            <DialogTrigger asChild>
              <Button className="flex-shrink-0">
                <Plus className="h-4 w-4 mr-2" />
                Add Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Custom Validation Rule</DialogTitle>
                <DialogDescription>Create a custom rule using natural language or conditions</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="rule-name">Rule Name</Label>
                  <Input
                    id="rule-name"
                    value={newRule.name || ""}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Age Validation"
                  />
                </div>

                <div>
                  <Label htmlFor="rule-description">Description</Label>
                  <Input
                    id="rule-description"
                    value={newRule.description || ""}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of the rule"
                  />
                </div>

                <div>
                  <Label htmlFor="rule-condition">Condition (Natural Language)</Label>
                  <Textarea
                    id="rule-condition"
                    value={newRule.condition || ""}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, condition: e.target.value }))}
                    placeholder="e.g., Flag if age < 0 or age > 120"
                    rows={3}
                  />
                  <div className="mt-2">
                    <p className="text-sm text-gray-600 mb-2">Examples:</p>
                    <div className="flex flex-wrap gap-1">
                      {naturalLanguageExamples.map((example, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          onClick={() => setNewRule((prev) => ({ ...prev, condition: example }))}
                        >
                          {example}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="rule-severity">Severity</Label>
                  <Select
                    value={newRule.severity}
                    onValueChange={(value: any) => setNewRule((prev) => ({ ...prev, severity: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Applicable Columns</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 max-h-32 overflow-y-auto">
                    {file.headers.map((header) => (
                      <div key={header} className="flex items-center space-x-2">
                        <Checkbox
                          id={header}
                          checked={newRule.columns?.includes(header)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setNewRule((prev) => ({
                                ...prev,
                                columns: [...(prev.columns || []), header],
                              }))
                            } else {
                              setNewRule((prev) => ({
                                ...prev,
                                columns: (prev.columns || []).filter((col) => col !== header),
                              }))
                            }
                          }}
                        />
                        <Label htmlFor={header} className="text-sm">
                          {header}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddingRule(false)}>
                    Cancel
                  </Button>
                  <Button onClick={addCustomRule}>Add Rule</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={validationTab} onValueChange={setValidationTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="rules">Custom Rules</TabsTrigger>
          <TabsTrigger value="results">Validation Results</TabsTrigger>
          <TabsTrigger value="fixes">Apply Fixes</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          <div className="grid gap-4">
            {customRules.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center h-32">
                  <p className="text-gray-500">No custom rules defined. Click "Add Rule" to create one.</p>
                </CardContent>
              </Card>
            ) : (
              customRules.map((rule) => (
                <Card key={rule.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{rule.name}</CardTitle>
                      <Badge variant={rule.severity === "critical" ? "destructive" : "outline"}>{rule.severity}</Badge>
                      <Badge variant={rule.active ? "default" : "secondary"}>
                        {rule.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingRule(rule)
                          setIsEditingRule(true)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toggleRuleActive(rule.id)}>
                        {rule.active ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => deleteCustomRule(rule.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 mb-2">{rule.description}</p>
                    <div className="bg-gray-50 p-2 rounded text-sm font-mono">{rule.condition}</div>
                    <div className="mt-2">
                      <p className="text-xs text-gray-500">Applies to: {rule.columns.join(", ") || "All columns"}</p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Edit Rule Dialog */}
          <Dialog open={isEditingRule} onOpenChange={setIsEditingRule}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Validation Rule</DialogTitle>
                <DialogDescription>Update your custom validation rule</DialogDescription>
              </DialogHeader>
              {editingRule && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="edit-rule-name">Rule Name</Label>
                    <Input
                      id="edit-rule-name"
                      value={editingRule.name}
                      onChange={(e) => setEditingRule((prev) => (prev ? { ...prev, name: e.target.value } : null))}
                      placeholder="e.g., Age Validation"
                    />
                  </div>

                  <div>
                    <Label htmlFor="edit-rule-description">Description</Label>
                    <Input
                      id="edit-rule-description"
                      value={editingRule.description}
                      onChange={(e) =>
                        setEditingRule((prev) => (prev ? { ...prev, description: e.target.value } : null))
                      }
                      placeholder="Brief description of the rule"
                    />
                  </div>

                  <div>
                    <Label htmlFor="edit-rule-condition">Condition (Natural Language)</Label>
                    <Textarea
                      id="edit-rule-condition"
                      value={editingRule.condition}
                      onChange={(e) => setEditingRule((prev) => (prev ? { ...prev, condition: e.target.value } : null))}
                      placeholder="e.g., Flag if age < 0 or age > 120"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="edit-rule-severity">Severity</Label>
                    <Select
                      value={editingRule.severity}
                      onValueChange={(value: any) =>
                        setEditingRule((prev) => (prev ? { ...prev, severity: value } : null))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Applicable Columns</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2 max-h-32 overflow-y-auto">
                      {file.headers.map((header) => (
                        <div key={header} className="flex items-center space-x-2">
                          <Checkbox
                            id={`edit-${header}`}
                            checked={editingRule.columns.includes(header)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setEditingRule((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        columns: [...prev.columns, header],
                                      }
                                    : null,
                                )
                              } else {
                                setEditingRule((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        columns: prev.columns.filter((col) => col !== header),
                                      }
                                    : null,
                                )
                              }
                            }}
                          />
                          <Label htmlFor={`edit-${header}`} className="text-sm">
                            {header}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsEditingRule(false)}>
                      Cancel
                    </Button>
                    <Button onClick={updateCustomRule}>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {validationResults.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <p className="text-gray-500">No validation results. Run validation to see results.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <h3 className="text-lg font-semibold">Found {validationResults.length} validation issues</h3>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => exportCleanedData("csv")}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                  <Button variant="outline" onClick={() => exportCleanedData("xlsx")}>
                    <Download className="h-4 w-4 mr-2" />
                    Export Excel
                  </Button>
                </div>
              </div>

              {validationResults.map((result) => (
                <Card key={result.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{result.rule}</CardTitle>
                        <Badge variant={result.severity === "critical" ? "destructive" : "outline"}>
                          {result.severity}
                        </Badge>
                      </div>
                      <Badge variant="secondary">{result.affectedRows.length} rows affected</Badge>
                    </div>
                    <CardDescription>{result.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium mb-2">Suggestion:</p>
                        <p className="text-sm text-gray-600">{result.suggestion}</p>
                      </div>

                      <Tabs defaultValue="sql" className="w-full">
                        <TabsList>
                          <TabsTrigger value="sql">SQL Fix</TabsTrigger>
                          <TabsTrigger value="python">Python Fix</TabsTrigger>
                        </TabsList>
                        <TabsContent value="sql">
                          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                            <pre className="text-sm">
                              <code>{result.sqlFix}</code>
                            </pre>
                          </div>
                        </TabsContent>
                        <TabsContent value="python">
                          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                            <pre className="text-sm">
                              <code>{result.pythonFix}</code>
                            </pre>
                          </div>
                        </TabsContent>
                      </Tabs>

                      {result.canAutoFix && (
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedFixes((prev) => {
                                const newSet = new Set(prev)
                                newSet.add(result.id)
                                return newSet
                              })
                              setValidationTab("fixes")
                              toast.success("Issue added to fix queue")
                            }}
                          >
                            Add to Fix Queue
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="fixes" className="space-y-4">
          {validationResults.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <p className="text-gray-500">No validation results to fix. Run validation first.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Select Fixes to Apply</CardTitle>
                  <CardDescription>Choose which validation issues you want to automatically fix</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {validationResults.map((result) => (
                      <div key={result.id} className="flex items-center space-x-3 p-3 border rounded">
                        <Checkbox
                          id={result.id}
                          checked={selectedFixes.has(result.id)}
                          disabled={!result.canAutoFix}
                          onCheckedChange={(checked) => {
                            const newSelected = new Set(selectedFixes)
                            if (checked) {
                              newSelected.add(result.id)
                            } else {
                              newSelected.delete(result.id)
                            }
                            setSelectedFixes(newSelected)
                          }}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Label htmlFor={result.id} className="font-medium">
                              {result.rule}
                            </Label>
                            <Badge variant={result.severity === "critical" ? "destructive" : "outline"}>
                              {result.severity}
                            </Badge>
                            {!result.canAutoFix && (
                              <Badge variant="outline" className="bg-gray-100">
                                Manual Fix Required
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{result.description}</p>
                          <p className="text-xs text-gray-500">Affects {result.affectedRows.length} rows</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center mt-6">
                    <div className="text-sm text-gray-600">{selectedFixes.size} fixes selected</div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setSelectedFixes(new Set())}
                        disabled={selectedFixes.size === 0}
                      >
                        Clear Selection
                      </Button>
                      <Button onClick={applyFixes} disabled={selectedFixes.size === 0 || isApplyingFixes}>
                        {isApplyingFixes ? "Applying..." : "Apply Selected Fixes"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Export Options</CardTitle>
                  <CardDescription>Download your cleaned data in various formats</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    <Button onClick={() => exportCleanedData("csv")}>
                      <Download className="h-4 w-4 mr-2" />
                      Download CSV
                    </Button>
                    <Button onClick={() => exportCleanedData("xlsx")}>
                      <Download className="h-4 w-4 mr-2" />
                      Download Excel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
