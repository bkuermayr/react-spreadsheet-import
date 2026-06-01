import uniqBy from "lodash/uniqBy"
import type { MatchColumnsProps, MatchedOptions } from "../MatchColumnsStep"
import { splitCategoryLeaves } from "./splitCategoryLeaves"

export const uniqueEntries = <T extends string>(
  data: MatchColumnsProps<T>["data"],
  index: number,
): Partial<MatchedOptions<T>>[] =>
  uniqBy(
    data.map((row) => ({ entry: row[index] })),
    "entry",
  ).filter(({ entry }) => !!entry)

export const uniqueEntriesWithSeparator = <T extends string>(
  data: MatchColumnsProps<T>["data"],
  index: number,
  separator: string,
  fieldKey?: string,
): Partial<MatchedOptions<T>>[] =>
  uniqBy(
    data.flatMap((row) => {
      const cellValue = row[index]
      if (!cellValue) return []
      // Categories: split into leaves, accepting both the canonical ("$#" / " > ")
      // and Magento/Odoo (";" / " / ") separators.
      if (fieldKey === "categories") {
        return splitCategoryLeaves(cellValue, separator).map((entry) => ({ entry }))
      }
      return cellValue.split(separator).map((entry) => ({ entry: entry.trim() }))
    }),
    "entry",
  ).filter(({ entry }) => !!entry)
