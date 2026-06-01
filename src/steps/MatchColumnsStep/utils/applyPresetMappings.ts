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
      // unmapped; we resolve each value ourselves below.
      let col = setColumn(result[columnIndex], field, data, false, multiSelectValueSeparator)

      if ("matchedOptions" in col && Array.isArray((col as any).matchedOptions)) {
        // Build a case-insensitive option lookup (by value AND label).
        const fieldType = field.fieldType as { type: string; options?: { label: string; value: string }[] }
        const optionByNorm = new Map<string, string>()
        ;(fieldType.options || []).forEach((o) => {
          optionByNorm.set(String(o.value).trim().toLowerCase(), o.value)
          optionByNorm.set(String(o.label).trim().toLowerCase(), o.value)
        })
        const valueMap = selectFieldMappings[fieldKey] || {}

        const matchedOptions = (col as any).matchedOptions.map((opt: Partial<MatchedOptions<T>>) => {
          if (opt.entry === undefined) return opt
          // 1) explicit template rule wins (keyed by the raw source value)
          if (valueMap[opt.entry] !== undefined) return { ...opt, value: valueMap[opt.entry] as T }
          // 2) otherwise auto-map to an existing option, case-insensitively
          const optionMatch = optionByNorm.get(String(opt.entry).trim().toLowerCase())
          if (optionMatch !== undefined) return { ...opt, value: optionMatch as T }
          // 3) leave unmapped (created/passed through on import per settings)
          return opt
        })

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
