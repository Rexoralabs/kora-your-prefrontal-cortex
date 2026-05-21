// E2B Sandbox helper — runs Python in an ephemeral cloud micro-VM.
import { Sandbox } from "@e2b/code-interpreter";

export interface SandboxRunResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  artifacts?: { path: string; bytes?: number }[];
  error?: string;
}

export async function runPython(
  code: string,
  opts: { env?: Record<string, string>; timeoutMs?: number; requirements?: string } = {},
): Promise<SandboxRunResult> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    return {
      stdout: "",
      stderr: "E2B_API_KEY missing — cannot execute autonomous skill.",
      exit_code: 127,
      duration_ms: 0,
    };
  }
  const t0 = Date.now();
  let sbx: Sandbox | undefined;
  try {
    sbx = await Sandbox.create({ apiKey, timeoutMs: opts.timeoutMs ?? 60_000, envs: opts.env });
    console.log(`[kora.sandbox] up sandbox=${sbx.sandboxId}`);

    if (opts.requirements && opts.requirements.trim()) {
      const pkgs = opts.requirements
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .join(" ");
      if (pkgs) {
        const install = await sbx.runCode(
          `import subprocess, sys\nprint(subprocess.run([sys.executable,'-m','pip','install','--quiet',*'${pkgs}'.split()], capture_output=True, text=True).stderr[-400:])`,
        );
        if (install.error) {
          return {
            stdout: "",
            stderr: `pip install failed: ${install.error.value}`,
            exit_code: 1,
            duration_ms: Date.now() - t0,
            error: install.error.value,
          };
        }
      }
    }

    const exec = await sbx.runCode(code);
    const stdout = exec.logs.stdout.join("");
    const stderr = exec.logs.stderr.join("");
    if (exec.error) {
      return {
        stdout,
        stderr: stderr + "\n" + exec.error.name + ": " + exec.error.value + "\n" + (exec.error.traceback ?? ""),
        exit_code: 1,
        duration_ms: Date.now() - t0,
        error: exec.error.value,
      };
    }
    return { stdout, stderr, exit_code: 0, duration_ms: Date.now() - t0 };
  } catch (e: any) {
    console.error("[kora.sandbox] error", e?.message ?? e);
    return {
      stdout: "",
      stderr: `sandbox error: ${e?.message ?? String(e)}`,
      exit_code: 1,
      duration_ms: Date.now() - t0,
      error: e?.message ?? String(e),
    };
  } finally {
    if (sbx) {
      try { await sbx.kill(); } catch {}
    }
  }
}
