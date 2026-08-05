export class LighterPackAuthError extends Error {
  constructor(message = 'Invalid LighterPack username and/or password.') {
    super(message);
    this.name = 'LighterPackAuthError';
  }
}

export class SyncConflictError extends Error {
  constructor(message = 'LighterPack library changed elsewhere while saving; retry the operation.') {
    super(message);
    this.name = 'SyncConflictError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(entity: string, id: number | string) {
    super(`${entity} ${id} was not found.`);
    this.name = 'NotFoundError';
  }
}

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}
