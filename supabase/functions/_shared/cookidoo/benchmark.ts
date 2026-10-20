/** Mesures de validité et de latence : ne jamais confondre simulation et mesure fournisseur. */
export interface BenchmarkSample {
  policy: string;
  ok: boolean;
  duration_ms: number;
  calls: number;
  input_tokens: number;
  output_tokens: number;
}

export function benchmarkSummary(samples: BenchmarkSample[]) {
  return [...new Set(samples.map((s) => s.policy))].map((policy) => {
    const rows = samples.filter((s) => s.policy === policy);
    const valid = rows.filter((s) => s.ok);
    const durations = valid.map((s) => s.duration_ms).sort((a, b) => a - b);
    const percentile = (p: number) =>
      durations.length
        ? durations[Math.max(0, Math.ceil(durations.length * p) - 1)]
        : null;
    return {
      policy,
      samples: rows.length,
      valid: valid.length,
      first_call_valid: valid.filter((s) => s.calls === 1).length,
      second_call_rate: rows.filter((s) => s.calls > 1).length / rows.length,
      valid_latency_median_ms: percentile(0.5),
      valid_latency_p95_ms: percentile(0.95),
      failed: rows.length - valid.length,
      total_input_tokens: rows.reduce((n, s) => n + s.input_tokens, 0),
      total_output_tokens: rows.reduce((n, s) => n + s.output_tokens, 0),
      // Le coût des essais échoués doit aussi compter dans le coût d'un résultat valide.
      input_tokens_per_valid: valid.length
        ? rows.reduce((n, s) => n + s.input_tokens, 0) / valid.length
        : null,
      output_tokens_per_valid: valid.length
        ? rows.reduce((n, s) => n + s.output_tokens, 0) / valid.length
        : null,
    };
  });
}
