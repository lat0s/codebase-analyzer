import fs from 'fs'
import path from 'path'
import { ESLint } from 'eslint'
import { parse as babelParse } from '@babel/parser'
import traverse from '@babel/traverse'
import { execSync } from 'child_process'

class CodebaseAnalyzer {
  constructor() {
    // ESLint configuration for MERN stack
    this.eslintConfig = {
      env: {
        browser: true,
        es2022: true,
        node: true
      },
      extends: ['eslint:recommended'],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      rules: {
        'no-unused-vars': 'warn',
        'no-undef': 'error',
        'complexity': ['warn', { max: 10 }]
      }
    }

    this.eslint = new ESLint({
      baseConfig: this.eslintConfig,
      useEslintrc: false
    })

    this.codebaseDir = path.join(process.cwd(), 'codebase')
    this.outputDir = path.join(process.cwd(), 'reports')
    this.supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']
    
    this.runTimestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
    this.currentRunDir = path.join(this.outputDir, 'individual-files', this.runTimestamp)
  }


  async analyzeCodebase() {
    console.log('\n📁 CODEBASE ANALYSIS')
    console.log('='.repeat(70))

    if (!fs.existsSync(this.codebaseDir)) {
      console.error(`❌ Codebase directory not found: ${this.codebaseDir}`)
      return
    }

    console.log(`📋 Source: ${this.codebaseDir}`)
    console.log(`📋 Reports: ${this.outputDir}`)

    this.ensureDirectories()

    const files = this.findSupportedFiles(this.codebaseDir)
    console.log(`\n🔍 Found ${files.length} supported files`)

    if (files.length === 0) {
      console.log('❌ No supported files found!')
      console.log(`   Supported extensions: ${this.supportedExtensions.join(', ')}`)
      return
    }

    console.log('\n📊 Starting analysis...')
    const results = []
    let successCount = 0

    for (const filePath of files) {
      const relativePath = path.relative(this.codebaseDir, filePath)
      console.log(`🔍 Analyzing: ${relativePath}`)

      try {
        const metrics = await this.analyzeFile(filePath)
        results.push({
          file: relativePath,
          path: filePath,
          metrics
        })
        successCount++
        console.log(`✅ Successfully analyzed: ${relativePath}`)
      } catch (error) {
        console.log(`❌ Failed to analyze: ${relativePath}. Error: ${error.message}`)
      }
    }

    if (successCount > 0) {
      await this.generateFolderSummary(results, 'codebase')
    }

    console.log('\n📋 ANALYSIS COMPLETE')
    console.log(`✅ Successfully analyzed: ${successCount}/${files.length} files`)
    console.log(`❌ Failed to analyze: ${files.length - successCount} files`)
    console.log(`📁 Reports saved to: ${this.outputDir}`)
  }

 
  ensureDirectories() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }

    const individualReportsDir = path.join(this.outputDir, 'individual-files')
    if (!fs.existsSync(individualReportsDir)) {
      fs.mkdirSync(individualReportsDir, { recursive: true })
    }

    if (!fs.existsSync(this.currentRunDir)) {
      fs.mkdirSync(this.currentRunDir, { recursive: true })
    }
  }

 
  findSupportedFiles(dir) {
    let files = []

    if (!fs.existsSync(dir)) return files

    const items = fs.readdirSync(dir)

    for (const item of items) {
      const itemPath = path.join(dir, item)
      const stat = fs.statSync(itemPath)

      if (stat.isDirectory()) {
        files = files.concat(this.findSupportedFiles(itemPath))
      } else if (stat.isFile()) {
        const ext = path.extname(item).toLowerCase()
        if (this.supportedExtensions.includes(ext)) {
          files.push(itemPath)
        }
      }
    }

    return files
  }


  async generateFolderSummary(results, folderName) {
    const summary = {
      metadata: {
        timestamp: new Date().toISOString(),
        folderName,
        analyzer: 'codebase-analyzer-v1.0',
        totalFiles: results.length
      },
      totals: {
        totalLines: 0,
        sourceLines: 0,
        totalFunctions: 0,
        totalClasses: 0,
        totalComplexity: 0,
        totalIssues: 0
      },
      files: []
    }

    for (const result of results) {
      const m = result.metrics

      summary.totals.totalLines += m.sizeMetrics?.totalLines || 0
      summary.totals.sourceLines += m.sizeMetrics?.sourceLines || 0
      summary.totals.totalFunctions += m.structuralComplexity?.totalFunctions || 0
      summary.totals.totalClasses += m.structuralComplexity?.classes || 0
      summary.totals.totalComplexity += m.cyclomaticComplexity?.complexity || 0
      summary.totals.totalIssues += m.staticAnalysis?.totalIssues || 0

      summary.files.push({
        file: result.file,
        lines: m.sizeMetrics?.totalLines || 0,
        functions: m.structuralComplexity?.totalFunctions || 0,
        complexity: m.cyclomaticComplexity?.complexity || 0,
        issues: m.staticAnalysis?.totalIssues || 0
      })
    }

    const fileCount = results.length
    summary.averages = {
      avgLinesPerFile: Math.round(summary.totals.totalLines / fileCount),
      avgComplexity: Math.round((summary.totals.totalComplexity / fileCount) * 100) / 100,
      avgFunctionsPerFile: Math.round((summary.totals.totalFunctions / fileCount) * 100) / 100
    }

    const summaryPath = path.join(this.currentRunDir, `summary-${folderName}.json`)
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))

    console.log(`\n📊 SUMMARY REPORT:`)
    console.log(`  Total Files: ${summary.totals.totalFiles}`)
    console.log(`  Total Lines: ${summary.totals.totalLines}`)
    console.log(`  Total Functions: ${summary.totals.totalFunctions}`)
    console.log(`  Total Complexity: ${summary.totals.totalComplexity}`)
    console.log(`  Total Issues: ${summary.totals.totalIssues}`)
    console.log(`\n📄 Summary saved: ${this.runTimestamp}/${path.basename(summaryPath)}`)
  }


  async analyzeFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    const fileContent = fs.readFileSync(filePath, 'utf8')
    const fileName = path.basename(filePath)
    const fileExt = path.extname(filePath)

    try {
      const ast = this.parseWithBabel(fileContent, fileExt)

      const metrics = this.calculateValidatedMetrics(ast, fileContent, filePath)

      const eslintResults = await this.runESLintAnalysis(filePath, fileContent)
      metrics.staticAnalysis = eslintResults

      await this.saveStructuredData(metrics, fileName)

      return metrics

    } catch (error) {
      console.log(`⚠️ Parse Error: ${error.message}`)
      console.log(`📋 Using fallback analysis for ${fileName}`)

      const basicMetrics = this.calculateFallbackMetrics(fileContent, filePath)
      await this.saveStructuredData(basicMetrics, fileName)
      return basicMetrics
    }
  }

 
  parseWithBabel(content, fileExtension) {
    const isJSX = fileExtension === '.jsx' || content.includes('</')

    return babelParse(content, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: false,
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'objectRestSpread',
        'asyncGenerators',
        'functionBind',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'dynamicImport',
        'nullishCoalescingOperator',
        'optionalChaining'
      ]
    })
  }

  
  calculateValidatedMetrics(ast, content, filePath) {
    const lines = content.split('\n')
    const nonEmptyLines = lines.filter(line => line.trim().length > 0)

    // Initialize metrics structure
    const metrics = {
      metadata: {
        timestamp: new Date().toISOString(),
        filePath: path.resolve(filePath),
        analyzer: 'codebase-analyzer-v1.0',
        standards: [
          'IEEE-1061-1998',
          'ISO-25010-2011',
          'McCabe-1976',
          'Halstead-1977',
          'ESLint-8.x'
        ]
      },

      // ISO/IEC 25010 Size Metrics
      sizeMetrics: {
        totalLines: lines.length,
        sourceLines: nonEmptyLines.length,
        commentLines: this.countCommentLines(content),
        blankLines: lines.length - nonEmptyLines.length,
        logicalLinesOfCode: this.countLogicalLines(content)
      },

      // IEEE 1061 Structural Metrics
      structuralComplexity: {
        totalFunctions: 0,
        namedFunctions: 0,
        anonymousFunctions: 0,
        arrowFunctions: 0,
        methods: 0,
        classes: 0,
        variables: 0,
        constants: 0,
        imports: 0,
        exports: 0,
        conditionals: 0,
        loops: 0,
        astNodes: 0
      },

      // McCabe Cyclomatic Complexity (1976) - Original Formula
      cyclomaticComplexity: {
        complexity: 1, // Base complexity
        decisionPoints: 0,
        maxNestingDepth: 0,
        averageComplexity: 0,
        riskLevel: 'Low'
      },

      // Halstead Software Science (1977) - Exact Original Formulas
      halsteadMetrics: {
        operators: new Set(),
        operands: new Set(),
        totalOperators: 0,
        totalOperands: 0
      }
    }

    let nestingDepth = 0
    let maxNesting = 0
    let functionCount = 0
    let totalComplexity = 0

    // AST traversal using Babel traverse
    traverse.default(ast, {
      enter: (path) => {
        const node = path.node
        metrics.structuralComplexity.astNodes++

        // Track nesting depth
        if (this.isNestingNode(node)) {
          nestingDepth++
          maxNesting = Math.max(maxNesting, nestingDepth)
        }

        // Count structural elements (IEEE 1061)
        switch (node.type) {
          case 'FunctionDeclaration':
            metrics.structuralComplexity.totalFunctions++
            metrics.structuralComplexity.namedFunctions++
            functionCount++
            break

          case 'FunctionExpression':
            metrics.structuralComplexity.totalFunctions++
            metrics.structuralComplexity.anonymousFunctions++
            functionCount++
            break

          case 'ArrowFunctionExpression':
            metrics.structuralComplexity.totalFunctions++
            metrics.structuralComplexity.arrowFunctions++
            functionCount++
            break

          case 'MethodDefinition':
          case 'ClassMethod':
            metrics.structuralComplexity.methods++
            functionCount++
            break

          case 'ClassDeclaration':
            metrics.structuralComplexity.classes++
            break

          case 'VariableDeclaration':
            if (node.kind === 'const') {
              metrics.structuralComplexity.constants += node.declarations.length
            } else {
              metrics.structuralComplexity.variables += node.declarations.length
            }
            break

          case 'ImportDeclaration':
            metrics.structuralComplexity.imports++
            break

          case 'ExportNamedDeclaration':
          case 'ExportDefaultDeclaration':
            metrics.structuralComplexity.exports++
            break

          // McCabe Cyclomatic Complexity - Decision Points
          case 'IfStatement':
            metrics.cyclomaticComplexity.decisionPoints++
            metrics.structuralComplexity.conditionals++
            break

          case 'ConditionalExpression':
            metrics.cyclomaticComplexity.decisionPoints++
            break

          case 'ForStatement':
          case 'ForInStatement':
          case 'ForOfStatement':
          case 'WhileStatement':
          case 'DoWhileStatement':
            metrics.cyclomaticComplexity.decisionPoints++
            metrics.structuralComplexity.loops++
            break

          case 'SwitchCase':
            if (node.test !== null) {
              metrics.cyclomaticComplexity.decisionPoints++
            }
            break

          case 'CatchClause':
            metrics.cyclomaticComplexity.decisionPoints++
            break

          case 'LogicalExpression':
            if (node.operator === '&&' || node.operator === '||') {
              metrics.cyclomaticComplexity.decisionPoints++
            }
            break

          // Halstead Operators (Original 1977 specification)
          case 'BinaryExpression':
          case 'LogicalExpression':
          case 'UnaryExpression':
          case 'UpdateExpression':
          case 'AssignmentExpression':
            if (node.operator) {
              metrics.halsteadMetrics.operators.add(node.operator)
              metrics.halsteadMetrics.totalOperators++
            }
            break

          case 'CallExpression':
            metrics.halsteadMetrics.operators.add('()')
            metrics.halsteadMetrics.totalOperators++
            break

          case 'MemberExpression':
            metrics.halsteadMetrics.operators.add('.')
            metrics.halsteadMetrics.totalOperators++
            break

          // Halstead Operands (Identifiers and Literals)
          case 'Identifier':
            if (!this.isReservedWord(node.name)) {
              metrics.halsteadMetrics.operands.add(node.name)
              metrics.halsteadMetrics.totalOperands++
            }
            break

          case 'StringLiteral':
          case 'NumericLiteral':
          case 'BooleanLiteral':
          case 'NullLiteral':
            const value = node.value === null ? 'null' : String(node.value)
            metrics.halsteadMetrics.operands.add(value)
            metrics.halsteadMetrics.totalOperands++
            break
        }
      },

      exit: (path) => {
        if (this.isNestingNode(path.node)) {
          nestingDepth--
        }
      }
    })

    // Calculate final metrics
    metrics.cyclomaticComplexity.complexity = 1 + metrics.cyclomaticComplexity.decisionPoints
    metrics.cyclomaticComplexity.maxNestingDepth = maxNesting
    metrics.cyclomaticComplexity.averageComplexity = functionCount > 0
      ? Math.round((metrics.cyclomaticComplexity.complexity / functionCount) * 100) / 100
      : 0
    metrics.cyclomaticComplexity.riskLevel = this.getMcCabeRiskLevel(metrics.cyclomaticComplexity.complexity)

    // Halstead Software Science calculations (exact 1977 formulas)
    const n1 = metrics.halsteadMetrics.operators.size      // unique operators (η1)
    const n2 = metrics.halsteadMetrics.operands.size       // unique operands (η2)
    const N1 = metrics.halsteadMetrics.totalOperators      // total operators (N1)
    const N2 = metrics.halsteadMetrics.totalOperands       // total operands (N2)

    const vocabulary = n1 + n2                             // η = η1 + η2
    const length = N1 + N2                                 // N = N1 + N2
    const calculatedLength = n1 * Math.log2(n1 || 1) + n2 * Math.log2(n2 || 1) // Ñ
    const volume = length * Math.log2(vocabulary || 1)     // V = N × log2(η)
    const difficulty = (n1 / 2) * (N2 / (n2 || 1))       // D = (η1/2) × (N2/η2)
    const effort = difficulty * volume                     // E = D × V
    const timeToProgram = effort / 18                      // T = E / 18 (Halstead)
    const deliveredBugs = volume / 3000                    // B = V / 3000 (Original)

    // Store raw values first for precision, then round for display
    const rawVolume = volume;
    const rawDifficulty = difficulty;
    const rawEffort = effort;

    metrics.halsteadMetrics = {
      uniqueOperators: n1,
      uniqueOperands: n2,
      totalOperators: N1,
      totalOperands: N2,
      vocabulary,
      length,
      calculatedLength: Math.round(calculatedLength * 100) / 100,
      volume: Math.round(rawVolume * 100) / 100,
      difficulty: Math.round(rawDifficulty * 100) / 100,
      effort: Math.round(rawEffort * 100) / 100,
      timeToProgram: Math.round(timeToProgram * 100) / 100,
      deliveredBugs: Math.round(deliveredBugs * 10000) / 10000,
      // Add raw values for validation (hidden from display)
      _rawVolume: rawVolume,
      _rawDifficulty: rawDifficulty,
      _rawEffort: rawEffort
    }

    return metrics
  }

 
  async runESLintAnalysis(filePath, content) {
    try {
      const results = await this.eslint.lintText(content, { filePath })
      const result = results[0]

      if (!result) {
        return { errors: 0, warnings: 0, issues: [] }
      }

      const errors = result.messages.filter(msg => msg.severity === 2)
      const warnings = result.messages.filter(msg => msg.severity === 1)

      return {
        totalIssues: result.messages.length,
        errors: errors.length,
        warnings: warnings.length,
        issues: result.messages.map(msg => ({
          line: msg.line,
          column: msg.column,
          rule: msg.ruleId || 'unknown',
          severity: msg.severity === 2 ? 'error' : 'warning',
          message: msg.message
        }))
      }
    } catch (error) {
      return {
        totalIssues: 0,
        errors: 0,
        warnings: 0,
        issues: [],
        note: `ESLint analysis failed: ${error.message}`
      }
    }
  }


  calculateFallbackMetrics(content, filePath) {
    const lines = content.split('\n')

    return {
      metadata: {
        timestamp: new Date().toISOString(),
        filePath: path.resolve(filePath),
        analyzer: 'codebase-fallback-v1.0',
        note: 'AST parsing failed - using text-based analysis'
      },
      sizeMetrics: {
        totalLines: lines.length,
        sourceLines: lines.filter(line => line.trim().length > 0).length,
        commentLines: this.countCommentLines(content),
        blankLines: lines.filter(line => line.trim().length === 0).length,
        logicalLinesOfCode: 0
      },
      structuralComplexity: {
        totalFunctions: 0, namedFunctions: 0, anonymousFunctions: 0,
        arrowFunctions: 0, methods: 0, classes: 0, variables: 0,
        constants: 0, imports: 0, exports: 0, conditionals: 0,
        loops: 0, astNodes: 0
      },
      cyclomaticComplexity: {
        complexity: 1, decisionPoints: 0, maxNestingDepth: 0,
        averageComplexity: 0, riskLevel: 'Unknown'
      },
      halsteadMetrics: {
        uniqueOperators: 0, uniqueOperands: 0, totalOperators: 0,
        totalOperands: 0, vocabulary: 0, length: 0, calculatedLength: 0,
        volume: 0, difficulty: 0, effort: 0, timeToProgram: 0, deliveredBugs: 0
      },
      staticAnalysis: {
        totalIssues: 0, errors: 0, warnings: 0, issues: [],
        note: 'Static analysis skipped due to parse failure'
      }
    }
  }


  isNestingNode(node) {
    return [
      'BlockStatement', 'IfStatement', 'ForStatement', 'ForInStatement',
      'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'SwitchStatement',
      'TryStatement', 'CatchClause', 'FunctionDeclaration', 'FunctionExpression',
      'ArrowFunctionExpression', 'MethodDefinition', 'ClassMethod'
    ].includes(node.type)
  }

  isReservedWord(name) {
    const reserved = [
      'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
      'default', 'delete', 'do', 'else', 'export', 'extends', 'finally',
      'for', 'function', 'if', 'import', 'in', 'instanceof', 'new',
      'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof',
      'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'async',
      'await', 'true', 'false', 'null', 'undefined'
    ]
    return reserved.includes(name)
  }

  countCommentLines(content) {
    const lines = content.split('\n')
    return lines.filter(line => {
      const trimmed = line.trim()
      return trimmed.startsWith('//') ||
             trimmed.startsWith('/*') ||
             trimmed.startsWith('*') ||
             trimmed.endsWith('*/')
    }).length
  }

  countLogicalLines(content) {
    const lines = content.split('\n')
    return lines.filter(line => {
      const trimmed = line.trim()
      return trimmed.length > 0 &&
             !trimmed.startsWith('//') &&
             !trimmed.startsWith('/*') &&
             !trimmed.startsWith('*') &&
             trimmed !== '{' &&
             trimmed !== '}' &&
             trimmed !== '};'
    }).length
  }

  getMcCabeRiskLevel(complexity) {
    // McCabe's original risk categories (1976)
    if (complexity <= 10) return 'Low'
    if (complexity <= 20) return 'Moderate'
    if (complexity <= 50) return 'High'
    return 'Very High'
  }


  async saveStructuredData(metrics, fileName) {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }

    if (!fs.existsSync(this.currentRunDir)) {
      fs.mkdirSync(this.currentRunDir, { recursive: true })
    }

    const cleanName = fileName.replace(/\.[^/.]+$/, '')
    const reportPath = path.join(this.currentRunDir, `analysis-${cleanName}.json`)

    const metricsForSave = JSON.parse(JSON.stringify(metrics))
    if (metrics.halsteadMetrics && metrics.halsteadMetrics.operators instanceof Set) {
      metricsForSave.halsteadMetrics.operatorList = Array.from(metrics.halsteadMetrics.operators)
      metricsForSave.halsteadMetrics.operandList = Array.from(metrics.halsteadMetrics.operands)
      delete metricsForSave.halsteadMetrics.operators
      delete metricsForSave.halsteadMetrics.operands

      metrics.halsteadMetrics.operatorList = Array.from(metrics.halsteadMetrics.operators)
      metrics.halsteadMetrics.operandList = Array.from(metrics.halsteadMetrics.operands)
      delete metrics.halsteadMetrics.operators
      delete metrics.halsteadMetrics.operands
    }

    fs.writeFileSync(reportPath, JSON.stringify(metricsForSave, null, 2))
    console.log(`📄 Report saved: ${this.runTimestamp}/${path.basename(reportPath)}`)

    const validationCopy = JSON.parse(JSON.stringify(metricsForSave))
    delete validationCopy.metadata.timestamp
    return validationCopy
  }
}

async function main() {
  const analyzer = new CodebaseAnalyzer()

  try {
    await analyzer.analyzeCodebase()
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { CodebaseAnalyzer }
