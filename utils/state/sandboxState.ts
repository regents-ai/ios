let sandboxMode = true;

export function getSandboxMode() {
  return sandboxMode;
}

export function setSandboxMode(enabled: boolean) {
  sandboxMode = enabled;
}

export async function hydrateSandboxMode() {
  sandboxMode = true;
}
