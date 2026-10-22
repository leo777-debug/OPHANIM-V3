try {
  const response = await fetch('http://127.0.0.1:8080/health', { signal: AbortSignal.timeout(3000), redirect: 'error',
    headers: { Authorization: `Bearer ${process.env.SCANNER_KEY ?? ''}` } });
  await response.body?.cancel(); process.exitCode = response.ok ? 0 : 1;
} catch { process.exitCode = 1; }
