import {
  ColumnType,
  MatchedOptions,
  MatchedSelectColumn,
  MatchedSelectOptionsColumn,
  MatchedMultiSelectColumn,
  MatchedMultiSelectOptionsColumn,
} from "../MatchColumnsStep"

export const setSubColumn = <T>(
  oldColumn:
    | MatchedSelectColumn<T>
    | MatchedSelectOptionsColumn<T>
    | MatchedMultiSelectColumn<T>
    | MatchedMultiSelectOptionsColumn<T>,
  entry: string,
  value: string,
):
  | MatchedSelectColumn<T>
  | MatchedSelectOptionsColumn<T>
  | MatchedMultiSelectColumn<T>
  | MatchedMultiSelectOptionsColumn<T> => {
  const options = oldColumn.matchedOptions.map((option) => (option.entry === entry ? { ...option, value } : option))
  const allMathced = options.every(({ value }) => !!value)

  if (oldColumn.type === ColumnType.matchedMultiSelect || oldColumn.type === ColumnType.matchedMultiSelectOptions) {
    if (allMathced) {
      return {
        ...oldColumn,
        matchedOptions: options as MatchedOptions<T>[],
        type: ColumnType.matchedMultiSelectOptions,
      }
    } else {
      return { ...oldColumn, matchedOptions: options as MatchedOptions<T>[], type: ColumnType.matchedMultiSelect }
    }
  }

  if (allMathced) {
    return { ...oldColumn, matchedOptions: options as MatchedOptions<T>[], type: ColumnType.matchedSelectOptions }
  } else {
    return { ...oldColumn, matchedOptions: options as MatchedOptions<T>[], type: ColumnType.matchedSelect }
  }
}
