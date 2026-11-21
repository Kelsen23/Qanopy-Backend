# Similar Questions Retrieval

The production retrieval architecture is Dense v1.

The production entrypoint is `../similarQuestionsSearch.service.ts`.

The entrypoint uses `dense/` and `retrieval.types.ts` to load eligible current versions, score stored embeddings, validate candidates, and return ranked results.

## Production code

- `dense/` contains the production corpus, scoring, and eligibility validation services.
- `retrieval.types.ts` contains the shared input and candidate types used by the production seam and offline adapters.

## Offline benchmark code

- `bm25/` contains lexical retrieval used only by benchmarks.
- `splade/` contains sparse retrieval used only by benchmarks.
- `colbert/` contains multivector retrieval used only as a benchmark reference.
- `hybrid/` contains experimental fusion and candidate-expansion strategies.
- `reranker/` contains the benchmark-only Dense reranker.

Offline implementations must not be imported into application request or worker paths unless explicitly promoted.

## Evaluation

The runner is `evals/similarQuestionsRetrieval/run.ts` and defaults to `dense-v1`.

Run the production architecture with:

```bash
npm run eval:similarQuestionsRetrieval -- --dataset=dev --retrieval=dense-v1
```

Run an offline architecture only when its optional worker and configuration are installed.

Reports are written to `.eval-results/similarQuestionsRetrieval/<dataset>/<retrieval-name>/`.
