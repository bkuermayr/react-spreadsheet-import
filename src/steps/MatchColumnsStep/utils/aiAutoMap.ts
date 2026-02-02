import { generateText } from "ai"
import type { MatchedOptions } from "../MatchColumnsStep"
import type { SelectOption } from "../../../types"

type AiAutoMapParams = {
  entries: string[]
  fieldOptions: readonly SelectOption[]
  aiApiKey?: string
  aiModel?: string
  customValueMappingPrompt?: (optionsList: string, entriesList: string, entriesCount: number) => string
}

type AiAutoMapResult<T> = {
  mappings: MatchedOptions<T>[]
  error?: string
}

type MappingResponse = {
  mappings: Array<{
    entry: string
    value: string | null
  }>
}

export const aiAutoMapSelectValues = async <T extends string>({
  entries,
  fieldOptions,
  aiApiKey,
  aiModel = "openai/gpt-5-mini",
  customValueMappingPrompt,
}: AiAutoMapParams): Promise<AiAutoMapResult<T>> => {
  // AI SDK uses the model string directly (e.g., "openai/gpt-5-mini", "gemini-3-pro")
  // The API key is configured via environment variables or AI Gateway

  try {
    // Prepare options for the prompt
    const optionsList = fieldOptions.map((opt) => `- "${opt.label}" (value: "${opt.value}")`).join("\n")
    const entriesList = entries.map((e, i) => `${i + 1}. "${e}"`).join("\n")

    // Use custom prompt if provided, otherwise use the default prompt
    const defaultPrompt = `You are a data mapping assistant. Map the following entries to the most appropriate option from the available options list.

Available options:
${optionsList}

Entries to map:
${entriesList}

For each entry, return the "value" (not label) of the best matching option, considering semantic similarity, abbreviations, synonyms, and partial matches.
IMPORTANT: If no option is a clear semantic match, you MUST return null for that entry's value. Do NOT force a mapping when there is no fitting value.

IMPORTANT: Return ONLY a valid JSON object with no other text, in this exact format:
{"mappings":[{"entry":"original entry text","value":"matched value or null"},...]}

Return exactly ${entries.length} mappings, one for each entry in the same order.`

    const prompt = customValueMappingPrompt
      ? customValueMappingPrompt(optionsList, entriesList, entries.length)
      : defaultPrompt

    // Use AI SDK with model string directly - works with AI Gateway
    // Model format: "provider/model" (e.g., "openai/gpt-5-mini", "gemini-3-pro")
    const { text } = await generateText({
      model: aiModel as any,
      prompt,
    })

    // Parse the response with error handling
    let parsed: MappingResponse
    try {
      const cleanedText = text
        .trim()
        .replace(/^```json\n?/, "")
        .replace(/\n?```$/, "")
      parsed = JSON.parse(cleanedText) as MappingResponse
    } catch (parseError) {
      console.error("Failed to parse AI response:", text)
      return {
        mappings: entries.map((entry) => ({ entry, value: undefined as unknown as T })),
        error: "Failed to parse AI response",
      }
    }

    // Validate response structure
    if (!parsed || !Array.isArray(parsed.mappings)) {
      return {
        mappings: entries.map((entry) => ({ entry, value: undefined as unknown as T })),
        error: "Invalid AI response structure",
      }
    }

    // Convert the response to the expected format
    const mappings = parsed.mappings.map((m) => ({
      entry: m.entry,
      value: (m.value || undefined) as T,
    }))

    return { mappings }
  } catch (error) {
    console.error("AI automap error:", error)
    return {
      mappings: entries.map((entry) => ({ entry, value: undefined as unknown as T })),
      error: error instanceof Error ? error.message : "AI mapping failed",
    }
  }
}
