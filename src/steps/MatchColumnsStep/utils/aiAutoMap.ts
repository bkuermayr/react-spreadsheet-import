import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import pLimit from "p-limit"
import type { MatchedOptions } from "../MatchColumnsStep"
import type { SelectOption } from "../../../types"

const BATCH_SIZE = 150
const CONCURRENCY = 3

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

const mapBatch = async <T extends string>({
  entries,
  fieldOptions,
  openai,
  aiModel,
  customValueMappingPrompt,
}: {
  entries: string[]
  fieldOptions: readonly SelectOption[]
  openai: ReturnType<typeof createOpenAI>
  aiModel: string
  customValueMappingPrompt?: AiAutoMapParams["customValueMappingPrompt"]
}): Promise<AiAutoMapResult<T>> => {
  const optionsList = fieldOptions.map((opt) => `- "${opt.label}" (value: "${opt.value}")`).join("\n")
  const entriesList = entries.map((e, i) => `${i + 1}. "${e}"`).join("\n")

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

  const { text } = await generateText({
    model: openai(aiModel),
    prompt,
  })

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

  if (!parsed || !Array.isArray(parsed.mappings)) {
    return {
      mappings: entries.map((entry) => ({ entry, value: undefined as unknown as T })),
      error: "Invalid AI response structure",
    }
  }

  const mappings = parsed.mappings.map((m) => ({
    entry: m.entry,
    value: (m.value || undefined) as T,
  }))

  return { mappings }
}

export const aiAutoMapSelectValues = async <T extends string>({
  entries,
  fieldOptions,
  aiApiKey,
  aiModel = "gpt-5-mini",
  customValueMappingPrompt,
}: AiAutoMapParams): Promise<AiAutoMapResult<T>> => {
  if (!aiApiKey) {
    console.error("AI API key is missing")
    return {
      mappings: entries.map((entry) => ({ entry, value: undefined as unknown as T })),
      error: "AI API key is missing. Please provide aiApiKey prop.",
    }
  }

  try {
    const openai = createOpenAI({
      apiKey: aiApiKey,
    })

    // Split entries into batches to avoid hitting model output token limits.
    // A single large response with 400+ mappings frequently gets truncated,
    // causing either a JSON parse failure or silently missing entries.
    const batches: string[][] = []
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      batches.push(entries.slice(i, i + BATCH_SIZE))
    }

    const limit = pLimit(CONCURRENCY)

    const batchResults = await Promise.all(
      batches.map((batch) =>
        limit(() =>
          mapBatch<T>({
            entries: batch,
            fieldOptions,
            openai,
            aiModel,
            customValueMappingPrompt,
          }),
        ),
      ),
    )

    const allMappings: MatchedOptions<T>[] = []
    const errors: string[] = []
    for (const result of batchResults) {
      allMappings.push(...result.mappings)
      if (result.error) {
        errors.push(result.error)
      }
    }

    return {
      mappings: allMappings,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    }
  } catch (error) {
    console.error("AI automap error:", error)
    return {
      mappings: entries.map((entry) => ({ entry, value: undefined as unknown as T })),
      error: error instanceof Error ? error.message : "AI mapping failed",
    }
  }
}
