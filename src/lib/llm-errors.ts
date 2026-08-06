import { APICallError, NoObjectGeneratedError, RetryError } from "ai";

export type LlmErrorCode =
  | "invalid_key"
  | "bad_model"
  | "no_credit"
  | "rate_limited"
  | "provider_unreachable"
  | "provider_error";

export type MappedLlmError = {
  code: LlmErrorCode;
  /** Safe to show a visitor. Never contains the key or a raw provider body. */
  message: string;
  /** HTTP status our own route should return. */
  status: number;
};

/** A retryable failure arrives wrapped in RetryError; dig the APICallError out. */
function unwrap(err: unknown): unknown {
  if (RetryError.isInstance(err)) {
    const inner = err.errors.find((e) => APICallError.isInstance(e));
    return inner ?? err.lastError ?? err;
  }
  return err;
}

function looksLikeQuota(body: string | undefined): boolean {
  if (!body) return false;
  return /insufficient_quota|insufficient[_ ]balance|billing|credit/i.test(
    body,
  );
}

export function mapProviderError(
  err: unknown,
  providerLabel: string,
  model: string,
): MappedLlmError {
  const e = unwrap(err);

  if (APICallError.isInstance(e)) {
    const status = e.statusCode;

    if (status === 401 || status === 403) {
      return {
        code: "invalid_key",
        message: `${providerLabel} rejected this key. Check it is still active, then paste it again.`,
        status: 400,
      };
    }
    if (status === 402 || looksLikeQuota(e.responseBody)) {
      return {
        code: "no_credit",
        message: `This ${providerLabel} account is out of credit. Add credit, or switch to a provider with a free key.`,
        status: 400,
      };
    }
    if (status === 404) {
      return {
        code: "bad_model",
        message: `${providerLabel} has no model called ${model}. Pick a model your key can reach.`,
        status: 400,
      };
    }
    if (status === 429) {
      return {
        code: "rate_limited",
        message: `${providerLabel} is rate limiting this key. Wait a moment, then try again.`,
        status: 429,
      };
    }
    if (status === undefined) {
      return {
        code: "provider_unreachable",
        message: `Could not reach ${providerLabel}. Check the base URL and your connection.`,
        status: 502,
      };
    }
    return {
      code: "provider_error",
      message: `${providerLabel} returned an error (HTTP ${status}). Try again in a moment.`,
      status: 502,
    };
  }

  if (NoObjectGeneratedError.isInstance(e)) {
    return {
      code: "provider_error",
      message: `${model} did not return usable suggestions. Try again, or pick a different model.`,
      status: 502,
    };
  }

  // fetch() rejects with a TypeError on DNS failure, refused connection or CORS.
  if (e instanceof TypeError && /fetch/i.test(e.message)) {
    return {
      code: "provider_unreachable",
      message: `Could not reach ${providerLabel}. Check the base URL and your connection.`,
      status: 502,
    };
  }

  return {
    code: "provider_error",
    message: `Something went wrong talking to ${providerLabel}. Try again in a moment.`,
    status: 502,
  };
}
