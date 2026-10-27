export interface UpdatePreferencesInput {
  locations?: string[];
  remote_preference?: 'FULLY_REMOTE' | 'HYBRID' | 'ON_SITE' | 'UNSPECIFIED';
  min_salary?: number;
  currency?: 'BDT' | 'USD';
}

export interface UpdateOnboardingInput {
  completed?: boolean;
  step?: number;
}

export interface UpdateProfileDto {
  name?: string;
  title?: string;
  skills?: string[];
  preferences?: UpdatePreferencesInput;
  onboarding?: UpdateOnboardingInput;
}

export function validateUpdateProfileInput(data: unknown): UpdateProfileDto {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const input = data as Record<string, unknown>;
  const validated: UpdateProfileDto = {};

  if (typeof input.name === 'string') {
    validated.name = input.name.trim().slice(0, 100);
  }

  if (typeof input.title === 'string') {
    validated.title = input.title.trim().slice(0, 100);
  }

  if (Array.isArray(input.skills)) {
    validated.skills = input.skills
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim().slice(0, 50))
      .slice(0, 50); // Bounded array ceiling
  }

  if (input.preferences && typeof input.preferences === 'object') {
    const prefs = input.preferences as Record<string, unknown>;
    validated.preferences = {};

    if (Array.isArray(prefs.locations)) {
      validated.preferences.locations = prefs.locations
        .filter(
          (l): l is string => typeof l === 'string' && l.trim().length > 0,
        )
        .map((l) => l.trim().slice(0, 60))
        .slice(0, 10);
    }

    const validRemote = ['FULLY_REMOTE', 'HYBRID', 'ON_SITE', 'UNSPECIFIED'];
    if (
      typeof prefs.remote_preference === 'string' &&
      validRemote.includes(prefs.remote_preference)
    ) {
      validated.preferences.remote_preference =
        prefs.remote_preference as UpdatePreferencesInput['remote_preference'];
    }

    if (
      typeof prefs.min_salary === 'number' &&
      prefs.min_salary >= 0 &&
      Number.isFinite(prefs.min_salary)
    ) {
      validated.preferences.min_salary = Math.round(prefs.min_salary);
    }

    if (prefs.currency === 'BDT' || prefs.currency === 'USD') {
      validated.preferences.currency = prefs.currency;
    }
  }

  if (input.onboarding && typeof input.onboarding === 'object') {
    const onb = input.onboarding as Record<string, unknown>;
    validated.onboarding = {};

    if (typeof onb.completed === 'boolean') {
      validated.onboarding.completed = onb.completed;
    }

    if (
      typeof onb.step === 'number' &&
      Number.isInteger(onb.step) &&
      onb.step >= 0 &&
      onb.step <= 10
    ) {
      validated.onboarding.step = onb.step;
    }
  }

  return validated;
}
