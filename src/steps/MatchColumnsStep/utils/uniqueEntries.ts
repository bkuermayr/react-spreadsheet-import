import uniqBy from "lodash/uniqBy"
import type { MatchColumnsProps, MatchedOptions } from "../MatchColumnsStep"

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
      return cellValue.split(separator).map((entry) => {
        let value = entry.trim()
        // Special handling for "categories" field: extract only the leaf (last segment) from each category path
        // e.g., "Default Category > Shop > Pferdedecken" becomes "Pferdedecken"
        if (fieldKey === "categories" && value.includes(" > ")) {
          const segments = value.split(" > ")
          value = segments[segments.length - 1].trim()
        }
        return { entry: value }
      })
    }),
    "entry",
  ).filter(({ entry }) => !!entry)
