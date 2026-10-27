import type { User, Profile } from '@prisma/client';

export interface UserPreferencesDto {
  locations: string[];
  remote_preference: string;
  min_salary: number | null;
  currency: string;
}

export interface UserOnboardingDto {
  completed: boolean;
  step: number;
}

export interface UserProfileResponseDto {
  id: string;
  email: string;
  email_verified: boolean;
  role: string;
  name: string;
  title: string | null;
  skills: string[];
  preferences: UserPreferencesDto;
  onboarding: UserOnboardingDto;
  created_at: string;
  updated_at: string;
}

export function mapToUserProfileResponse(
  user: User,
  profile: Profile | null,
): UserProfileResponseDto {
  return {
    id: user.id,
    email: user.email,
    email_verified: user.emailVerified,
    role: user.role,
    name: profile?.name || '',
    title: profile?.title || null,
    skills: profile?.skills || [],
    preferences: {
      locations: profile?.locations || [],
      remote_preference: profile?.remotePreference || 'UNSPECIFIED',
      min_salary: profile?.minSalary ?? null,
      currency: profile?.currency || 'BDT',
    },
    onboarding: {
      completed: profile?.onboardingCompleted || false,
      step: profile?.onboardingStep || 0,
    },
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}
