import { BadRequestException } from '@nestjs/common';

export interface DeleteAccountDto {
  confirmation: 'DELETE_MY_ACCOUNT';
  reason?: string;
}

export function validateDeleteAccountInput(data: unknown): DeleteAccountDto {
  if (!data || typeof data !== 'object') {
    throw new BadRequestException({
      code: 'INVALID_REQUEST_PAYLOAD',
      message:
        'Request body must be an object with confirmation: "DELETE_MY_ACCOUNT".',
    });
  }

  const input = data as Record<string, unknown>;
  if (input.confirmation !== 'DELETE_MY_ACCOUNT') {
    throw new BadRequestException({
      code: 'CONFIRMATION_REQUIRED',
      message:
        'Account erasure requires explicit confirmation with "DELETE_MY_ACCOUNT".',
    });
  }

  return {
    confirmation: 'DELETE_MY_ACCOUNT',
    reason:
      typeof input.reason === 'string' ? input.reason.slice(0, 500) : undefined,
  };
}
