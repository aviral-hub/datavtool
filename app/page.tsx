"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileUpload } from "@/components/file-upload"
import { DataAnalysis } from "@/components/data-analysis"
import { ValidationRules } from "@/components/validation-rules"
import { FileHistory } from "@/components/file-history"
import { TrendDashboard } from "@/components/trend-dashboard"
import { ReportGenerator } from "@/components/report-generator"
import { CreditsPopup } from "@/components/credits-popup"
import { MobileNavigation } from "@/components/mobile-navigation"
import { Upload, BarChart3, Settings, History, TrendingUp, FileText } from "lucide-react"
import { toast, Toaster } from "sonner"

export interface FileData {
  id: string
  name: string
  size: number
  uploadDate: Date
  data: any[]
  headers: string[]
  analysis?: DataAnalysisResult
  validationResults?: ValidationResult[]
  customRules?: CustomRule[]
  efficiency?: EfficiencyMetrics
}

export interface DataAnalysisResult {
  totalRows: number
  totalColumns: number
  nullValues: Record<string, number>
  duplicates: number
  dataTypes: Record<string, string>
  outliers: Record<string, OutlierInfo[]>
  statistics: Record<string, any>
  contextualIssues: ContextualIssue[]
  crossFieldIssues: CrossFieldIssue[]
  qualityScore: number
}

export interface OutlierInfo {
  rowIndex: number
  value: any
  zScore: number
}

export interface ValidationResult {
  id: string
  rule: string
  severity: "low" | "medium" | "high" | "critical"
  affectedRows: number[]
  description: string
  suggestion: string
  sqlFix?: string
  pythonFix?: string
  canAutoFix: boolean
}

export interface ContextualIssue {
  column: string
  row: number
  value: any
  issue: string
  severity: "low" | "medium" | "high" | "critical"
  suggestion: string
}

export interface CrossFieldIssue {
  columns: string[]
  row: number
  issue: string
  severity: "low" | "medium" | "high" | "critical"
  suggestion: string
}

export interface EfficiencyMetrics {
  processingTime: number
  memoryUsage: number
  validationSpeed: number
  issuesDetected: number
  fixesApplied: number
  dataQualityImprovement: number
}

export interface CustomRule {
  id: string
  name: string
  description: string
  condition: string
  severity: "low" | "medium" | "high" | "critical"
  columns: string[]
  active: boolean
}

interface HistoryState {
  activeTab: string
  activeFileId: string | null
  timestamp: number
}

const STORAGE_KEY = "dataValidationTool_fileHistory"
const STORAGE_VERSION = "1.0"

export default function DataValidationTool() {
  const [files, setFiles] = useState<FileData[]>([])
  const [activeFile, setActiveFile] = useState<FileData | null>(null)
  const [activeTab, setActiveTab] = useState("upload")
  const [isLoading, setIsLoading] = useState(true)

  // Navigation history management
  const [navigationHistory, setNavigationHistory] = useState<HistoryState[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  // Undo/Redo state management
  const [undoStack, setUndoStack] = useState<{ files: FileData[]; activeFileId: string | null }[]>([])
  const [redoStack, setRedoStack] = useState<{ files: FileData[]; activeFileId: string | null }[]>([])

  // Save current state to undo stack
  const saveToUndoStack = useCallback(() => {
    // Create a deep copy of files to ensure all nested objects are properly copied
    const filesCopy = files.map((file) => ({
      ...file,
      data: [...file.data],
      validationResults: file.validationResults ? [...file.validationResults] : undefined,
      customRules: file.customRules ? [...file.customRules] : undefined,
    }))

    setUndoStack((prev) => [
      ...prev.slice(-9), // Keep only last 10 states
      { files: filesCopy, activeFileId: activeFile?.id || null },
    ])
    setRedoStack([]) // Clear redo stack when new action is performed
  }, [files, activeFile])

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.tab) {
        setActiveTab(event.state.tab)
        if (event.state.fileId) {
          const file = files.find((f) => f.id === event.state.fileId)
          if (file) {
            setActiveFile(file)
          }
        }
      }
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [files])

  // Update browser history when tab or file changes
  useEffect(() => {
    const state = {
      tab: activeTab,
      fileId: activeFile?.id || null,
      timestamp: Date.now(),
    }

    // Update browser history
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", activeTab)
      if (activeFile) {
        url.searchParams.set("file", activeFile.id)
      } else {
        url.searchParams.delete("file")
      }

      window.history.pushState(state, "", url.toString())
    }

    // Update navigation history
    setNavigationHistory((prev) => {
      const newHistory = [...prev, state]
      return newHistory.slice(-20) // Keep only last 20 states
    })
    setHistoryIndex((prev) => prev + 1)
  }, [activeTab, activeFile])

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const previousState = navigationHistory[historyIndex - 1]
      if (previousState) {
        setActiveTab(previousState.activeTab)
        if (previousState.activeFileId) {
          const file = files.find((f) => f.id === previousState.activeFileId)
          if (file) {
            setActiveFile(file)
          }
        } else {
          setActiveFile(null)
        }
        setHistoryIndex((prev) => prev - 1)
        window.history.back()
      }
    }
  }, [historyIndex, navigationHistory, files])

  const goForward = useCallback(() => {
    if (historyIndex < navigationHistory.length - 1) {
      const nextState = navigationHistory[historyIndex + 1]
      if (nextState) {
        setActiveTab(nextState.activeTab)
        if (nextState.activeFileId) {
          const file = files.find((f) => f.id === nextState.activeFileId)
          if (file) {
            setActiveFile(file)
          }
        } else {
          setActiveFile(null)
        }
        setHistoryIndex((prev) => prev + 1)
        window.history.forward()
      }
    }
  }, [historyIndex, navigationHistory, files])

  const handleUndo = useCallback(() => {
    if (undoStack.length > 0) {
      const currentState = { files, activeFileId: activeFile?.id || null }
      const previousState = undoStack[undoStack.length - 1]

      setRedoStack((prev) => [...prev, currentState])
      setUndoStack((prev) => prev.slice(0, -1))

      setFiles(previousState.files)
      if (previousState.activeFileId) {
        const file = previousState.files.find((f) => f.id === previousState.activeFileId)
        setActiveFile(file || null)
      } else {
        setActiveFile(null)
      }

      toast.success("Action undone")
    }
  }, [undoStack, files, activeFile])

  const handleRedo = useCallback(() => {
    if (redoStack.length > 0) {
      const currentState = { files, activeFileId: activeFile?.id || null }
      const nextState = redoStack[redoStack.length - 1]

      setUndoStack((prev) => [...prev, currentState])
      setRedoStack((prev) => prev.slice(0, -1))

      setFiles(nextState.files)
      if (nextState.activeFileId) {
        const file = nextState.files.find((f) => f.id === nextState.activeFileId)
        setActiveFile(file || null)
      } else {
        setActiveFile(null)
      }

      toast.success("Action redone")
    }
  }, [redoStack, files, activeFile])

  const persistFileChanges = useCallback(
    (updatedFile: FileData) => {
      saveToUndoStack()

      setFiles((prev) => prev.map((f) => (f.id === updatedFile.id ? updatedFile : f)))

      if (activeFile?.id === updatedFile.id) {
        setActiveFile(updatedFile)
      }

      // Immediately save to localStorage to prevent data loss
      try {
        const currentData = localStorage.getItem(STORAGE_KEY)
        if (currentData) {
          const parsedData = JSON.parse(currentData)
          const updatedFiles = parsedData.files.map((f: any) =>
            f.id === updatedFile.id
              ? {
                  ...updatedFile,
                  uploadDate: updatedFile.uploadDate.toISOString(), // Convert Date to string for storage
                }
              : f,
          )

          const dataToSave = {
            ...parsedData,
            files: updatedFiles,
            lastUpdated: new Date().toISOString(),
          }

          localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
        }
      } catch (error) {
        console.error("Error persisting file changes:", error)
        // Continue execution even if localStorage fails
      }
    },
    [activeFile, saveToUndoStack],
  )

  const updateFile = (updatedFile: FileData) => {
    persistFileChanges(updatedFile)
  }

  const deleteFile = (fileId: string) => {
    const fileToDelete = files.find((f) => f.id === fileId)
    saveToUndoStack()
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
    if (activeFile?.id === fileId) {
      const remainingFiles = files.filter((f) => f.id !== fileId)
      setActiveFile(remainingFiles.length > 0 ? remainingFiles[0] : null)
    }
    if (fileToDelete) {
      toast.success(`File "${fileToDelete.name}" deleted successfully`)
    }
  }

  const handleStorageQuotaExceeded = () => {
    if (files.length > 5) {
      const sortedFiles = [...files].sort((a, b) => b.uploadDate.getTime() - a.uploadDate.getTime())
      const filesToKeep = sortedFiles.slice(0, 5)
      setFiles(filesToKeep)
      toast.info(`Removed ${files.length - 5} oldest files to free up storage space`)
    }
  }

  const clearAllHistory = () => {
    try {
      saveToUndoStack()
      localStorage.removeItem(STORAGE_KEY)
      setFiles([])
      setActiveFile(null)
      toast.success("All file history cleared")
    } catch (error) {
      console.error("Error clearing storage:", error)
      toast.error("Error clearing storage")
    }
  }

  const exportStorageData = () => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY)
      if (savedData) {
        const blob = new Blob([savedData], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `data-validation-history-${new Date().toISOString().split("T")[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success("Storage data exported successfully")
      } else {
        toast.info("No data to export")
      }
    } catch (error) {
      console.error("Error exporting storage data:", error)
      toast.error("Error exporting storage data")
    }
  }

  const importStorageData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string)
        if (importedData.version === STORAGE_VERSION && importedData.files) {
          saveToUndoStack()
          const parsedFiles = importedData.files.map((file: any) => ({
            ...file,
            uploadDate: new Date(file.uploadDate),
          }))
          setFiles(parsedFiles)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(importedData))
          toast.success(`Imported ${parsedFiles.length} files successfully`)
        } else {
          toast.error("Invalid or incompatible backup file")
        }
      } catch (error) {
        console.error("Error importing storage data:", error)
        toast.error("Error importing backup file")
      }
    }
    reader.readAsText(file)
  }

  const handleFileUpload = (newFile: FileData) => {
    saveToUndoStack()
    setFiles((prev) => [newFile, ...prev])
    setActiveFile(newFile)
    setActiveTab("analysis")
    toast.success(`File "${newFile.name}" uploaded successfully!`)
  }

  useEffect(() => {
    const loadFilesFromStorage = () => {
      try {
        const savedData = localStorage.getItem(STORAGE_KEY)
        if (savedData) {
          const parsedData = JSON.parse(savedData)

          if (parsedData.version === STORAGE_VERSION && parsedData.files) {
            const parsedFiles = parsedData.files.map((file: any) => ({
              ...file,
              uploadDate: new Date(file.uploadDate),
            }))
            setFiles(parsedFiles)

            // Check URL parameters for initial state
            if (typeof window !== "undefined") {
              const urlParams = new URLSearchParams(window.location.search)
              const tabParam = urlParams.get("tab")
              const fileParam = urlParams.get("file")

              if (tabParam) {
                setActiveTab(tabParam)
              }

              if (fileParam) {
                const file = parsedFiles.find((f: FileData) => f.id === fileParam)
                if (file) {
                  setActiveFile(file)
                }
              } else if (parsedFiles.length > 0) {
                setActiveFile(parsedFiles[0])
              }
            }
          } else {
            console.warn("Storage version mismatch or invalid data, clearing storage")
            localStorage.removeItem(STORAGE_KEY)
          }
        }
      } catch (error) {
        console.error("Error loading files from localStorage:", error)
        toast.error("Error loading saved files")
        localStorage.removeItem(STORAGE_KEY)
      } finally {
        setIsLoading(false)
      }
    }

    loadFilesFromStorage()
  }, [])

  useEffect(() => {
    const saveFilesToStorage = () => {
      if (!isLoading && files.length >= 0) {
        try {
          const dataToSave = {
            version: STORAGE_VERSION,
            lastUpdated: new Date().toISOString(),
            files: files,
            totalFiles: files.length,
            totalSize: files.reduce((sum, file) => sum + file.size, 0),
          }

          const serializedData = JSON.stringify(dataToSave)

          if (serializedData.length > 4 * 1024 * 1024) {
            toast.warning("Storage approaching limit. Consider clearing old files.")
          }

          localStorage.setItem(STORAGE_KEY, serializedData)
        } catch (error) {
          if (error.name === "QuotaExceededError") {
            toast.error("Storage quota exceeded. Please clear some files.")
            handleStorageQuotaExceeded()
          } else {
            console.error("Error saving files to localStorage:", error)
            toast.error("Error saving files")
          }
        }
      }
    }

    saveFilesToStorage()
  }, [files, isLoading])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Toaster position="top-center" />

      {/* Mobile Navigation */}
      <MobileNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < navigationHistory.length - 1}
        onGoBack={goBack}
        onGoForward={goForward}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        hasActiveFile={!!activeFile}
        filesCount={files.length}
      />

      <div className="max-w-7xl mx-auto p-4 pb-20 lg:pb-4">
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl lg:text-4xl font-bold text-gray-900 mb-2">Data Validation & Analysis Tool</h1>
          <p className="text-sm lg:text-lg text-gray-600">
            Upload, analyze, validate, and remediate your data with AI-powered insights
          </p>
          {files.length > 0 && (
            <div className="mt-3 lg:mt-4 flex flex-wrap gap-2 lg:gap-4 text-xs lg:text-sm text-gray-600">
              <span>📁 {files.length} files uploaded</span>
              <span>
                📊 {files.reduce((sum, f) => sum + (f.analysis?.totalRows || 0), 0).toLocaleString()} total rows
                processed
              </span>
              <span className="hidden sm:inline">
                ⚡ {files.filter((f) => f.analysis?.qualityScore && f.analysis.qualityScore >= 80).length} high-quality
                files
              </span>
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 lg:space-y-6">
          {/* Desktop Tab List */}
          <TabsList className="hidden lg:grid w-full grid-cols-6 lg:w-auto lg:grid-cols-6">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex items-center gap-2" disabled={!activeFile}>
              <BarChart3 className="h-4 w-4" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="validation" className="flex items-center gap-2" disabled={!activeFile}>
              <Settings className="h-4 w-4" />
              Validation
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="trends" className="flex items-center gap-2" disabled={files.length === 0}>
              <TrendingUp className="h-4 w-4" />
              Trends
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2" disabled={!activeFile}>
              <FileText className="h-4 w-4" />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4 lg:space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg lg:text-xl">Upload Data File</CardTitle>
                <CardDescription className="text-sm lg:text-base">
                  Upload CSV or Excel files for comprehensive data analysis and validation. Supported formats: .csv,
                  .xlsx, .xls
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUpload onFileUpload={handleFileUpload} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4 lg:space-y-6">
            {activeFile ? (
              <DataAnalysis file={activeFile} onFileUpdate={updateFile} />
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center h-48 lg:h-64">
                  <div className="text-center">
                    <BarChart3 className="h-8 w-8 lg:h-12 lg:w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 text-sm lg:text-base">Please upload a file to view analysis</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="validation" className="space-y-4 lg:space-y-6">
            {activeFile ? (
              <ValidationRules file={activeFile} onFileUpdate={updateFile} />
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center h-48 lg:h-64">
                  <div className="text-center">
                    <Settings className="h-8 w-8 lg:h-12 lg:w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 text-sm lg:text-base">
                      Please upload a file to configure validation rules
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4 lg:space-y-6">
            <FileHistory
              files={files}
              onFileSelect={(file) => {
                setActiveFile(file)
                setActiveTab("analysis")
              }}
              onFileDelete={deleteFile}
              onClearAllHistory={clearAllHistory}
              onExportStorage={exportStorageData}
              onImportStorage={importStorageData}
            />
          </TabsContent>

          <TabsContent value="trends" className="space-y-4 lg:space-y-6">
            <TrendDashboard files={files} />
          </TabsContent>

          <TabsContent value="reports" className="space-y-4 lg:space-y-6">
            {activeFile ? (
              <ReportGenerator file={activeFile} />
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center h-48 lg:h-64">
                  <div className="text-center">
                    <FileText className="h-8 w-8 lg:h-12 lg:w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 text-sm lg:text-base">Please select a file to generate reports</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Credits Popup */}
      <CreditsPopup />
    </div>
  )
}
