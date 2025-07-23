"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useState } from "react"
import { Brain } from "lucide-react"
import { AiDataAssistant } from "./ai-data-assistant"

interface ValidationRulesProps {
  file: any
  onFileUpdate: (updatedFile: any) => void
}

const columnNames = ["Column Name", "Data Type", "Required", "Unique", "Valid Values", "Description"]

export function ValidationRules({ file, onFileUpdate }: ValidationRulesProps) {
  const [selectedColumn, setSelectedColumn] = useState(file?.columns?.[0]?.name)

  const selectedColumnData = file?.columns?.find((column: any) => column.name === selectedColumn)

  return (
    <Tabs defaultValue="rules" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="rules">Rules</TabsTrigger>
        <TabsTrigger value="data-types">Data Types</TabsTrigger>
        <TabsTrigger value="column-details">Column Details</TabsTrigger>
        <TabsTrigger value="ai-assistant" className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          AI Assistant
        </TabsTrigger>
      </TabsList>
      <TabsContent value="rules">
        <Card>
          <CardHeader>
            <CardTitle>Validation Rules</CardTitle>
            <CardDescription>Define validation rules for your data.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="column">Column</Label>
                <Select value={selectedColumn} onValueChange={(value) => setSelectedColumn(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a column" />
                  </SelectTrigger>
                  <SelectContent>
                    {file?.columns?.map((column: any) => (
                      <SelectItem key={column.name} value={column.name}>
                        {column.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dataType">Data Type</Label>
                <Input type="text" id="dataType" value={selectedColumnData?.dataType || ""} disabled />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="required">Required</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unique">Unique</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="validValues">Valid Values</Label>
                <Input type="text" id="validValues" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" />
              </div>
              <Button>Save</Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="data-types">
        <Card>
          <CardHeader>
            <CardTitle>Data Types</CardTitle>
            <CardDescription>View and manage data types.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>A list of your data types.</TableCaption>
              <TableHeader>
                {columnNames.map((columnName) => (
                  <TableHead key={columnName}>{columnName}</TableHead>
                ))}
              </TableHeader>
              <TableBody>
                {file?.columns?.map((column: any) => (
                  <TableRow key={column.name}>
                    <TableCell className="font-medium">{column.name}</TableCell>
                    <TableCell>{column.dataType}</TableCell>
                    <TableCell>
                      <Badge variant="outline">Yes</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">No</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">Email</Badge>
                    </TableCell>
                    <TableCell>User's email address</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="column-details">
        <Card>
          <CardHeader>
            <CardTitle>Column Details</CardTitle>
            <CardDescription>View details for each column.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {file?.columns?.map((column: any) => (
                <div key={column.name} className="space-y-2">
                  <h3 className="text-lg font-semibold">{column.name}</h3>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Data Type</Label>
                      <Input type="text" value={column.dataType || "N/A"} disabled />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Input type="text" value={column.description || "N/A"} disabled />
                    </div>
                    <div>
                      <Label>Required</Label>
                      <Input type="text" value={column.required ? "Yes" : "No"} disabled />
                    </div>
                    <div>
                      <Label>Unique</Label>
                      <Input type="text" value={column.unique ? "Yes" : "No"} disabled />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="ai-assistant" className="space-y-6">
        <AiDataAssistant file={file} onFileUpdate={onFileUpdate} />
      </TabsContent>
    </Tabs>
  )
}
