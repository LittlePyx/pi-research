# Discovery benchmark

This directory contains Pi Research's internal discovery release gate. It is
not a researcher-facing quality console.

The benchmark currently protects the two production spaces with the clearest
retrieval failures: information theory and applied mathematics. Each profile
contains representative positive papers, difficult wrong-type results,
protected subfield facets, and rotating baseline queries.

Run the deterministic replay before every release:

```sh
npm run test:discovery
```

Run the real OpenAlex/Crossref replay when network access is available:

```sh
npm run test:discovery:live
```

The live gate requires at least 80% gold-title recall, 70% top-ten direct-fit
precision, no more than 5% obvious wrong-type results, and 75% protected-facet
coverage. The production monitor consumes the same calibration definitions in
query planning, candidate prioritization, fast LLM screening, and deep LLM
review. Production yield and user feedback continue to flow through
`monitor_discovery_coverage` and adaptive branch scoring, so the protected
baseline does not disable personalization.
