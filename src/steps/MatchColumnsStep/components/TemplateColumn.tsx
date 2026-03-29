import { useState } from "react"
import {
  Flex,
  Text,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionIcon,
  Box,
  AccordionPanel,
  useStyleConfig,
  Button,
  Switch,
  FormControl,
  FormLabel,
} from "@chakra-ui/react"
import { useRsi } from "../../../hooks/useRsi"
import type { Column } from "../MatchColumnsStep"
import { ColumnType } from "../MatchColumnsStep"
import { MatchIcon } from "./MatchIcon"
import type { Fields } from "../../../types"
import type { Translations } from "../../../translationsRSIProps"
import { MatchColumnSelect } from "../../../components/Selects/MatchColumnSelect"
import { SubMatchingSelect } from "./SubMatchingSelect"
import type { Styles } from "./ColumnGrid"

// Count unmapped: use strict undefined/null so value 0 or "" (valid mapped values) are not counted as unmapped
const isUnmappedOption = (option: { value?: unknown }) =>
  option.value === undefined || option.value === null

const getAccordionTitle = <T extends string>(fields: Fields<T>, column: Column<T>, translations: Translations) => {
  const fieldLabel = fields.find((field) => "value" in column && field.key === column.value)!.label
  const unmappedCount =
    "matchedOptions" in column ? column.matchedOptions.filter(isUnmappedOption).length : 0
  return `${translations.matchColumnsStep.matchDropdownTitle} ${fieldLabel} (${unmappedCount} ${translations.matchColumnsStep.unmatched})`
}

type TemplateColumnProps<T extends string> = {
  onChange: (val: T, index: number) => void
  onSubChange: (val: T, index: number, option: string) => void
  onAiAutoMap?: (columnIndex: number) => Promise<void>
  column: Column<T>
  isAiMapping?: boolean
}

export const TemplateColumn = <T extends string>({
  column,
  onChange,
  onSubChange,
  onAiAutoMap,
  isAiMapping = false,
}: TemplateColumnProps<T>) => {
  const { translations, fields } = useRsi<T>()
  const styles = useStyleConfig("MatchColumnsStep") as Styles
  const [showOnlyUnmapped, setShowOnlyUnmapped] = useState(false)
  const isIgnored = column.type === ColumnType.ignored
  const isChecked =
    column.type === ColumnType.matched ||
    column.type === ColumnType.matchedCheckbox ||
    column.type === ColumnType.matchedSelectOptions ||
    column.type === ColumnType.matchedMultiSelectOptions
  const isSelect = "matchedOptions" in column
  const selectOptions = fields.map(({ label, key }) => ({ value: key, label }))
  const selectValue = selectOptions.find(({ value }) => "value" in column && column.value === value)

  // Check if there are any unmatched options (strict: only undefined/null, so value 0 is treated as matched)
  const hasUnmatchedOptions = isSelect && column.matchedOptions.some(isUnmappedOption)

  const handleAiAutoMap = async () => {
    if (onAiAutoMap) {
      await onAiAutoMap(column.index)
    }
  }

  return (
    <Flex minH={10} w="100%" flexDir="column" justifyContent="center">
      {isIgnored ? (
        <Text sx={styles.selectColumn.text}>{translations.matchColumnsStep.ignoredColumnText}</Text>
      ) : (
        <>
          <Flex alignItems="center" minH={10} w="100%">
            <Box flex={1}>
              <MatchColumnSelect
                placeholder={translations.matchColumnsStep.selectPlaceholder}
                value={selectValue}
                onChange={(value) => onChange(value?.value as T, column.index)}
                options={selectOptions}
                name={column.header}
              />
            </Box>
            <MatchIcon isChecked={isChecked} />
          </Flex>
          {isSelect && (
            <Flex width="100%">
              <Accordion allowMultiple width="100%">
                <AccordionItem border="none" py={1}>
                  <AccordionButton
                    _hover={{ bg: "transparent" }}
                    _focus={{ boxShadow: "none" }}
                    px={0}
                    py={4}
                    data-testid="accordion-button"
                  >
                    <AccordionIcon />
                    <Box textAlign="left">
                      <Text sx={styles.selectColumn.accordionLabel}>
                        {getAccordionTitle<T>(fields, column, translations)}
                      </Text>
                    </Box>
                  </AccordionButton>
                  <AccordionPanel pb={4} pr={3} display="flex" flexDir="column">
                    <Flex mb={3} gap={3} alignItems="center" flexWrap="wrap">
                      {hasUnmatchedOptions && onAiAutoMap && (
                        <Button
                          size="sm"
                          colorScheme="purple"
                          onClick={handleAiAutoMap}
                          isLoading={isAiMapping}
                          loadingText={translations.matchColumnsStep.aiMappingInProgress}
                          data-testid="ai-automap-button"
                        >
                          {translations.matchColumnsStep.autoMapWithAiButtonTitle}
                        </Button>
                      )}
                      {hasUnmatchedOptions && (
                        <FormControl display="flex" alignItems="center" w="auto">
                          <Switch
                            id={`show-unmapped-${column.index}`}
                            size="sm"
                            isChecked={showOnlyUnmapped}
                            onChange={(e) => setShowOnlyUnmapped(e.target.checked)}
                          />
                          <FormLabel htmlFor={`show-unmapped-${column.index}`} mb={0} ml={2} fontSize="xs" cursor="pointer">
                            {translations.matchColumnsStep.showOnlyUnmapped}
                          </FormLabel>
                        </FormControl>
                      )}
                    </Flex>
                    {(showOnlyUnmapped
                      ? column.matchedOptions.filter(isUnmappedOption)
                      : column.matchedOptions
                    ).map((option) => (
                      <SubMatchingSelect option={option} column={column} onSubChange={onSubChange} key={option.entry} />
                    ))}
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            </Flex>
          )}
        </>
      )}
    </Flex>
  )
}
