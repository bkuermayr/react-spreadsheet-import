import { useCallback, useEffect, useMemo, useState } from "react"
import { useToast } from "@chakra-ui/react"
import { UserTableColumn } from "./components/UserTableColumn"
import { useRsi } from "../../hooks/useRsi"
import { TemplateColumn } from "./components/TemplateColumn"
import { ColumnGrid } from "./components/ColumnGrid"
import { setColumn, setColumnWithUniqueValues } from "./utils/setColumn"
import { setIgnoreColumn } from "./utils/setIgnoreColumn"
import { setSubColumn } from "./utils/setSubColumn"
import { normalizeTableData } from "./utils/normalizeTableData"
import type { Field, RawData } from "../../types"
import { getMatchedColumns } from "./utils/getMatchedColumns"
import { UnmatchedFieldsAlert } from "../../components/Alerts/UnmatchedFieldsAlert"
import { findUnmatchedRequiredFields } from "./utils/findUnmatchedRequiredFields"
import { aiAutoMapSelectValues } from "./utils/aiAutoMap"
import { getFieldOptions } from "./utils/getFieldOptions"

export type MatchColumnsProps<T extends string> = {
  data: RawData[]
  headerValues: RawData
  onContinue: (data: any[], rawData: RawData[], columns: Columns<T>) => void
  onBack?: () => void
}

export enum ColumnType {
  empty,
  ignored,
  matched,
  matchedCheckbox,
  matchedSelect,
  matchedSelectOptions,
  matchedMultiSelect,
  matchedMultiSelectOptions,
}

export type MatchedOptions<T> = {
  entry: string
  value: T
}

type EmptyColumn = { type: ColumnType.empty; index: number; header: string }
type IgnoredColumn = { type: ColumnType.ignored; index: number; header: string }
type MatchedColumn<T> = { type: ColumnType.matched; index: number; header: string; value: T }
type MatchedSwitchColumn<T> = { type: ColumnType.matchedCheckbox; index: number; header: string; value: T }
export type MatchedSelectColumn<T> = {
  type: ColumnType.matchedSelect
  index: number
  header: string
  value: T
  matchedOptions: Partial<MatchedOptions<T>>[]
}
export type MatchedSelectOptionsColumn<T> = {
  type: ColumnType.matchedSelectOptions
  index: number
  header: string
  value: T
  matchedOptions: MatchedOptions<T>[]
}
export type MatchedMultiSelectColumn<T> = {
  type: ColumnType.matchedMultiSelect
  index: number
  header: string
  value: T
  matchedOptions: Partial<MatchedOptions<T>>[]
}
export type MatchedMultiSelectOptionsColumn<T> = {
  type: ColumnType.matchedMultiSelectOptions
  index: number
  header: string
  value: T
  matchedOptions: MatchedOptions<T>[]
}

export type Column<T extends string> =
  | EmptyColumn
  | IgnoredColumn
  | MatchedColumn<T>
  | MatchedSwitchColumn<T>
  | MatchedSelectColumn<T>
  | MatchedSelectOptionsColumn<T>
  | MatchedMultiSelectColumn<T>
  | MatchedMultiSelectOptionsColumn<T>

export type Columns<T extends string> = Column<T>[]

export const MatchColumnsStep = <T extends string>({
  data,
  headerValues,
  onContinue,
  onBack,
}: MatchColumnsProps<T>) => {
  const toast = useToast()
  const dataExample = data.slice(0, 2)
  const {
    fields,
    autoMapHeaders,
    autoMapSelectValues,
    autoMapDistance,
    translations,
    multiSelectValueSeparator,
    aiApiKey,
    aiModel,
    customValueMappingPrompt,
    fetchColumnUniqueValues,
    autoTriggerAiValueMapping,
    passUnmappedValues,
  } = useRsi<T>()
  const [isLoading, setIsLoading] = useState(false)
  const [aiMappingColumnIndex, setAiMappingColumnIndex] = useState<number | null>(null)
  const [fetchingColumnIndex, setFetchingColumnIndex] = useState<number | null>(null)
  // Track columns that have been auto-mapped to avoid repeated auto-mapping
  const [autoMappedColumns, setAutoMappedColumns] = useState<Set<number>>(new Set())
  const [columns, setColumns] = useState<Columns<T>>(
    // Do not remove spread, it indexes empty array elements, otherwise map() skips over them
    ([...headerValues] as string[]).map((value, index) => ({ type: ColumnType.empty, index, header: value ?? "" })),
  )
  const [showUnmatchedFieldsAlert, setShowUnmatchedFieldsAlert] = useState(false)

  // Queue of columns pending AI value mapping (for auto-trigger feature)
  const [pendingAiMappingQueue, setPendingAiMappingQueue] = useState<number[]>([])
  
  const onChange = useCallback(
    async (value: T, columnIndex: number) => {
      const field = fields.find((field) => field.key === value) as unknown as Field<T>
      const existingFieldIndex = columns.findIndex((column) => "value" in column && column.value === field.key)
      
      // Check if this is a select/multi_select field and we have fetchColumnUniqueValues
      const isSelectField = field?.fieldType.type === "select" || field?.fieldType.type === "multi_select"
      
      let newColumns: Columns<T>
      
      if (isSelectField && fetchColumnUniqueValues) {
        // Fetch unique values on-demand for select fields
        setFetchingColumnIndex(columnIndex)
        try {
          const uniqueValues = await fetchColumnUniqueValues(columnIndex)
          newColumns = columns.map<Column<T>>((column, index) => {
            if (columnIndex === index) {
              return setColumnWithUniqueValues(column, field, uniqueValues, autoMapSelectValues, multiSelectValueSeparator)
            } else if (index === existingFieldIndex) {
              toast({
                status: "warning",
                variant: "left-accent",
                position: "bottom-left",
                title: translations.matchColumnsStep.duplicateColumnWarningTitle,
                description: translations.matchColumnsStep.duplicateColumnWarningDescription,
                isClosable: true,
              })
              return setColumn(column)
            } else {
              return column
            }
          })
          setColumns(newColumns)
        } catch (error) {
          console.error("Failed to fetch column unique values:", error)
          // Fallback to using sample data
          newColumns = columns.map<Column<T>>((column, index) => {
            if (columnIndex === index) {
              return setColumn(column, field, data, autoMapSelectValues, multiSelectValueSeparator)
            } else if (index === existingFieldIndex) {
              return setColumn(column)
            } else {
              return column
            }
          })
          setColumns(newColumns)
        } finally {
          setFetchingColumnIndex(null)
        }
      } else {
        // Use sample data for non-select fields or when fetchColumnUniqueValues is not provided
        newColumns = columns.map<Column<T>>((column, index) => {
          if (columnIndex === index) {
            return setColumn(column, field, data, autoMapSelectValues, multiSelectValueSeparator)
          } else if (index === existingFieldIndex) {
            toast({
              status: "warning",
              variant: "left-accent",
              position: "bottom-left",
              title: translations.matchColumnsStep.duplicateColumnWarningTitle,
              description: translations.matchColumnsStep.duplicateColumnWarningDescription,
              isClosable: true,
            })
            return setColumn(column)
          } else {
            return column
          }
        })
        setColumns(newColumns)
      }
      
      // Auto-trigger AI value mapping for select/multi_select fields if enabled
      // Add to queue for processing (will be handled by useEffect)
      if (autoTriggerAiValueMapping && aiApiKey && isSelectField && !autoMappedColumns.has(columnIndex)) {
        // Mark this column as auto-mapped to prevent repeated triggers
        setAutoMappedColumns((prev) => new Set([...prev, columnIndex]))
        // Add to pending queue for AI mapping
        setPendingAiMappingQueue((prev) => [...prev, columnIndex])
      }
    },
    [
      autoMapSelectValues,
      columns,
      data,
      fields,
      multiSelectValueSeparator,
      toast,
      translations.matchColumnsStep.duplicateColumnWarningDescription,
      translations.matchColumnsStep.duplicateColumnWarningTitle,
      fetchColumnUniqueValues,
      autoTriggerAiValueMapping,
      aiApiKey,
      autoMappedColumns,
    ],
  )

  const onIgnore = useCallback(
    (columnIndex: number) => {
      setColumns(columns.map((column, index) => (columnIndex === index ? setIgnoreColumn<T>(column) : column)))
    },
    [columns, setColumns],
  )

  const onRevertIgnore = useCallback(
    (columnIndex: number) => {
      setColumns(columns.map((column, index) => (columnIndex === index ? setColumn(column) : column)))
    },
    [columns, setColumns],
  )

  const onSubChange = useCallback(
    (value: string, columnIndex: number, entry: string) => {
      setColumns(
        columns.map((column, index) =>
          columnIndex === index && "matchedOptions" in column ? setSubColumn(column, entry, value) : column,
        ),
      )
    },
    [columns, setColumns],
  )
  const unmatchedRequiredFields = useMemo(() => findUnmatchedRequiredFields(fields, columns), [fields, columns])

  const onAiAutoMap = useCallback(
    async (columnIndex: number) => {
      const column = columns[columnIndex]
      if (!("matchedOptions" in column) || !("value" in column)) return

      // Get the field options for this column
      const fieldOptions = getFieldOptions(fields, column.value)
      if (fieldOptions.length === 0) return

      // Get unmatched entries
      const unmatchedEntries = column.matchedOptions.filter((opt) => !opt.value).map((opt) => opt.entry!)

      if (unmatchedEntries.length === 0) return

      setAiMappingColumnIndex(columnIndex)

      try {
        const result = await aiAutoMapSelectValues<T>({
          entries: unmatchedEntries,
          fieldOptions,
          aiApiKey,
          aiModel,
          customValueMappingPrompt,
        })

        if (result.error) {
          toast({
            status: "error",
            variant: "left-accent",
            position: "bottom-left",
            title: translations.matchColumnsStep.aiMappingError,
            description: result.error,
            isClosable: true,
          })
        }

        // Build a lookup map from the AI results keyed by entry text
        const aiMappingByEntry = new Map<string, T>()
        for (const m of result.mappings) {
          if (m.value) {
            aiMappingByEntry.set(m.entry, m.value)
          }
        }

        setColumns(
          columns.map((col, index) => {
            if (index !== columnIndex || !("matchedOptions" in col)) return col

            const updatedOptions = col.matchedOptions.map((opt) => {
              if (opt.value) return opt
              const mapped = opt.entry != null ? aiMappingByEntry.get(opt.entry) : undefined
              if (mapped) {
                return { ...opt, value: mapped }
              }
              return opt
            })

            const allMatched = updatedOptions.every((o) => o.value)
            const newType =
              col.type === ColumnType.matchedSelect || col.type === ColumnType.matchedSelectOptions
                ? allMatched
                  ? ColumnType.matchedSelectOptions
                  : ColumnType.matchedSelect
                : allMatched
                ? ColumnType.matchedMultiSelectOptions
                : ColumnType.matchedMultiSelect

            return {
              ...col,
              type: newType,
              matchedOptions: updatedOptions,
            } as Column<T>
          }),
        )
      } catch (error) {
        toast({
          status: "error",
          variant: "left-accent",
          position: "bottom-left",
          title: translations.matchColumnsStep.aiMappingError,
          description: error instanceof Error ? error.message : "Unknown error",
          isClosable: true,
        })
      } finally {
        setAiMappingColumnIndex(null)
      }
    },
    [columns, fields, aiApiKey, aiModel, customValueMappingPrompt, toast, translations.matchColumnsStep.aiMappingError],
  )

  const handleOnContinue = useCallback(async () => {
    if (unmatchedRequiredFields.length > 0) {
      setShowUnmatchedFieldsAlert(true)
    } else {
      setIsLoading(true)
      await onContinue(normalizeTableData(columns, data, fields, multiSelectValueSeparator, passUnmappedValues), data, columns)
      setIsLoading(false)
    }
  }, [unmatchedRequiredFields.length, onContinue, columns, data, fields, multiSelectValueSeparator, passUnmappedValues])

  const handleAlertOnContinue = useCallback(async () => {
    setShowUnmatchedFieldsAlert(false)
    setIsLoading(true)
    await onContinue(normalizeTableData(columns, data, fields, multiSelectValueSeparator, passUnmappedValues), data, columns)
    setIsLoading(false)
  }, [onContinue, columns, data, fields, multiSelectValueSeparator, passUnmappedValues])

  useEffect(
    () => {
      if (autoMapHeaders) {
        const matchedColumns = getMatchedColumns(columns, fields, data, autoMapDistance, autoMapSelectValues, multiSelectValueSeparator)
        setColumns(matchedColumns)
        
        // If auto-trigger AI value mapping is enabled, queue all select/multi_select columns
        // that have unmatched options for AI mapping
        if (autoTriggerAiValueMapping && aiApiKey) {
          const columnsToAutoMap: number[] = []
          matchedColumns.forEach((column, index) => {
            if ("matchedOptions" in column && column.matchedOptions.some((opt) => !opt.value)) {
              columnsToAutoMap.push(index)
            }
          })
          if (columnsToAutoMap.length > 0) {
            // Mark all columns as auto-mapped
            setAutoMappedColumns(new Set(columnsToAutoMap))
            // Add to pending queue
            setPendingAiMappingQueue(columnsToAutoMap)
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  
  // Process pending AI mapping queue - handles auto-trigger for select/multi_select fields
  useEffect(
    () => {
      const processQueue = async () => {
        if (pendingAiMappingQueue.length === 0 || aiMappingColumnIndex !== null) {
          return
        }
        
        // Process the first column in the queue
        const columnIndex = pendingAiMappingQueue[0]
        const column = columns[columnIndex]
        
        // Check if this column has unmatched options
        if (!("matchedOptions" in column) || !("value" in column)) {
          // Remove from queue and continue
          setPendingAiMappingQueue((prev) => prev.slice(1))
          return
        }
        
        const hasUnmatchedOptions = column.matchedOptions.some((opt) => !opt.value)
        if (!hasUnmatchedOptions) {
          // No unmatched options, remove from queue
          setPendingAiMappingQueue((prev) => prev.slice(1))
          return
        }
        
        // Trigger AI mapping for this column
        await onAiAutoMap(columnIndex)
        
        // Remove from queue after completion
        setPendingAiMappingQueue((prev) => prev.slice(1))
      }
      
      processQueue()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingAiMappingQueue, aiMappingColumnIndex, columns],
  )

  return (
    <>
      <UnmatchedFieldsAlert
        isOpen={showUnmatchedFieldsAlert}
        onClose={() => setShowUnmatchedFieldsAlert(false)}
        fields={unmatchedRequiredFields}
        onConfirm={handleAlertOnContinue}
      />
      <ColumnGrid
        columns={columns}
        onContinue={handleOnContinue}
        onBack={onBack}
        isLoading={isLoading}
        userColumn={(column) => (
          <UserTableColumn
            column={column}
            onIgnore={onIgnore}
            onRevertIgnore={onRevertIgnore}
            entries={dataExample.map((row) => row[column.index])}
          />
        )}
        templateColumn={(column) => (
          <TemplateColumn
            column={column}
            onChange={onChange}
            onSubChange={onSubChange}
            onAiAutoMap={onAiAutoMap}
            isAiMapping={aiMappingColumnIndex === column.index}
          />
        )}
      />
    </>
  )
}
