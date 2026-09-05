import type { Gender } from "../../types";

export interface BasicInfoErrors {
  name?: string;
  age?: string;
  gender?: string;
}

interface BasicInfoStepProps {
  /** Prefixes input ids so Onboarding and Settings can render this on the same page without
   * colliding (e.g. "ob" -> "ob-name", "settings" -> "settings-name"). */
  idPrefix: string;
  name: string;
  age: string;
  gender: Gender | "";
  errors?: BasicInfoErrors;
  onNameChange: (value: string) => void;
  onAgeChange: (value: string) => void;
  onGenderChange: (value: Gender) => void;
}

export default function BasicInfoStep({
  idPrefix,
  name,
  age,
  gender,
  errors,
  onNameChange,
  onAgeChange,
  onGenderChange,
}: BasicInfoStepProps) {
  return (
    <div>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          autoComplete="name"
        />
        {errors?.name && <span className="field-error">{errors.name}</span>}
      </div>

      <div className="form-field">
        <label htmlFor={`${idPrefix}-age`}>Age</label>
        <input
          id={`${idPrefix}-age`}
          type="number"
          min={1}
          max={120}
          value={age}
          onChange={(e) => onAgeChange(e.target.value)}
        />
        {errors?.age && <span className="field-error">{errors.age}</span>}
      </div>

      <div className="form-field">
        <label htmlFor={`${idPrefix}-gender`}>Gender</label>
        <select
          id={`${idPrefix}-gender`}
          value={gender}
          onChange={(e) => onGenderChange(e.target.value as Gender)}
        >
          <option value="" disabled>
            Select…
          </option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </select>
        {errors?.gender && <span className="field-error">{errors.gender}</span>}
      </div>
    </div>
  );
}
