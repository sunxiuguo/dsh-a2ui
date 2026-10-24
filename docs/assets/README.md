# Synthetic preview image

`synthetic-preview.png` is a native-resolution frame at 8.5 seconds from the
project's continuous standalone browser recording. It has not been composited,
retouched or presented as the full DeepSeek Harness Web application.

- Source commit: [`a8d117041d9775347805a827d3d723a7601c1478`](https://github.com/sunxiuguo/dsh-a2ui/commit/a8d117041d9775347805a827d3d723a7601c1478)
- [Source recording](https://github.com/user-attachments/assets/4449b7b4-e0e2-45b6-af94-641660bc6743), 22.72 seconds, 1280 × 900
- [Community showcase](https://github.com/a2ui-project/a2ui/discussions/3604)
- Video SHA-256: `28835d08da6fd83323ac76a652d9efae811fe9d4854ee0ff6ac4a54a5d33f315`
- PNG SHA-256: `3d9eca8b183a7c8bb742b4ee973e2c95e445e78083c429b449f2d6a22103bd7e`

Reproduce the extraction from the named video:

```sh
ffmpeg -ss 8.5 -i dsh-a2ui-synthetic-demo.webm -frames:v 1 synthetic-preview.png
```

The data and local action are synthetic. No live model, customer data, external
service, automatic draft persistence or full DSH host acceptance is demonstrated.
See [the capture procedure](../showcase-recording.md).

## Actual native DSH host screenshots

`full-host-session-a.png` and `full-host-session-b-restored.png` are unmodified
1440×1000 screenshots from exact source a8bb06d8acdfdc9bcffb005fd34a378ec741c312,
run https://github.com/sunxiuguo/dsh-a2ui/actions/runs/40092097281.
The official rc.2 shell is real; only the model provider and workshop data are
synthetic. A shows the two surfaces and edited action preview. B shows restored
history, a stopped generation and successful recovery; the scroll position
naturally clips earlier content. No live model, account, booking or payment.
Both images were independently viewed for privacy and legibility. No token,
profile path, real account or customer data is visible.

SHA-256 A: a690cc072b7d8baaeaa65f2996eee23df6dd0553cca288381b484bbeb0eab873
SHA-256 B: af972d4b6efadfec5fae8347777be9a4b3660f98fa53a41dbe808eaf84516f23
