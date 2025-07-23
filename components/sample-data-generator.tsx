"use client"

import type React from "react"

import { useState } from "react"
import { Users, ShoppingCart, Briefcase, GraduationCap } from "lucide-react"
import type { FileData, DataAnalysisResult } from "@/app/page"

// ============================================================================
// COMPONENT PROPS AND INTERFACES
// ============================================================================

/**
 * Props for the SampleDataGenerator component
 */
interface SampleDataGeneratorProps {
  onSampleDataGenerated: (file: FileData) => void // Callback when sample data is generated
}

/**
 * Structure for sample dataset definitions
 * Each sample dataset has metadata and generation logic
 */
interface SampleDataset {
  id: string // Unique identifier
  name: string // Display name
  description: string // What this dataset represents
  icon: React.ComponentType<any> // Icon component
  difficulty: "Beginner" | "Intermediate" | "Advanced" // Complexity level
  learningObjectives: string[] // What users will learn
  commonIssues: string[] // Types of data quality issues included
  rowCount: number // Number of rows to generate
  generateData: () => any[] // Function to generate the actual data
  headers: string[] // Column headers
}

/**
 * SampleDataGenerator Component
 *
 * This component provides educational sample datasets for users to practice with.
 * Each dataset is designed to demonstrate specific data quality issues and validation scenarios.
 *
 * Features:
 * - Multiple realistic datasets (Customer, Sales, Employee, Student)
 * - Intentionally includes common data quality issues
 * - Educational content with learning objectives
 * - Different difficulty levels for progressive learning
 */
export function SampleDataGenerator({ onSampleDataGenerated }: SampleDataGeneratorProps) {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null)

  // ============================================================================
  // SAMPLE DATA GENERATION FUNCTIONS
  // ============================================================================
  
  /**
   * Generate realistic customer data with intentional quality issues
   * Issues included: Invalid emails, missing phone numbers, inconsistent formats
   */
  const generateCustomerData = (): any[] => {
    const firstNames = ["John", "Jane", "Mike", "Sarah", "David", "Lisa", "Tom", "Anna", "Chris", "Emma", "", "Bob"]
    const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "", "Wilson"]
    const domains = ["gmail.com", "yahoo.com", "hotmail.com", "company.com", "invalid", "@broken", "test"]
    const cities = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "", "Miami", "Seattle"]
    const states = ["NY", "CA", "IL", "TX", "AZ", "FL", "WA", "", "INVALID"]

    return Array.from({ length: 500 }, (_, i) => {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)]
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)]
      const domain = domains[Math.floor(Math.random() * domains.length)]
      
      // Intentionally create some invalid emails
      let email = ""
      if (firstName && lastName && domain) {
        if (domain === "invalid") {
          email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@` // Missing domain
        } else if (domain === "@broken") {
          email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}broken.com` // Missing @
        } else {
          email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`
        }
      }

      // Generate phone numbers with various formats and some invalid ones
      let phone = ""
      const phoneFormats = [
        () => `(${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
        () => `${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
        () => `${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        () => "123", // Invalid - too short
        () => "", // Missing
      ]
      phone = phoneFormats[Math.floor(Math.random() * phoneFormats.length)]()

      // Generate ages with some unrealistic values
      let age = Math.floor(Math.random() * 80) + 18
      if (Math.random() < 0.05) age = -5 // Some negative ages
      if (Math.random() < 0.03) age = 150 // Some unrealistic ages

      return {
        customer_id: `CUST${String(i + 1).padStart(4, '0')}`,
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: phone,
        age: age,
        city: cities[Math.floor(Math.random() * cities.length)],
        state: states[Math.floor(Math.random() * states.length)],
        registration_date: new Date(2020 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
        status: Math.random() > 0.1 ? (Math.random() > 0.5 ? "Active" : "Inactive") : "", // Some missing status
      }
    })
  }

  /**
   * Generate sales transaction data with various data quality issues
   * Issues included: Negative amounts, future dates, missing product info
   */
  const generateSalesData = (): any[] => {
    const products = ["Laptop", "Mouse", "Keyboard", "Monitor", "Headphones", "", "Tablet", "Phone", "Charger"]
    const salespeople = ["Alice Johnson", "Bob Smith", "Carol Davis", "", "David Wilson", "Eve Brown"]
    const regions = ["North", "South", "East", "West", "", "Central"]

    return Array.from({ length: 800 }, (_, i) => {
      // Generate amounts with some negative values (returns/errors)
      let amount = Math.floor(Math.random() * 2000) + 50
      if (Math.random() < 0.08) amount = -amount // Some negative amounts
      if (Math.random() < 0.03) amount = 0 // Some zero amounts

      // Generate dates with some in the future (data entry errors)
      let saleDate = new Date(2023, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1)
      if (Math.random() < 0.05) {
        saleDate = new Date(2025, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1) // Future dates
      }

      // Generate quantities with some unrealistic values
      let quantity = Math.floor(Math.random() * 10) + 1
      if (Math.random() < 0.04) quantity = 0 // Zero quantity
      if (Math.random() < 0.02) quantity = -2 // Negative quantity

      return {
        transaction_id: `TXN${String(i + 1).padStart(5, '0')}`,
        product_name: products[Math.floor(Math.random() * products.length)],
        quantity: quantity,
        unit_price: Math.floor(Math.random() * 500) + 10,
        total_amount: amount,
        sale_date: saleDate.toISOString().split('T')[0],
        salesperson: salespeople[Math.floor(Math.random() * salespeople.length)],
        region: regions[Math.floor(Math.random() * regions.length)],
        customer_id: `CUST${String(Math.floor(Math.random() * 500) + 1).padStart(4, '0')}`,
        payment_method: Math.random() > 0.1 ? (Math.random() > 0.5 ? "Credit Card" : "Cash") : "", // Some missing
      }
    })
  }

  /**
   * Generate employee data with HR-related data quality issues
   * Issues included: Salary inconsistencies, invalid hire dates, missing departments
   */
  const generateEmployeeData = (): any[] => {
    const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance", "", "Operations", "Support"]
    const positions = ["Manager", "Senior", "Junior", "Lead", "Director", "", "Analyst", "Specialist"]
    const firstNames = ["Alex", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "", "Avery", "Quinn"]
    const lastNames = ["Anderson", "Thompson", "Martinez", "Robinson", "", "Clark", "Rodriguez", "Lewis"]

    return Array.from({ length: 300 }, (_, i) => {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)]
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)]
      
      // Generate hire dates with some inconsistencies
      let hireDate = new Date(2015 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1)
      if (Math.random() < 0.03) {
        hireDate = new Date(2025, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1) // Future hire dates
      }

      // Generate salaries with some unrealistic values
      let salary = Math.floor(Math.random() * 100000) + 30000
      if (Math.random() < 0.05) salary = -salary // Negative salaries
      if (Math.random() < 0.02) salary = 0 // Zero salary
      if (Math.random() < 0.01) salary = 10000000 // Unrealistically high

      // Generate ages with some issues
      let age = Math.floor(Math.random() * 40) + 22
      if (Math.random() < 0.03) age = 16 // Too young to work full-time
      if (Math.random() < 0.02) age = 80 // Very old

      // Generate years of experience with some inconsistencies
      const currentYear = new Date().getFullYear()
      const yearsAtCompany = currentYear - hireDate.getFullYear()
      let totalExperience = yearsAtCompany + Math.floor(Math.random() * 10)
      if (Math.random() < 0.05) totalExperience = yearsAtCompany - 2 // Less experience than time at company

      return {
        employee_id: `EMP${String(i + 1).padStart(4, '0')}`,
        first_name: firstName,
        last_name: lastName,
        email: firstName && lastName ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com` : "",
        department: departments[Math.floor(Math.random() * departments.length)],
        position: positions[Math.floor(Math.random() * positions.length)],
        hire_date: hireDate.toISOString().split('T')[0],
        salary: salary,
        age: age,
        years_experience: totalExperience,
        status: Math.random() > 0.05 ? "Active" : (Math.random() > 0.5 ? "Inactive" : "On Leave"),
      }
    })
  }

  /**
   * Generate student academic data with educational data quality issues
   * Issues included: Invalid GPAs, inconsistent grade formats, missing enrollment data
   */
  const generateStudentData = (): any[] => {
    const majors = ["Computer Science", "Business", "Engineering", "Psychology", "Biology", "", "Mathematics", "Art"]
    const grades = ["A", "B", "C", "D", "F", "", "A+", "B-", "PASS", "FAIL", "85", "92", "INVALID"]
    const firstNames = ["Emma", "Liam", "Olivia", "Noah", "Ava", "William", "", "Sophia", "James", "Isabella"]
    const lastNames = ["Johnson", "Williams", "Brown", "Jones", "Garcia", "", "Miller", "Davis", "Rodriguez"]

    return Array.from({ length: 600 }, (_, i) => {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)]
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)]
      
      // Generate GPAs with some invalid values
      let gpa = Math.round((Math.random() * 4) * 100) / 100
      if (Math.random() < 0.05) gpa = 5.2 // Invalid - too high
      if (Math.random() < 0.03) gpa = -1.5 // Invalid - negative
      if (Math.random() < 0.02) gpa = null // Missing

      // Generate enrollment dates with some issues
      let enrollmentDate = new Date(2020 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1)
      if (Math.random() < 0.04) {
        enrollmentDate = new Date(2025, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1) // Future enrollment
      }

      // Generate graduation dates with some inconsistencies
      let graduationDate = new Date(enrollmentDate.getFullYear() + 4, 5, 15) // 4 years later
      if (Math.random() < 0.06) {
        graduationDate = new Date(enrollmentDate.getFullYear() - 1, 5, 15) // Graduation before enrollment
      }

      // Generate ages with some unrealistic values
      let age = Math.floor(Math.random() * 10) + 18
      if (Math.random() < 0.03) age = 12 // Too young
      if (Math.random() < 0.02) age = 65 // Unusually old for undergraduate

      return {
        student_id: `STU${String(i + 1).padStart(5, '0')}`,
        first_name: firstName,
        last_name: lastName,
        email: firstName && lastName ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@university.edu` : "",
        major: majors[Math.floor(Math.random() * majors.length)],
        gpa: gpa,
        enrollment_date: enrollmentDate.toISOString().split('T')[0],
        expected_graduation: graduationDate.toISOString().split('T')[0],
        age: age,
        credits_completed: Math.floor(Math.random() * 120),
        current_grade: grades[Math.floor(Math.random() * grades.length)],
        status: Math.random() > 0.08 ? (Math.random() > 0.7 ? "Enrolled" : "Graduated") : "", // Some missing
      }
    })
  }

  // ============================================================================
  // SAMPLE DATASET DEFINITIONS
  // ============================================================================
  
  /**
   * Array of available sample datasets with their configurations
   * Each dataset is designed to teach specific data validation concepts
   */
  const sampleDatasets: SampleDataset[] = [
    {
      id: "customers",
      name: "Customer Database",
      description: "Customer information with contact details and demographics",
      icon: Users,
      difficulty: "Beginner",
      rowCount: 500,
      headers: ["customer_id", "first_name", "last_name", "email", "phone", "age", "city", "state", "registration_date", "status"],
      learningObjectives: [
        "Identify and fix invalid email formats",
        "Handle missing contact information",
        "Validate age ranges and demographic data",
        "Clean inconsistent phone number formats",
      ],
      commonIssues: [
        "Invalid email addresses (missing @ or domain)",
        "Missing first/last names",
        "Inconsistent phone number formats",
        "Unrealistic age values (negative or too high)",
        "Empty city/state fields",
      ],
      generateData: generateCustomerData,
    },
    {
      id: "sales",
      name: "Sales Transactions",
      description: "Sales data with products, amounts, and transaction details",
      icon: ShoppingCart,
      difficulty: "Intermediate",
      rowCount: 800,
      headers: ["transaction_id", "product_name", "quantity", "unit_price", "total_amount", "sale_date", "salesperson", "region", "customer_id", "payment_method"],
      learningObjectives: [
        "Detect negative transaction amounts",
        "Identify future-dated transactions",
        "Validate quantity and pricing relationships",
        "Handle missing product information",
      ],
      commonIssues: [
        "Negative transaction amounts (returns vs errors)",
        "Future sale dates (data entry errors)",
        "Zero or negative quantities",
        "Missing product names",
        "Inconsistent salesperson names",
      ],
      generateData: generateSalesData,
    },
    {
      id: "employees",
      name: "Employee Records",
      description: "HR data with salaries, departments, and employment history",
      icon: Briefcase,
      difficulty: "Advanced",
      rowCount: 300,
      headers: ["employee_id", "first_name", "last_name", "email", "department", "position", "hire_date", "salary", "age", "years_experience", "status"],
      learningObjectives: [
        "Validate salary ranges and consistency",
        "Check hire date vs experience relationships",
        "Identify unrealistic age/experience combinations",
        "Handle missing department assignments",
      ],
      commonIssues: [
        "Negative or zero salaries",
        "Future hire dates",
        "Experience less than time at company",
        "Unrealistic age values",
        "Missing department information",
      ],
      generateData: generateEmployeeData,
    },
    {
      id: "students",
      name: "Student Academic Records",
      description: "Educational data with grades, GPAs, and enrollment information",
      icon: GraduationCap,
      difficulty: "Advanced",
      rowCount: 600,
      headers: ["student_id", "first_name", "last_name", "email", "major", "gpa", "enrollment_date", "expected_graduation", "age", "credits_completed", "current_grade", "status"],
      learningObjectives: [
        "Validate GPA ranges (0.0-4.0)",
        "Check enrollment vs graduation date logic",
        "Handle inconsistent grade formats",
        "Identify unrealistic academic data",
      ],
      commonIssues: [
        "GPAs outside valid range (0.0-4.0)",
        "Graduation dates before enrollment",
        "Inconsistent grade formats (A, 85, PASS)",
        "Unrealistic ages for students",
        "Missing major information",
      ],
      generateData: generateStudentData,
    },
  ]

  // ============================================================================
  // DATA ANALYSIS SIMULATION
  // ============================================================================
  
  /**
   * Simulate data analysis for generated sample data
   * This creates realistic analysis results that match the intentional issues
   */
  const simulateAnalysis = (data: any[], headers: string[], datasetId: string): DataAnalysisResult => {
    // Calculate basic statistics
    const totalRows = data.length
    const totalColumns = headers.length
    
    // Count null values per column
    const nullValues: Record<string, number> = {}
    headers.forEach(header => {
      nullValues[header] = data.filter(row => 
        row[header] === null || row[header] === undefined || row[header] === ""
      ).length
    })

    // Detect duplicates (minimal for sample data)
    const duplicates = Math.floor(totalRows * 0.02) // Simulate 2% duplicates

    // Simulate data types
    const dataTypes: Record<string, string> = {}
    headers.forEach(header => {
      if (header.includes('id')) dataTypes[header] = 'string'
      else if (header.includes('date')) dataTypes[header] = 'date'
      else if (header.includes('email')) dataTypes[header] = 'email'
      else if (header.includes('phone')) dataTypes[header] = 'phone'
      else if (['age', 'salary', 'gpa', 'quantity', 'amount', 'price', 'credits'].some(term => header.includes(term))) {
        dataTypes[header] = 'number'
      }
      else dataTypes[header] = 'string'
    })

    // Simulate contextual issues based on dataset type
    const contextualIssues = []
    let issueCount = 0

    // Add issues based on the dataset's designed problems
    const dataset = sampleDatasets.find(d => d.id === datasetId)
    if (dataset) {
      issueCount = Math.floor(totalRows * 0.15) // 15% of rows have issues
      
      for (let i = 0; i < issueCount; i++) {
        const randomRow = Math.floor(Math.random() * totalRows)
        const issueTypes = dataset.commonIssues
        const randomIssue = issueTypes[Math.floor(Math.random() * issueTypes.length)]
        
        contextualIssues.push({
          column: headers[Math.floor(Math.random() * headers.length)],
          row: randomRow,
          value: data[randomRow]?.[headers[0]] || "sample_value",
          issue: randomIssue,
          severity: Math.random() > 0.7 ? "high" : (Math.random() > 0.4 ? "medium" : "low"),
          suggestion: "Review and correct this value based on business rules"
        })
      }
    }

    // Calculate quality score based on issues
    let qualityScore = 100
    qualityScore -= (Object.values(nullValues).reduce((sum, count) => sum + count, 0) / (totalRows * totalColumns)) * 30
    qualityScore -= (duplicates / totalRows) * 20
    qualityScore -= (issueCount / totalRows) * 25
    qualityScore = Math.max(0, Math.round(qualityScore))

    return {
      totalRows,
      totalColumns,
      nullValues,
      duplicates,
      dataTypes,
      outliers: {}, // Simplified for sample data
      statistics: {}, // Simplified for sample data
      contextualIssues,
      crossFieldIssues: [], // Simplified for sample data
      qualityScore
    }
  }

/**
   *
