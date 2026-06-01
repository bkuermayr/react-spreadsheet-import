import type { Field, Fields } from "../../../types"
import { Column, Columns, ColumnType, MatchColumnsProps, MatchedOptions } from "../MatchColumnsStep"
import { setColumn } from "./setColumn"

export interface PresetColumnMappings {
  columnMappings?: Record<string, string>
  selectFieldMappings?: Record<string, Record<string, string>>
}

/**
 * Seed the match step with EXACT mappings from a saved template, bypassing fuzzy
 * auto-matching. Unlike getMatchedColumns this:
 *   - matches a column to a field by exact header string (no Levenshtein), so a
 *     column like "VPE" can never be hijacked by a fuzzy-near field alternate;
 *   - allows MULTIPLE source columns to map to the SAME field (e.g. a main-image
 *     and an extra-images column both mapping to one media_gallery field), which
 *     the fuzzy matcher forbids;
 *   - pre-fills select/multi_select value mappings from the template.
 * Columns not present in the template are left untouched (empty / unmapped).
 */
export const applyPresetMappings = <T extends string>(
  columns: Columns<T>,
  fields: Fields<T>,
  data: MatchColumnsProps<T>["data"],
  preset: PresetColumnMappings,
  multiSelectValueSeparator?: string,
): Columns<T> => {
  const columnMappings = preset.columnMappings
  if (!columnMappings || Object.keys(columnMappings).length === 0) return columns

  const selectFieldMappings = preset.selectFieldMappings || {}

  // header string -> every column index carrying that header (handles duplicates)
  const headerToIndexes = new Map<string, number[]>()
  columns.forEach((col) => {
    const arr = headerToIndexes.get(col.header) || []
    arr.push(col.index)
    headerToIndexes.set(col.header, arr)
  })

  const result = [...columns]

  Object.entries(columnMappings).forEach(([rawHeader, fieldKey]) => {
    const indexes = headerToIndexes.get(rawHeader)
    if (!indexes || indexes.length === 0) return
    const field = fields.find((f) => f.key === fieldKey) as Field<T> | undefined
    if (!field) return

    indexes.forEach((columnIndex) => {
      // Exact field assignment. autoMapSelectValues=false so matchedOptions start
      // unmapped; we overlay the template's explicit value rules below.
      let col = setColumn(result[columnIndex], field, data, false, multiSelectValueSeparator)

      const valueMap = selectFieldMappings[fieldKey]
      if (valueMap && "matchedOptions" in col && Array.isArray((col as any).matchedOptions)) {
        const matchedOptions = (col as any).matchedOptions.map((opt: Partial<MatchedOptions<T>>) =>
          opt.entry !== undefined && valueMap[opt.entry] !== undefined
            ? ({ ...opt, value: valueMap[opt.entry] as T })
            : opt,
        )
        const allMatched = matchedOptions.length > 0 && matchedOptions.every((o: any) => !!o.value)
        const isMulti =
          col.type === ColumnType.matchedMultiSelect || col.type === ColumnType.matchedMultiSelectOptions
        col = {
          ...col,
          matchedOptions,
          type: isMulti
            ? allMatched
              ? ColumnType.matchedMultiSelectOptions
              : ColumnType.matchedMultiSelect
            : allMatched
            ? ColumnType.matchedSelectOptions
            : ColumnType.matchedSelect,
        } as Column<T>
      }

      result[columnIndex] = col
    })
  })

  return result
}
