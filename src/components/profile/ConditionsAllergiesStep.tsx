import type { AllergyIntolerance, HealthCondition } from "../../types";
import { ALLERGIES_INTOLERANCES, HEALTH_CONDITIONS } from "./constants";

interface ConditionsAllergiesStepProps {
  healthConditions: HealthCondition[];
  allergiesIntolerances: AllergyIntolerance[];
  onToggleCondition: (condition: HealthCondition) => void;
  onToggleAllergy: (allergy: AllergyIntolerance) => void;
}

export default function ConditionsAllergiesStep({
  healthConditions,
  allergiesIntolerances,
  onToggleCondition,
  onToggleAllergy,
}: ConditionsAllergiesStepProps) {
  return (
    <div>
      <div className="form-field">
        <label>Health conditions</label>
        <div className="checkbox-group">
          {HEALTH_CONDITIONS.map((condition) => (
            <label key={condition} className="checkbox-option">
              <input
                type="checkbox"
                checked={healthConditions.includes(condition)}
                onChange={() => onToggleCondition(condition)}
              />
              {condition}
            </label>
          ))}
        </div>
      </div>

      {/* NOTE: this list drives the Critical Alert engine in the risk-check function — keep
          option values here in sync with the ALLERGEN_KEYWORDS map in
          netlify/functions/risk-check.js. */}
      <div className="form-field">
        <label>Allergies / intolerances</label>
        <div className="checkbox-group">
          {ALLERGIES_INTOLERANCES.map((allergy) => (
            <label key={allergy} className="checkbox-option">
              <input
                type="checkbox"
                checked={allergiesIntolerances.includes(allergy)}
                onChange={() => onToggleAllergy(allergy)}
              />
              {allergy}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
