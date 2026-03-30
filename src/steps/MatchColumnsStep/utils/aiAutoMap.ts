import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import pLimit from "p-limit"
import type { MatchedOptions } from "../MatchColumnsStep"
import type { SelectOption } from "../../../types"

const BATCH_SIZE = 50
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
- You MUST only use values from the "Available options" list above. Do NOT invent new values.

Return ONLY a valid JSON object with no other text, in this exact format:
{"mappings":[{"entry":"original entry text","value":"matched value or null"},...]}

Return exactly ${entries.length} mappings, one for each entry in the same order.`

  const prompt = customValueMappingPrompt
    ? customValueMappingPrompt(optionsList, entriesList, entries.length)
    : defaultPrompt

  let text: string
  try {
    const response = await generateText({
      model: openai(aiModel),
      prompt,
    })
    text = response.text
  } catch (apiError) {
    console.error("[aiAutoMap] API call failed:", apiError)
    return {
      mappings: entries.map((entry) => ({ entry, value: undefined as unknown as T })),
      error: `API call failed: ${apiError instanceof Error ? apiError.message : String(apiError)}`,
    }
  }

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

  // Build lookup structures for validation and fuzzy correction
  const validValues = new Set(fieldOptions.map((opt) => opt.value))
  const lowerToValue = new Map(fieldOptions.map((opt) => [opt.value.toLowerCase(), opt.value]))
  const optionsByLength = [...fieldOptions].sort((a, b) => b.value.length - a.value.length)

  // Index-based matching with multi-level validation to prevent
  // hallucinated category names while recovering near-misses.
  const mappings = entries.map((entry, i) => {
    const rawValue = i < parsed.mappings.length ? parsed.mappings[i]?.value : null
    if (!rawValue) return { entry, value: undefined as unknown as T }

    if (validValues.has(rawValue)) {
      return { entry, value: rawValue as T }
    }

    const lowerVal = rawValue.toLowerCase()

    const ciMatch = lowerToValue.get(lowerVal)
    if (ciMatch) {
      return { entry, value: ciMatch as T }
    }

    // Substring fallback: if the AI composed a value like
    // "RidersChoice Reithosen - Jeansreithosen", find the longest
    // option value that's contained within the AI's response.
    const substringMatch = optionsByLength.find(
      (opt) => opt.value.length >= 3 && lowerVal.includes(opt.value.toLowerCase()),
    )
    if (substringMatch) {
      return { entry, value: substringMatch.value as T }
    }

    return { entry, value: undefined as unknown as T }
  })

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

    // Split entries into batches to avoid hitting model output token limits
    // and API timeouts. With 500+ options, even 150 entries per batch
    // produces prompts large enough to cause multi-minute responses.
    const batches: string[][] = []
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      batches.push(entries.slice(i, i + BATCH_SIZE))
    }

    const limit = pLimit(CONCURRENCY)

    console.log(`[aiAutoMap] ${entries.length} entries, ${fieldOptions.length} options, ${batches.length} batches (size=${BATCH_SIZE}, concurrency=${CONCURRENCY})`)

    const batchResults = await Promise.all(
      batches.map((batch, idx) =>
        limit(() => {
          console.log(`[aiAutoMap] Batch ${idx + 1}/${batches.length}: sending ${batch.length} entries...`)
          return mapBatch<T>({
            entries: batch,
            fieldOptions,
            openai,
            aiModel,
            customValueMappingPrompt,
          }).then((res) => {
            const mapped = res.mappings.filter((m) => m.value).length
            console.log(`[aiAutoMap] Batch ${idx + 1}/${batches.length}: done — ${mapped}/${batch.length} mapped${res.error ? `, error: ${res.error}` : ""}`)
            return res
          })
        }),
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

    const totalMapped = allMappings.filter((m) => m.value).length
    console.log(`[aiAutoMap] All batches done: ${totalMapped}/${allMappings.length} mapped total`)

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
