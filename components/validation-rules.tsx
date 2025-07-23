"use client"

import { useState, useEffect, useCallback } from "react"
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
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { FileData, ValidationResult } from "@/app/page"
import {
  Plus,
  Download,
  Play,
  Trash2,
  Edit,
  Save,
  AlertTriangle,
  CheckCircle,
  Info,
  BookOpen,
  Lightbulb,
  Settings,
  Wand2,
  Eye,
  Send,
} from "lucide-react"
import * as XLSX from "xlsx"
import { toast } from "sonner"
import { groq } from "@ai-sdk/groq"
import { generateText } from "ai"

// ============================================================================
// COMPONENT PROPS AND INTERFACES
// ============================================================================

/**
 * Props for the ValidationRules component
 */
interface ValidationRulesProps {
  file: FileData // The file data to validate
  onFileUpdate: (file: FileData) => void // Callback to update file data
}

/**
 * Structure for user-defined validation rules
 * These allow users to create custom data quality checks
 */
interface CustomRule {
  id: string // Unique identifier
  name: string // User-friendly name
  description: string // Detailed description
  condition: string // Natural language condition
  severity: "low" | "medium" | "high" | "critical" // Impact level
  columns: string[] // Applicable columns
  active: boolean // Whether rule is enabled
}

/**
 * Options for fixing validation issues
 * Each validation issue can have multiple fix approaches
 */
interface FixOption {
  id: string // Unique identifier for this fix option
  name: string // User-friendly name
  description: string // What this fix does
  action: string // Internal action type
  preview?: string // Preview of what will happen
}

/**
 * State for the fix selection dialog
 */
interface FixDialog {
  isOpen: boolean // Whether dialog is visible
  result: ValidationResult | null // The validation result being fixed
  options: FixOption[] // Available fix options
  selectedOption: string // Currently selected fix option
}

/**
 * ValidationRules Component
 *
 * This component handles:
 * 1. Creating and managing custom validation rules
 * 2. Running validation checks on data
 * 3. Providing fix options for validation issues
 * 4. Exporting cleaned data
 */
export function ValidationRules({ file, onFileUpdate }: ValidationRulesProps) {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  // Custom validation rules state
  const [customRules, setCustomRules] = useState<CustomRule[]>(file.customRules || [])
  const [newRule, setNewRule] = useState<Partial<CustomRule>>({
    severity: "medium",
    columns: [],
    active: true,
  })
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null)

  // UI state for dialogs and forms
  const [isAddingRule, setIsAddingRule] = useState(false)
  const [isEditingRule, setIsEditingRule] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)

  // Validation execution state
  const [validationResults, setValidationResults] = useState<ValidationResult[]>(file.validationResults || [])
  const [isValidating, setIsValidating] = useState(false)
  const [validationProgress, setValidationProgress] = useState(0)

  // Fix application state
  const [selectedFixes, setSelectedFixes] = useState<Set<string>>(new Set())
  const [isApplyingFixes, setIsApplyingFixes] = useState(false)
  const [fixedData, setFixedData] = useState<any[]>([])
  const [fixSummary, setFixSummary] = useState<{ [key: string]: number }>({})

  // Tab and dialog state
  const [validationTab, setValidationTab] = useState("rules")
  const [fixDialog, setFixDialog] = useState<FixDialog>({
    isOpen: false,
    result: null,
    options: [],
    selectedOption: "",
  })

  // AI-powered features state
  const [aiInsights, setAiInsights] = useState<string>("")
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([])
  const [showAiTutor, setShowAiTutor] = useState(false)
  const [tutorMessages, setTutorMessages] = useState<{ role: string; content: string }[]>([])
  const [userQuestion, setUserQuestion] = useState("")
  const [isAskingAi, setIsAskingAi] = useState(false)
  const [selectedRowsForAi, setSelectedRowsForAi] = useState<Set<number>>(new Set())
  const [selectedColumnsForAi, setSelectedColumnsForAi] = useState<Set<string>>(new Set())
  const [aiCleaningMode, setAiCleaningMode] = useState<"row" | "column" | "cell">("row")
  const [showDataPreview, setShowDataPreview] = useState(false)
  const [previewData, setPreviewData] = useState<any[]>([])

  // ============================================================================
  // INITIALIZATION AND DATA LOADING
  // ============================================================================

  /**
   * Load saved rules and validation results from file data
   * This runs when the component mounts or when the file changes
   */
  useEffect(() => {
    if (file.customRules && JSON.stringify(file.customRules) !== JSON.stringify(customRules)) {
      setCustomRules(file.customRules)
    }
    if (file.validationResults && JSON.stringify(file.validationResults) !== JSON.stringify(validationResults)) {
      setValidationResults(file.validationResults)
    }
    // Initialize fixed data with original data
    setFixedData([...file.data])
  }, [file.customRules, file.validationResults, file.data])

  // ============================================================================
  // FIX OPTION GENERATION
  // ============================================================================

  /**
   * Generate available fix options for a validation result
   * Different types of issues have different fix approaches
   */
  const generateFixOptions = useCallback(
    (result: ValidationResult): FixOption[] => {
      const options: FixOption[] = []

      switch (result.rule) {
        case "null_values":
          // For null values, we can remove rows or fill with defaults
          const column = result.id.replace("null_", "")
          const dataType = file.analysis?.dataTypes?.[column] || "string"

          options.push({
            id: "remove_rows",
            name: "Remove Rows",
            description: "Delete all rows with missing values",
            action: "delete",
            preview: `Will remove ${result.affectedRows.length} rows`,
          })

          // Different fill options based on data type
          if (dataType === "number") {
            options.push({
              id: "fill_mean",
              name: "Fill with Mean",
              description: "Replace missing values with column average",
              action: "fill_mean",
              preview: "Calculate and use mean value",
            })
            options.push({
              id: "fill_median",
              name: "Fill with Median",
              description: "Replace missing values with column median",
              action: "fill_median",
              preview: "Calculate and use median value",
            })
            options.push({
              id: "fill_zero",
              name: "Fill with Zero",
              description: "Replace missing values with 0",
              action: "fill_zero",
              preview: "Set all missing values to 0",
            })
          } else if (dataType === "string") {
            options.push({
              id: "fill_unknown",
              name: "Fill with 'Unknown'",
              description: "Replace missing values with 'Unknown'",
              action: "fill_unknown",
              preview: "Set all missing values to 'Unknown'",
            })
            options.push({
              id: "fill_empty",
              name: "Fill with Empty String",
              description: "Replace missing values with empty string",
              action: "fill_empty",
              preview: "Set all missing values to ''",
            })
          } else if (dataType === "date") {
            options.push({
              id: "fill_today",
              name: "Fill with Today's Date",
              description: "Replace missing values with current date",
              action: "fill_today",
              preview: `Set all missing values to ${new Date().toISOString().split("T")[0]}`,
            })
          }
          break

        case "duplicates":
          // For duplicates, we can remove them or mark them
          options.push({
            id: "remove_duplicates",
            name: "Remove All Duplicates",
            description: "Keep only the first occurrence of each duplicate",
            action: "remove_duplicates",
            preview: `Will remove ${result.affectedRows.length} duplicate rows`,
          })
          options.push({
            id: "mark_duplicates",
            name: "Mark Duplicates",
            description: "Add a column to flag duplicate rows",
            action: "mark_duplicates",
            preview: "Add 'is_duplicate' column",
          })
          break

        case "invalid_email":
          // For invalid emails, we can remove, clear, or attempt to fix
          options.push({
            id: "remove_invalid_emails",
            name: "Remove Invalid Emails",
            description: "Delete rows with invalid email addresses",
            action: "remove_invalid",
            preview: `Will remove ${result.affectedRows.length} rows`,
          })
          options.push({
            id: "clear_invalid_emails",
            name: "Clear Invalid Emails",
            description: "Set invalid email addresses to empty",
            action: "clear_invalid",
            preview: "Clear invalid email values",
          })
          options.push({
            id: "attempt_fix_emails",
            name: "Attempt to Fix",
            description: "Try to correct common email format issues",
            action: "attempt_fix",
            preview: "Fix common issues like missing @ or .com",
          })
          break

        case "age_validation":
          // For invalid ages, we can remove, cap, or clear
          options.push({
            id: "remove_invalid_ages",
            name: "Remove Invalid Ages",
            description: "Delete rows with unrealistic ages",
            action: "remove_invalid",
            preview: `Will remove ${result.affectedRows.length} rows`,
          })
          options.push({
            id: "cap_ages",
            name: "Cap Ages",
            description: "Set maximum age limit (e.g., 120)",
            action: "cap_values",
            preview: "Set ages > 120 to 120, ages < 0 to null",
          })
          options.push({
            id: "clear_invalid_ages",
            name: "Clear Invalid Ages",
            description: "Set invalid ages to null",
            action: "clear_invalid",
            preview: "Clear unrealistic age values",
          })
          break

        default:
          // Generic options for custom rules
          options.push({
            id: "remove_rows",
            name: "Remove Affected Rows",
            description: "Delete all rows that fail this validation",
            action: "remove_rows",
            preview: `Will remove ${result.affectedRows.length} rows`,
          })
          options.push({
            id: "mark_issues",
            name: "Mark Issues",
            description: "Add a column to flag problematic rows",
            action: "mark_issues",
            preview: "Add validation flag column",
          })
          break
      }

      return options
    },
    [file.analysis?.dataTypes],
  )

  // ============================================================================
  // FIX APPLICATION LOGIC
  // ============================================================================

  /**
   * Apply a specific fix option to the data
   * This is where the actual data transformation happens
   */
  const applyFixOption = useCallback(
    (result: ValidationResult, option: FixOption): any[] => {
      let updatedData = [...fixedData]
      const column = result.id.replace("null_", "")

      switch (option.action) {
        case "delete":
        case "remove_rows":
        case "remove_invalid":
          // Remove affected rows from the dataset
          updatedData = updatedData.filter((_, index) => !result.affectedRows.includes(index))
          break

        case "fill_mean":
          // Fill null values with the mean of valid values
          if (file.analysis?.dataTypes?.[column] === "number") {
            const validValues = updatedData
              .map((row) => Number(row[column]))
              .filter((val) => !isNaN(val) && val !== null && val !== undefined)
            const mean = validValues.reduce((sum, val) => sum + val, 0) / validValues.length

            updatedData = updatedData.map((row, index) => {
              if (result.affectedRows.includes(index)) {
                return { ...row, [column]: Math.round(mean * 100) / 100 }
              }
              return row
            })
          }
          break

        case "fill_median":
          // Fill null values with the median of valid values
          if (file.analysis?.dataTypes?.[column] === "number") {
            const validValues = updatedData
              .map((row) => Number(row[column]))
              .filter((val) => !isNaN(val) && val !== null && val !== undefined)
              .sort((a, b) => a - b)
            const median =
              validValues.length % 2 === 0
                ? (validValues[validValues.length / 2 - 1] + validValues[validValues.length / 2]) / 2
                : validValues[Math.floor(validValues.length / 2)]

            updatedData = updatedData.map((row, index) => {
              if (result.affectedRows.includes(index)) {
                return { ...row, [column]: Math.round(median * 100) / 100 }
              }
              return row
            })
          }
          break

        case "fill_zero":
          // Fill null values with zero
          updatedData = updatedData.map((row, index) => {
            if (result.affectedRows.includes(index)) {
              return { ...row, [column]: 0 }
            }
            return row
          })
          break

        case "fill_unknown":
          // Fill null values with "Unknown"
          updatedData = updatedData.map((row, index) => {
            if (result.affectedRows.includes(index)) {
              return { ...row, [column]: "Unknown" }
            }
            return row
          })
          break

        case "fill_empty":
          // Fill null values with empty string
          updatedData = updatedData.map((row, index) => {
            if (result.affectedRows.includes(index)) {
              return { ...row, [column]: "" }
            }
            return row
          })
          break

        case "fill_today":
          // Fill null values with today's date
          updatedData = updatedData.map((row, index) => {
            if (result.affectedRows.includes(index)) {
              return { ...row, [column]: new Date().toISOString().split("T")[0] }
            }
            return row
          })
          break

        case "remove_duplicates":
          // Remove duplicate rows, keeping only the first occurrence
          const seen = new Set<string>()
          updatedData = updatedData.filter((row) => {
            const rowString = JSON.stringify(row)
            if (seen.has(rowString)) {
              return false
            }
            seen.add(rowString)
            return true
          })
          break

        case "mark_duplicates":
          // Add a column to mark duplicate rows
          const duplicateSet = new Set<string>()
          const duplicateRows = new Set<number>()

          updatedData.forEach((row, index) => {
            const rowString = JSON.stringify(row)
            if (duplicateSet.has(rowString)) {
              duplicateRows.add(index)
            } else {
              duplicateSet.add(rowString)
            }
          })

          updatedData = updatedData.map((row, index) => ({
            ...row,
            is_duplicate: duplicateRows.has(index) ? "Yes" : "No",
          }))
          break

        case "clear_invalid":
          // Clear invalid values by setting them to null
          updatedData = updatedData.map((row, index) => {
            if (result.affectedRows.includes(index)) {
              return { ...row, [column]: null }
            }
            return row
          })
          break

        case "attempt_fix":
          // Attempt to fix common issues (e.g., email format)
          if (result.rule === "invalid_email") {
            updatedData = updatedData.map((row, index) => {
              if (result.affectedRows.includes(index)) {
                let email = String(row[column] || "")

                // Common email fixes
                if (!email.includes("@") && email.includes(" at ")) {
                  email = email.replace(" at ", "@")
                }
                if (!email.includes(".") && email.includes(" dot ")) {
                  email = email.replace(" dot ", ".")
                }
                if (email.endsWith("@")) {
                  email += "gmail.com"
                }
                if (email.includes("@") && !email.includes(".")) {
                  email += ".com"
                }

                return { ...row, [column]: email }
              }
              return row
            })
          }
          break

        case "cap_values":
          // Cap values at reasonable limits (e.g., age)
          if (result.rule === "age_validation") {
            updatedData = updatedData.map((row, index) => {
              if (result.affectedRows.includes(index)) {
                let age = Number(row[column])
                if (age > 120) age = 120
                if (age < 0) age = null
                return { ...row, [column]: age }
              }
              return row
            })
          }
          break

        case "mark_issues":
          // Add a flag column to mark problematic rows
          const flagColumn = `${result.rule}_flag`
          updatedData = updatedData.map((row, index) => ({
            ...row,
            [flagColumn]: result.affectedRows.includes(index) ? "Issue" : "OK",
          }))
          break

        default:
          console.warn("Unknown fix action:", option.action)
          break
      }

      return updatedData
    },
    [fixedData, file.analysis?.dataTypes],
  )

  // ============================================================================
  // FIX DIALOG MANAGEMENT
  // ============================================================================

  /**
   * Open the fix selection dialog for a validation result
   */
  const openFixDialog = useCallback(
    (result: ValidationResult) => {
      const options = generateFixOptions(result)
      setFixDialog({
        isOpen: true,
        result,
        options,
        selectedOption: options[0]?.id || "",
      })
    },
    [generateFixOptions],
  )

  /**
   * Apply the selected fix from the dialog
   */
  const applySelectedFix = useCallback(() => {
    if (!fixDialog.result || !fixDialog.selectedOption) return

    const option = fixDialog.options.find((opt) => opt.id === fixDialog.selectedOption)
    if (!option) return

    try {
      // Apply the fix to the data
      const newData = applyFixOption(fixDialog.result, option)
      setFixedData(newData)

      // Update fix summary for tracking
      setFixSummary((prev) => ({
        ...prev,
        [fixDialog.result!.rule]: (prev[fixDialog.result!.rule] || 0) + fixDialog.result!.affectedRows.length,
      }))

      // Remove this result from selected fixes and validation results
      setSelectedFixes((prev) => {
        const newSet = new Set(prev)
        newSet.delete(fixDialog.result!.id)
        return newSet
      })

      setValidationResults((prev) => prev.filter((r) => r.id !== fixDialog.result!.id))

      toast.success(`Applied fix: ${option.name}`)
      setFixDialog({ isOpen: false, result: null, options: [], selectedOption: "" })
    } catch (error) {
      console.error("Error applying fix:", error)
      toast.error("Failed to apply fix")
    }
  }, [fixDialog, applyFixOption])

  // ============================================================================
  // SQL AND PYTHON FIX CODE GENERATION
  // ============================================================================

  /**
   * Generate SQL code to fix validation issues
   * This provides users with SQL scripts they can run on their databases
   */
  const generateSQLFix = useCallback((result: ValidationResult): string => {
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
  }, [])

  /**
   * Generate Python code to fix validation issues
   * This provides users with Python/pandas scripts for data cleaning
   */
  const generatePythonFix = useCallback((result: ValidationResult): string => {
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
  }, [])

  // ============================================================================
  // VALIDATION EXECUTION
  // ============================================================================

  /**
   * Run validation checks on the current data
   * This is the main validation engine that checks for various data quality issues
   */
  const runValidation = useCallback(async () => {
    if (isValidating) return

    setIsValidating(true)
    setValidationProgress(0)
    setValidationTab("results")

    try {
      const toastId = toast.loading("Running validation...", { duration: 10000 })

      // Use fixed data for validation if available, otherwise use original data
      const dataToValidate = fixedData.length > 0 ? fixedData : file.data
      const maxRowsToProcess = Math.min(dataToValidate.length, 10000) // Limit for performance
      const dataToProcess = dataToValidate.slice(0, maxRowsToProcess)

      const results: ValidationResult[] = []
      const totalSteps = file.headers.length + 3 // headers + duplicates + custom rules + finalization
      let currentStep = 0

      // ========================================================================
      // CHECK FOR NULL VALUES
      // ========================================================================
      for (const header of file.headers) {
        setValidationProgress((currentStep / totalSteps) * 100)

        // Count null, undefined, and empty string values
        const nullCount = dataToProcess.filter(
          (row) => row[header] === null || row[header] === undefined || row[header] === "",
        ).length

        if (nullCount > 0) {
          results.push({
            id: `null_${header}`,
            rule: "null_values",
            severity: nullCount > dataToProcess.length * 0.1 ? "high" : "medium", // High severity if >10% null
            affectedRows: dataToProcess
              .map((row, index) =>
                row[header] === null || row[header] === undefined || row[header] === "" ? index : -1,
              )
              .filter((index) => index !== -1)
              .slice(0, 1000), // Limit for performance
            description: `${nullCount} null values found in column "${header}"${dataToValidate.length > maxRowsToProcess ? ` (checked first ${maxRowsToProcess} rows)` : ""}`,
            suggestion: `Consider filling null values with appropriate defaults or removing incomplete records`,
            sqlFix: generateSQLFix({ rule: "null_values" } as ValidationResult),
            pythonFix: generatePythonFix({ rule: "null_values" } as ValidationResult),
            canAutoFix: true,
          })
        }
        currentStep++
        await new Promise((resolve) => setTimeout(resolve, 10)) // Allow UI to update
      }

      // ========================================================================
      // CHECK FOR DUPLICATE ROWS
      // ========================================================================
      setValidationProgress((currentStep / totalSteps) * 100)
      const duplicateRows: number[] = []
      const seen = new Set<string>()

      dataToProcess.forEach((row, index) => {
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
          affectedRows: duplicateRows.slice(0, 1000), // Limit for performance
          description: `${duplicateRows.length} duplicate rows found${dataToValidate.length > maxRowsToProcess ? ` (checked first ${maxRowsToProcess} rows)` : ""}`,
          suggestion: "Remove duplicate rows to ensure data uniqueness",
          sqlFix: generateSQLFix({ rule: "duplicates" } as ValidationResult),
          pythonFix: generatePythonFix({ rule: "duplicates" } as ValidationResult),
          canAutoFix: true,
        })
      }
      currentStep++

      // ========================================================================
      // RUN CUSTOM VALIDATION RULES
      // ========================================================================
      setValidationProgress((currentStep / totalSteps) * 100)
      for (const rule of customRules.filter((rule) => rule.active)) {
        try {
          const affectedRows: number[] = []

          // Simple rule evaluation logic
          // This is a basic implementation - in a production system, you'd want a more sophisticated rule engine
          dataToProcess.forEach((row, index) => {
            // Check for null values in specified columns
            if (rule.condition.toLowerCase().includes("null") && rule.columns.some((col) => !row[col])) {
              affectedRows.push(index)
            }
            // Check for numeric conditions
            else if (rule.columns.length > 0) {
              const column = rule.columns[0]
              const value = Number(row[column])

              if (!isNaN(value)) {
                // Age validation examples
                if (rule.condition.includes("age < 0") && value < 0) {
                  affectedRows.push(index)
                } else if (rule.condition.includes("age > 120") && value > 120) {
                  affectedRows.push(index)
                }
                // Salary validation examples
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
              affectedRows: affectedRows.slice(0, 1000), // Limit for performance
              description: `${rule.description} (${affectedRows.length} rows affected)${dataToValidate.length > maxRowsToProcess ? ` (checked first ${maxRowsToProcess} rows)` : ""}`,
              suggestion: `Custom rule "${rule.name}" validation failed. Review the affected rows.`,
              sqlFix: generateSQLFix({ rule: rule.name } as ValidationResult),
              pythonFix: generatePythonFix({ rule: rule.name } as ValidationResult),
              canAutoFix: false, // Custom rules typically require manual review
            })
          }
        } catch (error) {
          console.error("Error running custom rule:", rule.name, error)
          toast.error(`Error running rule: ${rule.name}`)
        }
      }
      currentStep++

      setValidationProgress(100)
      setValidationResults(results)

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
      setValidationProgress(0)
    }
  }, [file, customRules, isValidating, generateSQLFix, generatePythonFix, onFileUpdate, fixedData])

  // ============================================================================
  // DATA EXPORT FUNCTIONALITY
  // ============================================================================

  /**
   * Export cleaned data in CSV or Excel format
   * Users can download their cleaned data after applying fixes
   */
  const exportCleanedData = useCallback(
    (format: "csv" | "xlsx") => {
      try {
        // Use fixed data if available, otherwise use original data
        const dataToExport = fixedData.length > 0 ? fixedData : file.data
        const headersToExport = fixedData.length > 0 && fixedData[0] ? Object.keys(fixedData[0]) : file.headers

        if (format === "csv") {
          // Generate CSV content
          const csv = [
            headersToExport.join(","),
            ...dataToExport.map((row) =>
              headersToExport
                .map((header) =>
                  typeof row[header] === "string" && row[header]?.includes(",")
                    ? `"${row[header]}"`
                    : row[header] || "",
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
          toast.success("Clean CSV file exported successfully")
        } else {
          // Generate Excel file using XLSX library
          const ws = XLSX.utils.json_to_sheet(dataToExport)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, "Cleaned Data")

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
          toast.success("Clean Excel file exported successfully")
        }
      } catch (error) {
        console.error("Error exporting data:", error)
        toast.error("Error exporting data")
      }
    },
    [fixedData, file],
  )

  // ============================================================================
  // CUSTOM RULE MANAGEMENT
  // ============================================================================

  /**
   * Add a new custom validation rule
   * Users can create their own data quality checks using natural language
   */
  const addCustomRule = useCallback(() => {
    if (!newRule.name || !newRule.condition) {
      toast.error("Rule name and condition are required")
      return
    }

    const rule: CustomRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: newRule.name!,
      description: newRule.description || "",
      condition: newRule.condition!,
      severity: newRule.severity!,
      columns: newRule.columns || [],
      active: true,
    }

    const updatedRules = [...customRules, rule]
    setCustomRules(updatedRules)
    setNewRule({ severity: "medium", columns: [], active: true })
    setIsAddingRule(false)

    toast.success(`Rule "${rule.name}" added successfully`)

    // Save rules to file
    const updatedFile = {
      ...file,
      customRules: updatedRules,
    }
    onFileUpdate(updatedFile)
  }, [newRule, customRules, file, onFileUpdate])

  /**
   * Update an existing custom validation rule
   */
  const updateCustomRule = useCallback(() => {
    if (!editingRule || !editingRule.name || !editingRule.condition) {
      toast.error("Rule name and condition are required")
      return
    }

    const updatedRules = customRules.map((rule) => (rule.id === editingRule.id ? editingRule : rule))
    setCustomRules(updatedRules)
    setEditingRule(null)
    setIsEditingRule(false)

    toast.success(`Rule "${editingRule.name}" updated successfully`)

    // Save updated rules to file
    const updatedFile = {
      ...file,
      customRules: updatedRules,
    }
    onFileUpdate(updatedFile)
  }, [editingRule, customRules, file, onFileUpdate])

  /**
   * Delete a custom validation rule
   */
  const deleteCustomRule = useCallback(
    (ruleId: string) => {
      const ruleToDelete = customRules.find((r) => r.id === ruleId)
      if (!ruleToDelete) return

      const updatedRules = customRules.filter((r) => r.id !== ruleId)
      setCustomRules(updatedRules)
      toast.success(`Rule "${ruleToDelete.name}" deleted`)

      // Save updated rules to file
      const updatedFile = {
        ...file,
        customRules: updatedRules,
      }
      onFileUpdate(updatedFile)
    },
    [customRules, file, onFileUpdate],
  )

  /**
   * Toggle a rule's active status
   */
  const toggleRuleActive = useCallback(
    (ruleId: string) => {
      const updatedRules = customRules.map((rule) => (rule.id === ruleId ? { ...rule, active: !rule.active } : rule))
      setCustomRules(updatedRules)

      // Save updated rules to file
      const updatedFile = {
        ...file,
        customRules: updatedRules,
      }
      onFileUpdate(updatedFile)
    },
    [customRules, file, onFileUpdate],
  )

  /**
   * Apply cleaned data as the new dataset
   * This finalizes all the fixes and updates the main file data
   */
  const finalizeCleanedData = useCallback(() => {
    if (fixedData.length === 0) {
      toast.error("No fixes have been applied yet")
      return
    }

    // Update the file with cleaned data
    const updatedFile = {
      ...file,
      data: fixedData,
      efficiency: {
        ...file.efficiency!,
        fixesApplied: Object.values(fixSummary).reduce((sum, count) => sum + count, 0),
        dataQualityImprovement: 25, // Estimate improvement
      },
    }

    onFileUpdate(updatedFile)
    toast.success("Cleaned data has been applied to your dataset!")

    // Clear validation results since data is now clean
    setValidationResults([])
    setSelectedFixes(new Set())
  }, [fixedData, file, onFileUpdate, fixSummary])

  // ============================================================================
  // CONSTANTS AND EXAMPLES
  // ============================================================================

  // Example natural language conditions for user guidance
  const naturalLanguageExamples = [
    "Flag if age < 0 or age > 120",
    "Email must contain @ and .",
    "Salary must be greater than 0",
    "Start date must be before end date",
    "Phone number must be 10 digits",
  ]

  // Tutorial steps to help new users understand the validation process
  const tutorialSteps = [
    {
      title: "Understanding Data Validation",
      content:
        "Data validation ensures your data meets specific quality standards. It helps identify errors, inconsistencies, and missing values that could affect your analysis.",
    },
    {
      title: "Creating Custom Rules",
      content:
        "Custom rules allow you to define specific validation criteria for your data. Use natural language to describe what should be flagged as invalid.",
    },
    {
      title: "Running Validation",
      content:
        "Click 'Run Validation' to check your data against all active rules. The system will identify issues and provide suggestions for fixes.",
    },
    {
      title: "Choosing Fix Options",
      content:
        "For each issue found, you can choose from multiple fix options. The system will show you exactly what each fix will do before applying it.",
    },
    {
      title: "Applying Fixes",
      content:
        "Review validation results and select which issues to fix. You can preview changes and choose the best approach for each problem.",
    },
    {
      title: "Exporting Clean Data",
      content:
        "After applying fixes, export your cleaned data in CSV or Excel format. The cleaned dataset will be ready for analysis.",
    },
  ]

  // ============================================================================
  // AI-POWERED FEATURES
  // ============================================================================

  /**
   * Generate AI insights about data quality issues using Groq
   */
  const generateAiInsights = useCallback(async () => {
    if (!file.analysis || isGeneratingInsights) return

    setIsGeneratingInsights(true)

    try {
      // Prepare data summary for AI analysis
      const dataSummary = {
        totalRows: file.analysis.totalRows,
        totalColumns: file.analysis.totalColumns,
        nullValues: Object.entries(file.analysis.nullValues)
          .filter(([, count]) => count > 0)
          .slice(0, 10), // Top 10 columns with null values
        duplicates: file.analysis.duplicates,
        contextualIssues: file.analysis.contextualIssues.slice(0, 5),
        crossFieldIssues: file.analysis.crossFieldIssues.slice(0, 3),
        qualityScore: file.analysis.qualityScore,
        dataTypes: file.analysis.dataTypes,
        headers: file.headers.slice(0, 20), // First 20 headers
      }

      const prompt = `As a data quality expert, analyze this dataset and provide insights:

Dataset Summary:
- File: ${file.name}
- Rows: ${dataSummary.totalRows}
- Columns: ${dataSummary.totalColumns}
- Quality Score: ${dataSummary.qualityScore}%
- Duplicates: ${dataSummary.duplicates}

Column Headers: ${dataSummary.headers.join(", ")}

Data Types: ${JSON.stringify(dataSummary.dataTypes, null, 2)}

Null Values Issues:
${dataSummary.nullValues.map(([col, count]) => `- ${col}: ${count} missing values`).join("\n")}

Sample Issues Found:
${dataSummary.contextualIssues.map((issue) => `- ${issue.column}: ${issue.issue} (${issue.severity})`).join("\n")}

Cross-field Issues:
${dataSummary.crossFieldIssues.map((issue) => `- ${issue.columns.join(" & ")}: ${issue.issue}`).join("\n")}

Please provide:
1. Overall data quality assessment
2. Priority issues to fix first
3. Business impact of current issues
4. Step-by-step cleaning recommendations
5. Potential data relationships to explore
6. Best practices for this type of dataset

Format your response in clear sections with actionable insights.`

      const { text } = await generateText({
        model: groq("llama-3.1-8b-instant"),
        prompt,
        maxTokens: 1500,
      })

      setAiInsights(text)
      toast.success("AI insights generated successfully!")
    } catch (error) {
      console.error("Error generating AI insights:", error)
      toast.error("Failed to generate AI insights. Please check your API configuration.")
    } finally {
      setIsGeneratingInsights(false)
    }
  }, [file, isGeneratingInsights])

  /**
   * Get AI-powered cleaning suggestions for specific data issues
   */
  const getAiCleaningSuggestions = useCallback(
    async (issueType: string, affectedData: any[]) => {
      try {
        const prompt = `As a data cleaning expert, provide specific suggestions for this ${issueType} issue:

Affected Data Sample:
${JSON.stringify(affectedData.slice(0, 5), null, 2)}

Dataset Context:
- File: ${file.name}
- Total Rows: ${file.data.length}
- Columns: ${file.headers.join(", ")}

Please provide:
1. Root cause analysis of this issue
2. Multiple cleaning approaches (conservative, moderate, aggressive)
3. Potential side effects of each approach
4. Code examples (Python/SQL) for implementation
5. Quality checks to perform after cleaning

Be specific and actionable.`

        const { text } = await generateText({
          model: groq("llama-3.1-8b-instant"),
          prompt,
          maxTokens: 1000,
        })

        return text
      } catch (error) {
        console.error("Error getting AI suggestions:", error)
        return "Unable to generate AI suggestions at this time."
      }
    },
    [file],
  )

  /**
   * AI Tutor for helping users understand data validation concepts
   */
  const askAiTutor = useCallback(async () => {
    if (!userQuestion.trim() || isAskingAi) return

    setIsAskingAi(true)

    try {
      // Add user question to chat
      const newMessages = [...tutorMessages, { role: "user", content: userQuestion }]
      setTutorMessages(newMessages)

      // Prepare context about current dataset
      const dataContext = `
Current Dataset Context:
- File: ${file.name}
- Rows: ${file.analysis?.totalRows || 0}
- Columns: ${file.headers.length}
- Quality Score: ${file.analysis?.qualityScore || 0}%
- Active Validation Rules: ${customRules.filter((r) => r.active).length}
- Current Issues: ${validationResults.length}
`

      const conversationHistory = newMessages.map((msg) => `${msg.role}: ${msg.content}`).join("\n")

      const prompt = `You are an expert data validation tutor helping users understand data quality concepts and best practices.

${dataContext}

Conversation History:
${conversationHistory}

Please provide a helpful, educational response that:
1. Answers the user's question clearly
2. Explains relevant concepts in simple terms
3. Provides practical examples when possible
4. Suggests next steps or related topics to explore
5. References the current dataset when relevant

Keep responses concise but informative, suitable for users learning data validation.`

      const { text } = await generateText({
        model: groq("llama-3.1-8b-instant"),
        prompt,
        maxTokens: 800,
      })

      // Add AI response to chat
      setTutorMessages([...newMessages, { role: "assistant", content: text }])
      setUserQuestion("")
    } catch (error) {
      console.error("Error asking AI tutor:", error)
      toast.error("Failed to get AI tutor response")
    } finally {
      setIsAskingAi(false)
    }
  }, [userQuestion, tutorMessages, file, customRules, validationResults, isAskingAi])

  /**
   * AI-powered row-wise data cleaning
   */
  const cleanRowsWithAi = useCallback(
    async (rowIndices: number[]) => {
      if (rowIndices.length === 0) return

      try {
        const selectedRows = rowIndices.map((i) => file.data[i]).slice(0, 10) // Limit for API

        const prompt = `Analyze these data rows and suggest cleaning actions:

Rows to analyze:
${JSON.stringify(selectedRows, null, 2)}

Column headers: ${file.headers.join(", ")}

For each row, identify:
1. Data quality issues (missing values, inconsistencies, outliers)
2. Suggested fixes with confidence levels
3. Whether the row should be kept, modified, or removed
4. Reasoning for each recommendation

Provide response in JSON format:
{
  "recommendations": [
    {
      "rowIndex": 0,
      "issues": ["list of issues"],
      "action": "keep|modify|remove",
      "fixes": {"column": "suggested_value"},
      "confidence": 0.95,
      "reasoning": "explanation"
    }
  ]
}`

        const { text } = await generateText({
          model: groq("llama-3.1-8b-instant"),
          prompt,
          maxTokens: 1200,
        })

        try {
          const aiResponse = JSON.parse(text)
          setAiSuggestions(aiResponse.recommendations || [])
          toast.success(`AI analyzed ${rowIndices.length} rows and provided recommendations`)
        } catch (parseError) {
          // Fallback if JSON parsing fails
          setAiSuggestions([
            {
              rowIndex: 0,
              issues: ["AI analysis completed"],
              action: "review",
              fixes: {},
              confidence: 0.8,
              reasoning: text.substring(0, 200) + "...",
            },
          ])
        }
      } catch (error) {
        console.error("Error cleaning rows with AI:", error)
        toast.error("Failed to get AI cleaning suggestions")
      }
    },
    [file],
  )

  /**
   * AI-powered column-wise data cleaning
   */
  const cleanColumnsWithAi = useCallback(
    async (columnNames: string[]) => {
      if (columnNames.length === 0) return

      try {
        const columnData = columnNames.reduce((acc, col) => {
          acc[col] = {
            dataType: file.analysis?.dataTypes?.[col] || "unknown",
            nullCount: file.analysis?.nullValues?.[col] || 0,
            sampleValues: file.data
              .slice(0, 10)
              .map((row) => row[col])
              .filter((v) => v != null),
          }
          return acc
        }, {} as any)

        const prompt = `Analyze these data columns and suggest cleaning strategies:

Column Analysis:
${JSON.stringify(columnData, null, 2)}

Total rows: ${file.data.length}

For each column, provide:
1. Data quality assessment
2. Standardization recommendations
3. Missing value handling strategy
4. Data type optimization
5. Validation rules to implement

Provide response in JSON format:
{
  "columnRecommendations": [
    {
      "column": "column_name",
      "qualityScore": 85,
      "issues": ["list of issues"],
      "cleaningSteps": ["step1", "step2"],
      "validationRules": ["rule1", "rule2"],
      "expectedImprovement": "description"
    }
  ]
}`

        const { text } = await generateText({
          model: groq("llama-3.1-8b-instant"),
          prompt,
          maxTokens: 1200,
        })

        try {
          const aiResponse = JSON.parse(text)
          setAiSuggestions(aiResponse.columnRecommendations || [])
          toast.success(`AI analyzed ${columnNames.length} columns and provided recommendations`)
        } catch (parseError) {
          setAiSuggestions([
            {
              column: columnNames[0],
              qualityScore: 75,
              issues: ["AI analysis completed"],
              cleaningSteps: [text.substring(0, 100) + "..."],
              validationRules: [],
              expectedImprovement: "See full analysis above",
            },
          ])
        }
      } catch (error) {
        console.error("Error cleaning columns with AI:", error)
        toast.error("Failed to get AI column analysis")
      }
    },
    [file],
  )

  /**
   * Generate interactive data preview with AI insights
   */
  const generateDataPreview = useCallback(() => {
    const sampleData = file.data.slice(0, 50) // Show first 50 rows
    setPreviewData(sampleData)
    setShowDataPreview(true)
  }, [file.data])

  /**
   * Apply AI-suggested fixes to data
   */
  const applyAiSuggestions = useCallback(
    async (suggestions: any[]) => {
      try {
        let updatedData = [...(fixedData.length > 0 ? fixedData : file.data)]
        let changesApplied = 0

        for (const suggestion of suggestions) {
          if (suggestion.action === "modify" && suggestion.fixes) {
            const rowIndex = suggestion.rowIndex
            if (rowIndex < updatedData.length) {
              Object.entries(suggestion.fixes).forEach(([column, value]) => {
                updatedData[rowIndex] = { ...updatedData[rowIndex], [column]: value }
                changesApplied++
              })
            }
          } else if (suggestion.action === "remove") {
            updatedData = updatedData.filter((_, index) => index !== suggestion.rowIndex)
            changesApplied++
          }
        }

        setFixedData(updatedData)
        setFixSummary((prev) => ({
          ...prev,
          ai_suggestions: changesApplied,
        }))

        toast.success(`Applied ${changesApplied} AI-suggested changes`)
      } catch (error) {
        console.error("Error applying AI suggestions:", error)
        toast.error("Failed to apply AI suggestions")
      }
    },
    [fixedData, file.data],
  )

  // ============================================================================
  // COMPONENT RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Header with Tutorial and Action Buttons */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold">Validation Rules</h2>
          <p className="text-sm lg:text-base text-gray-600">Configure and run data validation rules</p>

          {/* Performance warning for large datasets */}
          {file.data.length > 10000 && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                <Info className="h-4 w-4 inline mr-1" />
                Large dataset detected ({file.data.length.toLocaleString()} rows). Validation will process the first
                10,000 rows for optimal performance.
              </p>
            </div>
          )}

          {/* Fix summary display */}
          {Object.keys(fixSummary).length > 0 && (
            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">
                <CheckCircle className="h-4 w-4 inline mr-1" />
                Fixes applied:{" "}
                {Object.entries(fixSummary)
                  .map(([rule, count]) => `${rule} (${count})`)
                  .join(", ")}
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTutorial(true)} className="flex-shrink-0">
            <BookOpen className="h-4 w-4 mr-2" />
            Tutorial
          </Button>
          <Button onClick={runValidation} disabled={isValidating} className="flex-shrink-0">
            <Play className="h-4 w-4 mr-2" />
            {isValidating ? "Validating..." : "Run Validation"}
          </Button>

          {/* Add Rule Dialog */}
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
                {/* Rule name input */}
                <div>
                  <Label htmlFor="rule-name">Rule Name</Label>
                  <Input
                    id="rule-name"
                    value={newRule.name || ""}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Age Validation"
                  />
                </div>

                {/* Rule description input */}
                <div>
                  <Label htmlFor="rule-description">Description</Label>
                  <Input
                    id="rule-description"
                    value={newRule.description || ""}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of the rule"
                  />
                </div>

                {/* Rule condition input with examples */}
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

                {/* Severity selection */}
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

                {/* Column selection */}
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

                {/* Dialog action buttons */}
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

      {/* Validation Progress Indicator */}
      {isValidating && (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Running validation...</span>
                <span>{Math.round(validationProgress)}%</span>
              </div>
              <Progress value={validationProgress} className="w-full" />
              <div className="text-xs text-gray-500 text-center">
                Processing {Math.min(file.data.length, 10000).toLocaleString()} rows...
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tutorial Dialog */}
      <Dialog open={showTutorial} onOpenChange={setShowTutorial}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Data Validation Tutorial
            </DialogTitle>
            <DialogDescription>Learn how to effectively validate and clean your data</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {tutorialSteps.map((step, index) => (
              <div key={index} className="border-l-4 border-blue-500 pl-4">
                <h3 className="font-semibold text-lg mb-2">
                  {index + 1}. {step.title}
                </h3>
                <p className="text-gray-600">{step.content}</p>
              </div>
            ))}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">💡 Pro Tips:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Start with built-in validations before creating custom rules</li>
                <li>Use descriptive names for your custom rules</li>
                <li>Test rules on a small dataset first</li>
                <li>Always backup your data before applying fixes</li>
                <li>Review validation results carefully before applying fixes</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fix Options Dialog */}
      <Dialog open={fixDialog.isOpen} onOpenChange={(open) => setFixDialog((prev) => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Choose Fix Option
            </DialogTitle>
            <DialogDescription>
              {fixDialog.result && `How would you like to fix: ${fixDialog.result.description}`}
            </DialogDescription>
          </DialogHeader>
          {fixDialog.result && (
            <div className="space-y-4">
              {/* Warning about affected rows */}
              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  This will affect {fixDialog.result.affectedRows.length} rows in your dataset
                </p>
              </div>

              {/* Fix option selection */}
              <RadioGroup
                value={fixDialog.selectedOption}
                onValueChange={(value) => setFixDialog((prev) => ({ ...prev, selectedOption: value }))}
              >
                {fixDialog.options.map((option) => (
                  <div key={option.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                    <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor={option.id} className="font-medium cursor-pointer">
                        {option.name}
                      </Label>
                      <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                      {option.preview && (
                        <p className="text-xs text-blue-600 mt-1 bg-blue-50 p-1 rounded">Preview: {option.preview}</p>
                      )}
                    </div>
                  </div>
                ))}
              </RadioGroup>

              {/* Dialog action buttons */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setFixDialog({ isOpen: false, result: null, options: [], selectedOption: "" })}
                >
                  Cancel
                </Button>
                <Button onClick={applySelectedFix} disabled={!fixDialog.selectedOption}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Apply Fix
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Main Tab Interface */}
      <Tabs value={validationTab} onValueChange={setValidationTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="rules">Custom Rules ({customRules.length})</TabsTrigger>
          <TabsTrigger value="results">Validation Results ({validationResults.length})</TabsTrigger>
          <TabsTrigger value="fixes">Apply Fixes ({selectedFixes.size})</TabsTrigger>
          <TabsTrigger value="export">Export Clean Data</TabsTrigger>
          <TabsTrigger value="ai-insights">AI Insights</TabsTrigger>
          <TabsTrigger value="interactive-cleaning">Interactive Cleaning</TabsTrigger>
          <TabsTrigger value="ai-tutor">AI Tutor</TabsTrigger>
        </TabsList>

        {/* Custom Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="grid gap-4">
            {customRules.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center h-32">
                  <div className="text-center">
                    <p className="text-gray-500 mb-2">No custom rules defined.</p>
                    <Button onClick={() => setIsAddingRule(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Rule
                    </Button>
                  </div>
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

        {/* Validation Results Tab */}
        <TabsContent value="results" className="space-y-4">
          {validationResults.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <div className="text-center">
                  <p className="text-gray-500 mb-2">No validation results.</p>
                  <Button onClick={runValidation} disabled={isValidating}>
                    <Play className="h-4 w-4 mr-2" />
                    Run Validation
                  </Button>
                </div>
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
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openFixDialog(result)}>
                            <Settings className="h-4 w-4 mr-2" />
                            Choose Fix
                          </Button>
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
                            Add to Queue
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

        {/* Apply Fixes Tab */}
        <TabsContent value="fixes" className="space-y-4">
          {validationResults.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <div className="text-center">
                  <p className="text-gray-500 mb-2">No validation results to fix.</p>
                  <Button onClick={runValidation} disabled={isValidating}>
                    <Play className="h-4 w-4 mr-2" />
                    Run Validation First
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Quick Fix Options</CardTitle>
                  <CardDescription>Select issues and choose how to fix them</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {validationResults.map((result) => (
                      <div key={result.id} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-3">
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
                        {result.canAutoFix && (
                          <Button variant="outline" size="sm" onClick={() => openFixDialog(result)}>
                            <Settings className="h-4 w-4 mr-2" />
                            Choose Fix
                          </Button>
                        )}
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
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Export Clean Data Tab */}
        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Export Clean Dataset</CardTitle>
              <CardDescription>
                Download your cleaned and validated data
                {Object.keys(fixSummary).length > 0 && (
                  <span className="block mt-2 text-green-600">
                    ✓ {Object.values(fixSummary).reduce((sum, count) => sum + count, 0)} fixes have been applied
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dataset summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <h3 className="font-medium mb-2">Dataset Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Original rows:</span>
                      <span>{file.data.length.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Current rows:</span>
                      <span className={fixedData.length < file.data.length ? "text-orange-600" : ""}>
                        {(fixedData.length || file.data.length).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Columns:</span>
                      <span>{fixedData.length > 0 ? Object.keys(fixedData[0]).length : file.headers.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Issues remaining:</span>
                      <span className={validationResults.length === 0 ? "text-green-600" : "text-red-600"}>
                        {validationResults.length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <h3 className="font-medium mb-2">Applied Fixes</h3>
                  {Object.keys(fixSummary).length === 0 ? (
                    <p className="text-sm text-gray-500">No fixes applied yet</p>
                  ) : (
                    <div className="space-y-1 text-sm">
                      {Object.entries(fixSummary).map(([rule, count]) => (
                        <div key={rule} className="flex justify-between">
                          <span className="capitalize">{rule.replace(/_/g, " ")}:</span>
                          <span className="text-green-600">{count} fixed</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Export buttons */}
              <div className="flex gap-4">
                <Button onClick={() => exportCleanedData("csv")} className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download Clean CSV
                </Button>
                <Button onClick={() => exportCleanedData("xlsx")} className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download Clean Excel
                </Button>
              </div>

              {/* Finalize changes button */}
              {Object.keys(fixSummary).length > 0 && (
                <div className="flex justify-center">
                  <Button onClick={finalizeCleanedData} variant="outline">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Apply All Changes to Dataset
                  </Button>
                </div>
              )}

              {/* Export tips */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-medium text-blue-900 mb-2">💡 Export Tips:</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• CSV format is best for importing into other tools</li>
                  <li>• Excel format preserves formatting and is great for sharing</li>
                  <li>• Clean data is ready for analysis and reporting</li>
                  <li>• Keep a backup of your original data</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Insights Tab */}
        <TabsContent value="ai-insights" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    AI-Powered Data Insights
                  </CardTitle>
                  <CardDescription>
                    Get intelligent analysis and recommendations for your data quality issues
                  </CardDescription>
                </div>
                <Button onClick={generateAiInsights} disabled={isGeneratingInsights}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  {isGeneratingInsights ? "Analyzing..." : "Generate AI Insights"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isGeneratingInsights && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">AI is analyzing your data...</p>
                  </div>
                </div>
              )}

              {aiInsights && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg border">
                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-blue-600" />
                      AI Analysis Results
                    </h3>
                    <div className="prose prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{aiInsights}</pre>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(aiInsights)
                        toast.success("AI insights copied to clipboard")
                      }}
                    >
                      Copy Insights
                    </Button>
                    <Button variant="outline" onClick={() => setValidationTab("interactive-cleaning")}>
                      Start Interactive Cleaning
                    </Button>
                  </div>
                </div>
              )}

              {!aiInsights && !isGeneratingInsights && (
                <div className="text-center py-8">
                  <Lightbulb className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">
                    Click "Generate AI Insights" to get intelligent analysis of your data
                  </p>
                  <div className="bg-blue-50 p-4 rounded-lg text-left">
                    <h4 className="font-medium text-blue-900 mb-2">AI will analyze:</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Overall data quality assessment</li>
                      <li>• Priority issues and their business impact</li>
                      <li>• Step-by-step cleaning recommendations</li>
                      <li>• Data relationships and patterns</li>
                      <li>• Best practices for your dataset type</li>
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Interactive Cleaning Tab */}
        <TabsContent value="interactive-cleaning" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cleaning Mode Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Cleaning Mode
                </CardTitle>
                <CardDescription>Choose how you want to clean your data</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup value={aiCleaningMode} onValueChange={(value: any) => setAiCleaningMode(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="row" id="row-mode" />
                    <Label htmlFor="row-mode">Row-wise Cleaning</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="column" id="column-mode" />
                    <Label htmlFor="column-mode">Column-wise Cleaning</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="cell" id="cell-mode" />
                    <Label htmlFor="cell-mode">Cell-wise Cleaning</Label>
                  </div>
                </RadioGroup>

                <div className="mt-4 space-y-2">
                  <Button onClick={generateDataPreview} variant="outline" className="w-full bg-transparent">
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Data
                  </Button>

                  {aiCleaningMode === "row" && (
                    <Button
                      onClick={() => cleanRowsWithAi(Array.from(selectedRowsForAi))}
                      disabled={selectedRowsForAi.size === 0}
                      className="w-full"
                    >
                      <Wand2 className="h-4 w-4 mr-2" />
                      Analyze Selected Rows ({selectedRowsForAi.size})
                    </Button>
                  )}

                  {aiCleaningMode === "column" && (
                    <Button
                      onClick={() => cleanColumnsWithAi(Array.from(selectedColumnsForAi))}
                      disabled={selectedColumnsForAi.size === 0}
                      className="w-full"
                    >
                      <Wand2 className="h-4 w-4 mr-2" />
                      Analyze Selected Columns ({selectedColumnsForAi.size})
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Selection Panel */}
            <Card>
              <CardHeader>
                <CardTitle>Data Selection</CardTitle>
                <CardDescription>
                  Select {aiCleaningMode === "row" ? "rows" : "columns"} for AI analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                {aiCleaningMode === "row" && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Rows (showing first 50)</span>
                      <Button variant="outline" size="sm" onClick={() => setSelectedRowsForAi(new Set())}>
                        Clear
                      </Button>
                    </div>
                    {file.data.slice(0, 50).map((row, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Checkbox
                          id={`row-${index}`}
                          checked={selectedRowsForAi.has(index)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedRowsForAi)
                            if (checked) {
                              newSet.add(index)
                            } else {
                              newSet.delete(index)
                            }
                            setSelectedRowsForAi(newSet)
                          }}
                        />
                        <Label htmlFor={`row-${index}`} className="text-sm">
                          Row {index + 1}: {Object.values(row).slice(0, 3).join(", ")}...
                        </Label>
                      </div>
                    ))}
                  </div>
                )}

                {aiCleaningMode === "column" && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Columns</span>
                      <Button variant="outline" size="sm" onClick={() => setSelectedColumnsForAi(new Set())}>
                        Clear
                      </Button>
                    </div>
                    {file.headers.map((header) => (
                      <div key={header} className="flex items-center space-x-2">
                        <Checkbox
                          id={`col-${header}`}
                          checked={selectedColumnsForAi.has(header)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedColumnsForAi)
                            if (checked) {
                              newSet.add(header)
                            } else {
                              newSet.delete(header)
                            }
                            setSelectedColumnsForAi(newSet)
                          }}
                        />
                        <Label htmlFor={`col-${header}`} className="text-sm">
                          {header} ({file.analysis?.dataTypes?.[header] || "unknown"})
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Suggestions Panel */}
            <Card>
              <CardHeader>
                <CardTitle>AI Suggestions</CardTitle>
                <CardDescription>AI-powered cleaning recommendations</CardDescription>
              </CardHeader>
              <CardContent>
                {aiSuggestions.length === 0 ? (
                  <div className="text-center py-8">
                    <Wand2 className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Select data and click analyze to get AI suggestions</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {aiSuggestions.map((suggestion, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant={suggestion.action === "remove" ? "destructive" : "default"}>
                            {suggestion.action}
                          </Badge>
                          {suggestion.confidence && (
                            <Badge variant="outline">{Math.round(suggestion.confidence * 100)}% confidence</Badge>
                          )}
                        </div>

                        {suggestion.issues && (
                          <div className="mb-2">
                            <p className="text-xs font-medium text-gray-600">Issues:</p>
                            <ul className="text-xs text-gray-500 list-disc list-inside">
                              {suggestion.issues.map((issue: string, i: number) => (
                                <li key={i}>{issue}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {suggestion.reasoning && <p className="text-xs text-gray-600 mb-2">{suggestion.reasoning}</p>}

                        {suggestion.cleaningSteps && (
                          <div className="mb-2">
                            <p className="text-xs font-medium text-gray-600">Steps:</p>
                            <ul className="text-xs text-gray-500 list-disc list-inside">
                              {suggestion.cleaningSteps.map((step: string, i: number) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}

                    <Button onClick={() => applyAiSuggestions(aiSuggestions)} className="w-full mt-4">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Apply AI Suggestions
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Data Preview Dialog */}
          <Dialog open={showDataPreview} onOpenChange={setShowDataPreview}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Interactive Data Preview</DialogTitle>
                <DialogDescription>Review your data and select items for AI-powered cleaning</DialogDescription>
              </DialogHeader>

              {previewData.length > 0 && (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-300 p-2 text-left">
                            <Checkbox
                              checked={selectedRowsForAi.size === previewData.length}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedRowsForAi(new Set(Array.from({ length: previewData.length }, (_, i) => i)))
                                } else {
                                  setSelectedRowsForAi(new Set())
                                }
                              }}
                            />
                          </th>
                          {file.headers.map((header) => (
                            <th key={header} className="border border-gray-300 p-2 text-left">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={selectedColumnsForAi.has(header)}
                                  onCheckedChange={(checked) => {
                                    const newSet = new Set(selectedColumnsForAi)
                                    if (checked) {
                                      newSet.add(header)
                                    } else {
                                      newSet.delete(header)
                                    }
                                    setSelectedColumnsForAi(newSet)
                                  }}
                                />
                                <span className="text-sm font-medium">{header}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row, rowIndex) => (
                          <tr key={rowIndex} className={selectedRowsForAi.has(rowIndex) ? "bg-blue-50" : ""}>
                            <td className="border border-gray-300 p-2">
                              <Checkbox
                                checked={selectedRowsForAi.has(rowIndex)}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(selectedRowsForAi)
                                  if (checked) {
                                    newSet.add(rowIndex)
                                  } else {
                                    newSet.delete(rowIndex)
                                  }
                                  setSelectedRowsForAi(newSet)
                                }}
                              />
                            </td>
                            {file.headers.map((header) => (
                              <td
                                key={header}
                                className={`border border-gray-300 p-2 text-sm ${
                                  selectedColumnsForAi.has(header) ? "bg-yellow-50" : ""
                                }`}
                              >
                                {row[header] === null || row[header] === undefined || row[header] === "" ? (
                                  <span className="text-gray-400 italic">null</span>
                                ) : (
                                  String(row[header]).substring(0, 50) + (String(row[header]).length > 50 ? "..." : "")
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      Selected: {selectedRowsForAi.size} rows, {selectedColumnsForAi.size} columns
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setShowDataPreview(false)}>
                        Close Preview
                      </Button>
                      <Button
                        onClick={() => {
                          if (aiCleaningMode === "row") {
                            cleanRowsWithAi(Array.from(selectedRowsForAi))
                          } else {
                            cleanColumnsWithAi(Array.from(selectedColumnsForAi))
                          }
                          setShowDataPreview(false)
                        }}
                      >
                        Analyze Selected Data
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* AI Tutor Tab */}
        <TabsContent value="ai-tutor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                AI Data Validation Tutor
              </CardTitle>
              <CardDescription>
                Ask questions about data validation, cleaning techniques, and best practices
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Chat Interface */}
              <div className="space-y-4">
                {/* Chat Messages */}
                <div className="h-96 overflow-y-auto border rounded-lg p-4 bg-gray-50">
                  {tutorMessages.length === 0 ? (
                    <div className="text-center py-8">
                      <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500 mb-4">Ask me anything about data validation!</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {[
                          "How do I handle missing values?",
                          "What are the best validation rules for email addresses?",
                          "How can I detect outliers in my data?",
                          "What's the difference between data cleaning and validation?",
                        ].map((question, index) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            onClick={() => setUserQuestion(question)}
                            className="text-left"
                          >
                            {question}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tutorMessages.map((message, index) => (
                        <div
                          key={index}
                          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] p-3 rounded-lg ${
                              message.role === "user" ? "bg-blue-600 text-white" : "bg-white border shadow-sm"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {message.role === "assistant" && (
                                <Lightbulb className="h-4 w-4 text-blue-600 mt-1 flex-shrink-0" />
                              )}
                              <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {isAskingAi && (
                        <div className="flex justify-start">
                          <div className="bg-white border shadow-sm p-3 rounded-lg">
                            <div className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                              <span className="text-sm text-gray-600">AI is thinking...</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Input Area */}
                <div className="flex gap-2">
                  <Input
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    placeholder="Ask about data validation, cleaning techniques, best practices..."
                    onKeyPress={(e) => e.key === "Enter" && askAiTutor()}
                    disabled={isAskingAi}
                  />
                  <Button onClick={askAiTutor} disabled={!userQuestion.trim() || isAskingAi}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUserQuestion("Explain my current data quality issues")}
                  >
                    Explain My Issues
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUserQuestion("What validation rules should I add?")}
                  >
                    Suggest Rules
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUserQuestion("How can I improve my data quality score?")}
                  >
                    Improve Quality
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setTutorMessages([])}>
                    Clear Chat
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Learning Resources */}
          <Card>
            <CardHeader>
              <CardTitle>Learning Resources</CardTitle>
              <CardDescription>Expand your data validation knowledge</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    title: "Data Quality Fundamentals",
                    description: "Learn the basics of data quality assessment and improvement",
                    topics: ["Completeness", "Accuracy", "Consistency", "Validity"],
                  },
                  {
                    title: "Validation Techniques",
                    description: "Master different approaches to data validation",
                    topics: ["Rule-based", "Statistical", "Pattern matching", "Cross-field"],
                  },
                  {
                    title: "Cleaning Strategies",
                    description: "Effective methods for cleaning and standardizing data",
                    topics: ["Deduplication", "Standardization", "Outlier handling", "Missing values"],
                  },
                ].map((resource, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">{resource.title}</h3>
                    <p className="text-sm text-gray-600 mb-3">{resource.description}</p>
                    <div className="space-y-1">
                      {resource.topics.map((topic, topicIndex) => (
                        <Button
                          key={topicIndex}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-left h-auto p-2"
                          onClick={() => setUserQuestion(`Tell me about ${topic.toLowerCase()} in data validation`)}
                        >
                          <span className="text-xs">• {topic}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
