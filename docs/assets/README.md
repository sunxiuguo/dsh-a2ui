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
