# AI models

Every AI feature runs in the browser. Nothing is uploaded and no API key is needed. A model is downloaded from the Hugging Face Hub the first time its feature is used, then kept in the browser's Cache Storage, so later runs need no network.

Licences were read from the model repositories on 2026-10-12. Sizes are the files actually downloaded.

| Feature | Model | Files used | Download | Licence | Upstream |
|---|---|---|---|---|---|
| Remove Background, Fast | [BritishWerewolf/U-2-Netp](https://huggingface.co/BritishWerewolf/U-2-Netp) | `onnx/model.onnx` | 4.6 MB | Apache-2.0 | [xuebinqin/U-2-Net](https://github.com/xuebinqin/U-2-Net), ONNX export from [rembg](https://github.com/danielgatis/rembg) |
| Remove Background, Quality | [BritishWerewolf/IS-Net](https://huggingface.co/BritishWerewolf/IS-Net) | `onnx/model.onnx` | 178.6 MB | Apache-2.0 | [xuebinqin/DIS](https://github.com/xuebinqin/DIS), ONNX export from rembg |
| Select Object, WebGPU | [Xenova/slimsam-77-uniform](https://huggingface.co/Xenova/slimsam-77-uniform) | `onnx/vision_encoder.onnx`, `onnx/prompt_encoder_mask_decoder.onnx` | 39.9 MB | Apache-2.0 | [czg1225/SlimSAM](https://github.com/czg1225/SlimSAM) |
| Select Object, WASM | same | `onnx/vision_encoder_quantized.onnx`, `onnx/prompt_encoder_mask_decoder_quantized.onnx` | 13.8 MB | Apache-2.0 | same |
| Upscale 2x | [Xenova/swin2SR-lightweight-x2-64](https://huggingface.co/Xenova/swin2SR-lightweight-x2-64) | `onnx/model.onnx` | 8.1 MB | Apache-2.0 (see note) | [mv-lab/swin2sr](https://github.com/mv-lab/swin2sr) |

Note on Swin2SR: the ONNX repository has no licence field of its own. Its card names [caidas/swin2SR-lightweight-x2-64](https://huggingface.co/caidas/swin2SR-lightweight-x2-64) as the base model, which is Apache-2.0, as is the original code repository.

## Runtime

| Part | Version | Licence | Where it loads from |
|---|---|---|---|
| [Transformers.js](https://github.com/huggingface/transformers.js) (`@huggingface/transformers`) | 4.3.1 | Apache-2.0 | `dist/ai.bundle.js`, loaded on first use of an AI feature |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | bundled with Transformers.js | MIT | `dist/ort-wasm-simd-threaded.asyncify.wasm` (26.9 MB) and `.mjs`, served with the app, not from a CDN |

WebGPU is used when the browser has it, WebAssembly otherwise. Without cross-origin isolation headers (GitHub Pages does not send them) WebAssembly runs on one thread.

## Limits

- Remove Background works on a 320 px (Fast) or 1024 px (Quality) copy of the image and scales the mask back up.
- Select Object analyses a copy of at most 1024 px.
- Upscale 2x accepts images up to 1280 px on the longest side with WebGPU and 768 px with WebAssembly. Measured on an Apple GPU: about 15 s for 640x426 with WebGPU, 46 s with WebAssembly.

## Deliberately not used

| Model or package | Reason |
|---|---|
| `@imgly/background-removal` | AGPL |
| BRIA RMBG 1.4 / 2.0 | non-commercial licence |
| `onnx-community/ISNet-ONNX` | marked AGPL-3.0 |
| `Xenova/modnet` | Apache-2.0, but trained for portraits only |

Transformers.js picks a default model when none is named (for background removal that default has at times been RMBG-1.4), so every call in this project names its model.
