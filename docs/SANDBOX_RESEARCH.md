# Sandbox Research Adapter

Ophanim can request source-attributed web research from a separately deployed, private sandbox service. This is optional. The main Ophanim web service does not run a browser, browser automation, scanners, or external tools for this feature.

The feature is enabled only for editions that include `sandbox_research`. Set `OPHANIM_FEATURE_FLAGS=sandbox_research` to explicitly enable it for a constrained edition, or `OPHANIM_FEATURE_FLAGS=-sandbox_research` to disable it.

Deploy the sandbox in a dedicated VM or private Render service. Give Ophanim only the sandbox's internal URL and a dedicated bearer token:

```env
AI_SANDBOX_RESEARCH_URL=http://ophanim-research-sandbox:8080
AI_SANDBOX_RESEARCH_TOKEN=use-a-long-random-value
```

The sandbox must implement `POST /v1/research` and accept this bounded request:

```json
{
  "subject": "Port disruption reports",
  "purpose": "confirm",
  "context": "optional bounded context",
  "policy": {
    "browserExecution": "sandbox_only",
    "allowOperationalActions": false,
    "requireSourceAttribution": true,
    "riskAssessmentOnly": false
  }
}
```

It must return source-attributed evidence only:

```json
{
  "summary": "Two independent reports describe the same closure.",
  "riskIndicator": "moderate",
  "uncertainty": "Coverage is incomplete.",
  "sources": [{ "title": "Primary notice", "url": "https://example.com/notice" }],
  "collectedAt": "2026-08-03T00:00:00Z",
  "limitations": ["No official confirmation found."]
}
```

The sandbox must deny private-network targets, credentialed URLs, file URLs, downloads, browser extensions, form submissions, authentication prompts, and all operational actions. It should retain only the minimum permitted research data. Ophanim displays the source URLs and treats the risk indicator as an uncertain assessment, not a prediction or automated decision.
