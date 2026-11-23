# suasimai — Sim.ai arg-mapping fix (build)

Chứa script vá lỗi truyền tham số của Sim.ai khi agent gọi `workflow_executor`
với `inputMapping` động, và GitHub Actions workflow để build image đã vá.

## Lỗi cần vá

Khi agent (Gemini) gọi một sub-workflow (`workflow_executor`) với `inputMapping`
động, Gemini thường trả tham số **phẳng** (`{ booking, basis, ... }`) trong khi
nền tảng kỳ vọng **lồng** (`{ inputMapping: { booking, basis, ... } }`). Hàm
`mergeToolParameters` (trong `apps/sim/tools/merge-params.ts`) không nâng tham số
phẳng vào `inputMapping` → child workflow nhận input rỗng → trả
`quote_unavailable` / `INCOMPLETE`.

Bản vá (`normalizeWorkflowArguments`) thêm bước chuẩn hóa: đọc schema
`inputMapping.properties` và nâng các tham số phẳng vào `inputMapping` trước khi
chạy tool.

## Các file

- `build.cjs` — clone Sim.ai (pin commit) → áp patch → `docker build`.
- `apply.cjs` — vá `providers/utils.ts` (2 vị trí, có assert chống lệch base).
- `normalize-workflow-arguments.cjs` — hàm vá + `NORMALIZE_FN_SOURCE`.
- `normalize-workflow-arguments.test.cjs` — unit test (chạy `node --test`).
- `.github/workflows/build-sim.yml` — CI build + push image lên GHCR.

## Chạy CI (build trên cloud)

1. Đẩy repo này lên GitHub (public).
2. Tab **Actions** → chọn `build-sim-argmap-fix` → **Run workflow**.
3. Chờ build xong (~20–40 phút), image tại:
   `ghcr.io/hoanganhb680-arch/suasimai:latest`

## Chạy local (cần máy ≥ 16 GB Docker)

```sh
node build.cjs --no-srcmaps
```

**Lưu ý:** `next build` cần ~10.6 GB RAM. Máy 16 GB với Docker mặc định ~8 GB sẽ OOM.