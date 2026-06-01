import type { Field } from "../../../types"
import { Column, ColumnType, MatchColumnsProps, MatchedOptions } from "../MatchColumnsStep"
import { uniqueEntries, uniqueEntriesWithSeparator } from "./uniqueEntries"
import { splitCategoryLeaves } from "./splitCategoryLeaves"

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
      // Categories: split into leaves accepting both the canonical ("$#" / " > ")
      // and Magento/Odoo (";" / " / ") separators.
      let processedValues =
        field.key === "categories"
          ? uniqueValues.flatMap((entry) => splitCategoryLeaves(entry, separator))
          : // Server returns raw cell values un-split; split each on the separator so
            // packed multi-values (e.g. "a$#b$#c") become individual matchable options.
            uniqueValues.flatMap((entry) => entry.split(separator).map((v) => v.trim()))
      // Remove duplicates after splitting / leaf extraction
      const deduplicatedValues = [...new Set(processedValues)].filter(Boolean)
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
