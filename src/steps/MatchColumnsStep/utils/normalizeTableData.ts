import type { Columns } from "../MatchColumnsStep"
import { ColumnType } from "../MatchColumnsStep"
import type { Data, Fields, RawData } from "../../../types"
import { normalizeCheckboxValue } from "./normalizeCheckboxValue"

export const normalizeTableData = <T extends string>(
  columns: Columns<T>,
  data: RawData[],
  fields: Fields<T>,
  multiSelectValueSeparator = ";",
  passUnmappedValues = false,
) =>
  data.map((row) =>
    columns.reduce((acc, column, index) => {
      const curr = row[index]
      switch (column.type) {
        case ColumnType.matchedCheckbox: {
          const field = fields.find((field) => field.key === column.value)!
          if ("booleanMatches" in field.fieldType && Object.keys(field.fieldType).length) {
            const booleanMatchKey = Object.keys(field.fieldType.booleanMatches || []).find(
              (key) => key.toLowerCase() === curr?.toLowerCase(),
            )!
            const booleanMatch = field.fieldType.booleanMatches?.[booleanMatchKey]
            acc[column.value] = booleanMatchKey ? booleanMatch : normalizeCheckboxValue(curr)
          } else {
            acc[column.value] = normalizeCheckboxValue(curr)
          }
          return acc
        }
        case ColumnType.matched: {
          acc[column.value] = curr === "" ? undefined : curr
          return acc
        }
        case ColumnType.matchedSelect:
        case ColumnType.matchedSelectOptions: {
          const matchedOption = column.matchedOptions.find(({ entry }) => entry === curr)
          // When passUnmappedValues is true, use the original value if no mapping exists
          acc[column.value] = matchedOption?.value || (passUnmappedValues && curr ? curr : undefined)
          return acc
        }
        case ColumnType.matchedMultiSelect:
        case ColumnType.matchedMultiSelectOptions: {
          if (!curr) {
            acc[column.value] = []
            return acc
          }
          let values = curr.split(multiSelectValueSeparator).map((v) => v.trim())
          
          // Special handling for "categories" field: extract only the leaf (last segment) from each category path
          // e.g., "Default Category > Shop > Pferdedecken" becomes "Pferdedecken"
          if (column.value === "categories") {
            values = values.map((v) => {
              const segments = v.split(" > ")
              return segments[segments.length - 1].trim()
            })
          }
          
          const mappedValues: string[] = values
            .map((v) => {
              const matchedOption = column.matchedOptions.find(({ entry }) => entry === v)
              // When passUnmappedValues is true, use the original value if no mapping exists
              return matchedOption?.value || (passUnmappedValues ? v : undefined) as string | undefined
            })
            .filter((v): v is string => v !== undefined)
          acc[column.value] = mappedValues
          return acc
        }
        case ColumnType.empty:
        case ColumnType.ignored: {
          return acc
        }
        default:
          return acc
      }
    }, {} as Data<T>),
  )
