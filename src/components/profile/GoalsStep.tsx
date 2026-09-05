import type { FitnessGoal } from "../../types";
import { FITNESS_GOALS } from "./constants";

interface GoalsStepProps {
  idPrefix: string;
  fitnessGoal: FitnessGoal | "";
  error?: string | null;
  onFitnessGoalChange: (goal: FitnessGoal) => void;
}

export default function GoalsStep({
  idPrefix,
  fitnessGoal,
  error,
  onFitnessGoalChange,
}: GoalsStepProps) {
  return (
    <div>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-goal`}>Fitness goal</label>
        <select
          id={`${idPrefix}-goal`}
          value={fitnessGoal}
          onChange={(e) => onFitnessGoalChange(e.target.value as FitnessGoal)}
        >
          <option value="" disabled>
            Select…
          </option>
          {FITNESS_GOALS.map((goalOption) => (
            <option key={goalOption} value={goalOption}>
              {goalOption}
            </option>
          ))}
        </select>
        {error && <span className="field-error">{error}</span>}
      </div>
    </div>
  );
}
