import { defaultTheme } from "../../../ReactSpreadsheetImport"
import { MatchColumnsStep } from "../MatchColumnsStep"
import { Providers } from "../../../components/Providers"
import { mockRsiValues } from "../../../stories/mockRsiValues"
import { ModalWrapper } from "../../../components/ModalWrapper"

export default {
  title: "Match Columns Steps",
  parameters: {
    layout: "fullscreen",
  },
}

const mockData = [
  ["id", "first_name", "last_name", "email", "gender", "ip_address"],
  ["2", "Geno", "Gencke", "ggencke0@tinypic.com", "Female", "17.204.180.40"],
  ["3", "Bertram", "Twyford", "btwyford1@seattletimes.com", "Genderqueer", "188.98.2.13"],
  ["4", "Tersina", "Isacke", "tisacke2@edublogs.org", "Non-binary", "237.69.180.31"],
  ["5", "Yoko", "Guilliland", "yguilliland3@elegantthemes.com", "Male", "179.123.237.119"],
  ["6", "Freida", "Fearns", "ffearns4@fotki.com", "Male", "184.48.15.1"],
  ["7", "Mildrid", "Mount", "mmount5@last.fm", "Male", "26.97.160.103"],
  ["8", "Jolene", "Darlington", "jdarlington6@jalbum.net", "Agender", "172.14.232.84"],
  ["9", "Craig", "Dickie", "cdickie7@virginia.edu", "Male", "143.248.220.47"],
  ["10", "Jere", "Shier", "jshier8@comcast.net", "Agender", "10.143.62.161"],
]

const mockDataWithSkills = [
  ["name", "surname", "skills", "team"],
  ["John", "Doe", "JavaScript;TypeScript", "Team One"],
  ["Jane", "Smith", "React;Node.js", "Team Two"],
  ["Bob", "Johnson", "JavaScript;React;TypeScript", "Team One"],
  ["Alice", "Brown", "Node.js", "Team Two"],
]

// Mock data with unmatched values (abbreviations and variations)
const mockDataWithUnmatchedValues = [
  ["name", "surname", "skills", "team"],
  ["John", "Doe", "JS;TS", "T1"], // Abbreviations that won't auto-match
  ["Jane", "Smith", "ReactJS;NodeJS", "T2"],
  ["Bob", "Johnson", "Javascript;typescript", "team 1"], // Case variations
  ["Alice", "Brown", "node", "team 2"],
]

export const Basic = () => (
  <Providers theme={defaultTheme} rsiValues={mockRsiValues}>
    <ModalWrapper isOpen={true} onClose={() => {}}>
      <MatchColumnsStep headerValues={mockData[0] as string[]} data={mockData.slice(1)} onContinue={() => {}} />
    </ModalWrapper>
  </Providers>
)

export const WithMultiSelect = () => (
  <Providers theme={defaultTheme} rsiValues={{ ...mockRsiValues, autoMapSelectValues: true }}>
    <ModalWrapper isOpen={true} onClose={() => {}}>
      <MatchColumnsStep
        headerValues={mockDataWithSkills[0] as string[]}
        data={mockDataWithSkills.slice(1)}
        onContinue={(data) => {
          console.log("Data with multi_select:", data)
        }}
      />
    </ModalWrapper>
  </Providers>
)

export const WithUnmatchedValuesForAI = () => (
  <Providers
    theme={defaultTheme}
    rsiValues={{
      ...mockRsiValues,
      autoMapSelectValues: false, // Disable auto-matching to show AI button
    }}
  >
    <ModalWrapper isOpen={true} onClose={() => {}}>
      <MatchColumnsStep
        headerValues={mockDataWithUnmatchedValues[0] as string[]}
        data={mockDataWithUnmatchedValues.slice(1)}
        onContinue={(data) => {
          console.log("Data with unmatched values:", data)
        }}
      />
    </ModalWrapper>
  </Providers>
)
