/**
 * Split a "categories" cell into leaf category names, accepting BOTH:
 *   - the canonical format: categories separated by `separator` (e.g. "$#"),
 *     path segments separated by " > "; and
 *   - the Magento/Odoo export format: categories separated by ";",
 *     path segments separated by " / ".
 * Only the space-padded " / " is treated as a path separator, so a leaf name
 * containing a bare slash (e.g. "Schwarz/Weiß") is left intact.
 *
 * e.g. "Default Category / Shop / Reitbekleidung; Default Category / Shop / Handschuhe"
 *   -> ["Reitbekleidung", "Handschuhe"]
 */
export const splitCategoryLeaves = (cellValue: string, separator: string): string[] => {
  if (!cellValue) return []
  return cellValue
    .split(separator)
    .flatMap((part) => part.split(";"))
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) => {
      const segments = path.split(/ > | \/ /)
      return segments[segments.length - 1].trim()
    })
    .filter(Boolean)
}
