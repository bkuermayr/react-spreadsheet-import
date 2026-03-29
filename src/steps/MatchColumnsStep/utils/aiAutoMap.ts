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

type MappingResponse = Array<string | null>

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

  const defaultPrompt = `You are a data mapping assistant. Map each entry below to the best matching option.

Available options:
${optionsList}

Entries to map:
${entriesList}

Rules:
- Return the "value" (not label) of the best matching option.
- Consider semantic similarity, abbreviations, synonyms, partial matches, sub-categories, and parent-child relationships.
- If an entry is a sub-category or variant of an option, map it to the closest parent or related option.
- Only return null when there is truly no reasonable match at all.

Return ONLY a valid JSON array with no other text, in this exact format:
["matched value or null","matched value or null",...]

Return exactly ${entries.length} values in the same order as the entries.`

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

  if (!Array.isArray(parsed)) {
    return {
      mappings: entries.map((entry) => ({ entry, value: undefined as unknown as T })),
      error: "Invalid AI response structure",
    }
  }

  // Index-based matching: pair each AI value with its original entry by position.
  // This avoids relying on the AI echoing entry text back exactly.
  const mappings = entries.map((entry, i) => ({
    entry,
    value: (parsed[i] || undefined) as T,
  }))

  return { mappings }
}

export const aiAutoMapSelectValues = async <T extends string>({
  entries,
  fieldOptions,
  aiApiKey,
  aiModel = "gpt-5",
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
