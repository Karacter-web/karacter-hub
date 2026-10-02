const ENV_FILE_PATH = /(?:^|\/)\.env(?:\.[^/]*)?$/i;
const SECRET_NAME = /\b([A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|SECRET|PASSWORD|DATABASE_URL|CONNECTION_STRING)[A-Z0-9_]*)\b(\s*[:=]\s*)(["']?)([^"'\s,;]+)(["']?)/gi;
const NAMED_SECRET = /\b(apiKey|accessToken|authToken|clientSecret|password|connectionString)\b(\s*:\s*)(["'])(.*?)\3/gi;
const POSTGRES_URL = /postgres(?:ql)?:\/\/[^\s"'<>]+/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const KNOWN_TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,})\b/g;

export function redactSecretValues(value: string) {
  return value
    .replace(POSTGRES_URL, 'postgresql://[REDACTED]')
    .replace(BEARER_TOKEN, 'Bearer [REDACTED]')
    .replace(KNOWN_TOKEN, '[REDACTED]')
    .replace(SECRET_NAME, '$1$2[REDACTED]')
    .replace(NAMED_SECRET, '$1$2"[REDACTED]"');
}

export function removeSecretFilesFromContext<T extends { path: string; content: string }>(files: T[]) {
  return files
    .filter(file => !ENV_FILE_PATH.test(file.path))
    .map(file => ({ ...file, content: redactSecretValues(file.content) }));
}