import type { Field } from "../../../types"
import { Column, ColumnType, MatchColumnsProps, MatchedOptions } from "../MatchColumnsStep"
import { uniqueEntries, uniqueEntriesWithSeparator } from "./uniqueEntries"

export const setColumn = <T extends string>(
  oldColumn: Column<T>,
  field?: Field<T>,
  data?: MatchColumnsProps<T>["data"],
  autoMapSelectValues?: boolean,
  multiSelectValueSeparator?: string,
): Column<T> => {
  switch (field?.fieldType.type) {
    case "select": {
      const fieldOptions = field.fieldType.options
      const uniqueData = uniqueEntries(data || [], oldColumn.index) as MatchedOptions<T>[]
      const matchedOptions = autoMapSelectValues
        ? uniqueData.map((record) => {
            const value = fieldOptions.find(
              (fieldOption) => fieldOption.value === record.entry || fieldOption.label === record.entry,
            )?.value
            return value ? ({ ...record, value } as MatchedOptions<T>) : (record as MatchedOptions<T>)
          })
        : uniqueData
      const allMatched = matchedOptions.filter((o) => o.value).length === uniqueData?.length

      return {
        ...oldColumn,
        type: allMatched ? ColumnType.matchedSelectOptions : ColumnType.matchedSelect,
        value: field.key,
        matchedOptions,
      }
    }
    case "multi_select": {
      const fieldOptions = field.fieldType.options
      const separator = multiSelectValueSeparator || ";"
      const uniqueData = uniqueEntriesWithSeparator(data || [], oldColumn.index, separator, field.key) as MatchedOptions<T>[]
      const matchedOptions = autoMapSelectValues
        ? uniqueData.map((record) => {
            const value = fieldOptions.find(
              (fieldOption) => fieldOption.value === record.entry || fieldOption.label === record.entry,
            )?.value
            return value ? ({ ...record, value } as MatchedOptions<T>) : (record as MatchedOptions<T>)
          })
        : uniqueData
      const allMatched = matchedOptions.filter((o) => o.value).length === uniqueData?.length

      return {
        ...oldColumn,
        type: allMatched ? ColumnType.matchedMultiSelectOptions : ColumnType.matchedMultiSelect,
        value: field.key,
        matchedOptions,
      }
    }
    case "checkbox":
      return { index: oldColumn.index, type: ColumnType.matchedCheckbox, value: field.key, header: oldColumn.header }
    case "input":
      return { index: oldColumn.index, type: ColumnType.matched, value: field.key, header: oldColumn.header }
    default:
      return { index: oldColumn.index, header: oldColumn.header, type: ColumnType.empty }
  }
}

/**
 * Set column with pre-fetched unique values (for on-demand fetching from server)
 * Used when fetchColumnUniqueValues is provided for large file imports
 */
export const setColumnWithUniqueValues = <T extends string>(
  oldColumn: Column<T>,
  field: Field<T>,
  uniqueValues: string[],
  autoMapSelectValues?: boolean,
  multiSelectValueSeparator?: string,
): Column<T> => {
  switch (field.fieldType.type) {
    case "select": {
      const fieldOptions = field.fieldType.options
      const uniqueData = uniqueValues.map((entry) => ({ entry })) as MatchedOptions<T>[]
      const matchedOptions = autoMapSelectValues
        ? uniqueData.map((record) => {
            const value = fieldOptions.find(
              (fieldOption) => fieldOption.value === record.entry || fieldOption.label === record.entry,
            )?.value
            return value ? ({ ...record, value } as MatchedOptions<T>) : (record as MatchedOptions<T>)
          })
        : uniqueData
      const allMatched = matchedOptions.filter((o) => o.value).length === uniqueData?.length

      return {
        ...oldColumn,
        type: allMatched ? ColumnType.matchedSelectOptions : ColumnType.matchedSelect,
        value: field.key,
        matchedOptions,
      }
    }
    case "multi_select": {
      const fieldOptions = field.fieldType.options
      const separator = multiSelectValueSeparator || ";"
      // For multi_select with pre-fetched values, values are already split by the server
      // Apply category leaf extraction for "categories" field
      const processedValues = field.key === "categories" 
        ? uniqueValues.map((entry) => {
            if (entry.includes(" > ")) {
              const segments = entry.split(" > ")
              return segments[segments.length - 1].trim()
            }
            return entry
          })
        : uniqueValues
      // Remove duplicates after leaf extraction
      const deduplicatedValues = [...new Set(processedValues)]
      const uniqueData = deduplicatedValues.map((entry) => ({ entry })) as MatchedOptions<T>[]
      const matchedOptions = autoMapSelectValues
        ? uniqueData.map((record) => {
            const value = fieldOptions.find(
              (fieldOption) => fieldOption.value === record.entry || fieldOption.label === record.entry,
            )?.value
            return value ? ({ ...record, value } as MatchedOptions<T>) : (record as MatchedOptions<T>)
          })
        : uniqueData
      const allMatched = matchedOptions.filter((o) => o.value).length === uniqueData?.length

      return {
        ...oldColumn,
        type: allMatched ? ColumnType.matchedMultiSelectOptions : ColumnType.matchedMultiSelect,
        value: field.key,
        matchedOptions,
      }
    }
    case "checkbox":
      return { index: oldColumn.index, type: ColumnType.matchedCheckbox, value: field.key, header: oldColumn.header }
    case "input":
      return { index: oldColumn.index, type: ColumnType.matched, value: field.key, header: oldColumn.header }
    default:
      return { index: oldColumn.index, header: oldColumn.header, type: ColumnType.empty }
  }
}
