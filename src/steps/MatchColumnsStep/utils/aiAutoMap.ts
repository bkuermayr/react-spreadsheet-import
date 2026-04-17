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
  /**
   * Optional server-side proxy URL. When provided, all LLM calls are routed
   * through this endpoint instead of calling OpenAI directly from the
   * browser. Prevents leaking the OpenAI API key to the client.
   */
  aiProxyUrl?: string
  aiModel?: string
  customValueMappingPrompt?: (optionsList: string, entriesList: string, entriesCount: number) => string
}

/** Minimal shape returned by a caller-supplied proxy endpoint. */
type GenerateTextFn = (args: { prompt: string; model: string }) => Promise<string>

const buildProxyGenerateText = (proxyUrl: string): GenerateTextFn => async ({ prompt, model }) => {
  const response = await fetch(proxyUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model }),
  })

  if (!response.ok) {
    // Surface server-side error messages when they're JSON-encoded.
    let detail = `HTTP ${response.status}`
    try {
      const body = await response.json()
      if (body?.error) detail = String(body.error)
    } catch {
      // non-JSON body — keep the status code
    }
    throw new Error(`AI proxy error: ${detail}`)
  }

  const body = (await response.json()) as { text?: string; error?: string }
  if (body.error) throw new Error(body.error)
  if (typeof body.text !== "string") throw new Error("AI proxy returned no text")
  return body.text
}

const buildOpenAiGenerateText = (apiKey: string): GenerateTextFn => {
  const openai = createOpenAI({ apiKey })
  return async ({ prompt, model }) => {
    const response = await generateText({ model: openai(model), prompt })
    return response.text
  }
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
  generateText: generate,
  aiModel,
  customValueMappingPrompt,
}: {
  entries: string[]
  fieldOptions: readonly SelectOption[]
  generateText: GenerateTextFn
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
    text = await generate({ model: aiModel, prompt })
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
    if (!rawValue || rawValue === "null") return { entry, value: undefined as unknown as T }

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

const STRIP_PREFIXES = ["kinder ", "damen ", "herren "]
const STRIP_SUFFIXES = [" kinder", " für kinder", " damen", " für damen", " herren", " für herren"]

/**
 * Local fallback: for entries the AI couldn't match, try matching the
 * rightmost path segments against option labels (most-specific first).
 *
 * Matching levels per segment:
 *   1. Exact label match
 *   2. Case-insensitive label match
 *   3. Stripped segment match (remove gender/age prefixes like "Kinder ", "Damen ")
 *   4. Contains match (label ⊂ segment or segment ⊂ label, min 5 chars)
 */
const localSegmentMatch = <T extends string>(
  entry: string,
  labelToValue: Map<string, T>,
  lowerLabelToValue: Map<string, T>,
  lowerLabels: string[],
  lowerLabelToOriginal: Map<string, string>,
): T | undefined => {
  const segments = entry
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .reverse()

  // Level 1 & 2: exact / case-insensitive
  for (const seg of segments) {
    const exact = labelToValue.get(seg)
    if (exact) return exact
    const ci = lowerLabelToValue.get(seg.toLowerCase())
    if (ci) return ci
  }

  // Level 3: strip gender/age qualifiers from segment and retry
  for (const seg of segments) {
    let stripped = seg.toLowerCase()
    for (const p of STRIP_PREFIXES) {
      if (stripped.startsWith(p)) stripped = stripped.slice(p.length)
    }
    for (const s of STRIP_SUFFIXES) {
      if (stripped.endsWith(s)) stripped = stripped.slice(0, -s.length)
    }
    if (stripped !== seg.toLowerCase()) {
      const ci = lowerLabelToValue.get(stripped)
      if (ci) return ci
    }
  }

  // Level 4: contains match (longest label that's contained in or contains segment)
  for (const seg of segments) {
    const lower = seg.toLowerCase()
    if (lower.length < 5) continue
    let bestMatch: string | undefined
    let bestLen = 0
    for (const ll of lowerLabels) {
      if (ll.length < 5) continue
      if (lower.includes(ll) && ll.length > bestLen) {
        bestMatch = ll
        bestLen = ll.length
      } else if (ll.includes(lower) && lower.length > bestLen) {
        bestMatch = ll
        bestLen = lower.length
      }
    }
    if (bestMatch) {
      const orig = lowerLabelToOriginal.get(bestMatch)
      if (orig) {
        const v = labelToValue.get(orig)
        if (v) return v
      }
    }
  }

  return undefined
}

export const aiAutoMapSelectValues = async <T extends string>({
  entries,
  fieldOptions,
  aiApiKey,
  aiProxyUrl,
  aiModel = "gpt-5-mini",
  customValueMappingPrompt,
}: AiAutoMapParams): Promise<AiAutoMapResult<T>> => {
  if (!aiProxyUrl && !aiApiKey) {
    console.error("AI auto-map: no proxy URL or API key configured")
    return {
      mappings: entries.map((entry) => ({ entry, value: undefined as unknown as T })),
      error: "AI auto-map requires either aiProxyUrl or aiApiKey to be set.",
    }
  }

  try {
    // Prefer the proxy when both are supplied — it keeps the OpenAI key
    // off the client entirely.
    const generate: GenerateTextFn = aiProxyUrl
      ? buildProxyGenerateText(aiProxyUrl)
      : buildOpenAiGenerateText(aiApiKey as string)

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
            generateText: generate,
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

    const aiMapped = allMappings.filter((m) => m.value).length
    console.log(`[aiAutoMap] All batches done: ${aiMapped}/${allMappings.length} mapped by AI`)

    // Local fallback: for entries the AI returned null, try segment-matching
    const labelToValue = new Map(fieldOptions.map((opt) => [opt.label, opt.value as T]))
    const lowerLabelToValue = new Map(fieldOptions.map((opt) => [opt.label.toLowerCase(), opt.value as T]))
    const lowerLabels = fieldOptions.map((opt) => opt.label.toLowerCase())
    const lowerLabelToOriginal = new Map(fieldOptions.map((opt) => [opt.label.toLowerCase(), opt.label]))

    let fallbackCount = 0
    const finalMappings = allMappings.map((m) => {
      if (m.value) return m
      const fallback = localSegmentMatch<T>(m.entry, labelToValue, lowerLabelToValue, lowerLabels, lowerLabelToOriginal)
      if (fallback) {
        fallbackCount++
        return { ...m, value: fallback }
      }
      return m
    })

    const totalMapped = finalMappings.filter((m) => m.value).length
    console.log(`[aiAutoMap] Local fallback matched ${fallbackCount} additional entries. Total: ${totalMapped}/${finalMappings.length}`)

    return {
      mappings: finalMappings,
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
