import { rootId } from "../Providers"
import { Select } from "chakra-react-select"
import type { SelectOption } from "../../types"
import { useStyleConfig } from "@chakra-ui/react"
import type { themeOverrides } from "../../theme"

interface Props {
  onChange: (values: readonly SelectOption[]) => void
  value: readonly SelectOption[]
  options: readonly SelectOption[]
}

export const TableMultiSelect = ({ onChange, value, options }: Props) => {
  const styles = useStyleConfig(
    "ValidationStep",
  ) as (typeof themeOverrides)["components"]["ValidationStep"]["baseStyle"]
  return (
    <Select<SelectOption, true>
      isMulti
      autoFocus
      useBasicStyles
      size="sm"
      value={value}
      onChange={onChange}
      placeholder=" "
      closeMenuOnScroll
      menuPosition="fixed"
      menuIsOpen
      menuPortalTarget={document.getElementById(rootId)}
      options={options}
      chakraStyles={styles.select}
    />
  )
}
