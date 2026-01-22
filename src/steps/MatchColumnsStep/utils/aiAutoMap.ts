import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import type { MatchedOptions } from "../MatchColumnsStep"
import type { SelectOption } from "../../../types"

type AiAutoMapParams = {
  entries: string[]
  fieldOptions: readonly SelectOption[]
  aiApiKey?: string
  aiModel?: string
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
  aiModel = "openai/gpt-5-nano",
}: AiAutoMapParams): Promise<AiAutoMapResult<T>> => {
  // Try to get API key from prop first, then fall back to environment variable
  // Note: In browser environments, process.env may not be available - the aiApiKey prop should be used
  const apiKey =
    aiApiKey || (typeof process !== "undefined" && process.env ? process.env.AI_GATEWAY_API_KEY : undefined)

  if (!apiKey) {
    return {
      mappings: entries.map((entry) => ({ entry, value: undefined as unknown as T })),
      error: "AI API key is missing",
    }
  }

  try {
    // Parse the model string (format: "provider/model" or just "model")
    const modelParts = aiModel.split("/")
    const actualModel = modelParts.length > 1 ? modelParts[1] : aiModel

    // Create OpenAI provider with the API key
    const openai = createOpenAI({
      apiKey,
    })

    // Prepare options for the prompt
    const optionsList = fieldOptions.map((opt) => `- "${opt.label}" (value: "${opt.value}")`).join("\n")
    const entriesList = entries.map((e, i) => `${i + 1}. "${e}"`).join("\n")

    const { text } = await generateText({
      model: openai(actualModel),
      prompt: `You are a data mapping assistant. Map the following entries to the most appropriate option from the available options list.

Available options:
${optionsList}

Entries to map:
${entriesList}

For each entry, return the "value" (not label) of the best matching option. If no option matches well, return null for the value.
Consider semantic similarity, abbreviations, synonyms, and partial matches.

IMPORTANT: Return ONLY a valid JSON object with no other text, in this exact format:
{"mappings":[{"entry":"original entry text","value":"matched value or null"},...]}

Return exactly ${entries.length} mappings, one for each entry in the same order.`,
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
