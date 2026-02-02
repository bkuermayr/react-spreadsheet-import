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
  } = useRsi<T>()
  const [isLoading, setIsLoading] = useState(false)
  const [aiMappingColumnIndex, setAiMappingColumnIndex] = useState<number | null>(null)
  const [fetchingColumnIndex, setFetchingColumnIndex] = useState<number | null>(null)
  const [columns, setColumns] = useState<Columns<T>>(
    // Do not remove spread, it indexes empty array elements, otherwise map() skips over them
    ([...headerValues] as string[]).map((value, index) => ({ type: ColumnType.empty, index, header: value ?? "" })),
  )
  const [showUnmatchedFieldsAlert, setShowUnmatchedFieldsAlert] = useState(false)

  const onChange = useCallback(
    async (value: T, columnIndex: number) => {
      const field = fields.find((field) => field.key === value) as unknown as Field<T>
      const existingFieldIndex = columns.findIndex((column) => "value" in column && column.value === field.key)
      
      // Check if this is a select/multi_select field and we have fetchColumnUniqueValues
      const isSelectField = field?.fieldType.type === "select" || field?.fieldType.type === "multi_select"
      
      if (isSelectField && fetchColumnUniqueValues) {
        // Fetch unique values on-demand for select fields
        setFetchingColumnIndex(columnIndex)
        try {
          const uniqueValues = await fetchColumnUniqueValues(columnIndex)
          setColumns(
            columns.map<Column<T>>((column, index) => {
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
            }),
          )
        } catch (error) {
          console.error("Failed to fetch column unique values:", error)
          // Fallback to using sample data
          setColumns(
            columns.map<Column<T>>((column, index) => {
              if (columnIndex === index) {
                return setColumn(column, field, data, autoMapSelectValues, multiSelectValueSeparator)
              } else if (index === existingFieldIndex) {
                return setColumn(column)
              } else {
                return column
              }
            }),
          )
        } finally {
          setFetchingColumnIndex(null)
        }
      } else {
        // Use sample data for non-select fields or when fetchColumnUniqueValues is not provided
        setColumns(
          columns.map<Column<T>>((column, index) => {
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
          }),
        )
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

        // Update the column with AI-mapped values
        setColumns(
          columns.map((col, index) => {
            if (index !== columnIndex || !("matchedOptions" in col)) return col

            const updatedOptions = col.matchedOptions.map((opt) => {
              const aiMapping = result.mappings.find((m) => m.entry === opt.entry)
              if (aiMapping && aiMapping.value) {
                return { ...opt, value: aiMapping.value }
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
      await onContinue(normalizeTableData(columns, data, fields, multiSelectValueSeparator), data, columns)
      setIsLoading(false)
    }
  }, [unmatchedRequiredFields.length, onContinue, columns, data, fields, multiSelectValueSeparator])

  const handleAlertOnContinue = useCallback(async () => {
    setShowUnmatchedFieldsAlert(false)
    setIsLoading(true)
    await onContinue(normalizeTableData(columns, data, fields, multiSelectValueSeparator), data, columns)
    setIsLoading(false)
  }, [onContinue, columns, data, fields, multiSelectValueSeparator])

  useEffect(
    () => {
      if (autoMapHeaders) {
        setColumns(
          getMatchedColumns(columns, fields, data, autoMapDistance, autoMapSelectValues, multiSelectValueSeparator),
        )
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
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
