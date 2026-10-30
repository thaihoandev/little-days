# Background-removal components

The standalone browser worker uses `@imgly/background-removal` 1.7.0 (AGPL-3.0) and `onnxruntime-web` 1.21.0 (MIT). Original license and third-party notice texts are preserved alongside this file. This worker exchanges image Blobs and progress messages with the editor; it does not import Remotion. Little Days' Remotion linking permission does not grant an exception for third-party code.

The pinned resource manifest is `packages/background-removal/resources.json`. Build preparation downloads only the IS-Net quantized model and CPU runtime from <https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/>, checks each chunk's SHA-256 and byte length, and serves those files from the application origin. Model weights are build artifacts, not committed source.

IMG.LY's accompanying `ThirdPartyLicenses.json` declares ISNET MIT; that declaration is preserved verbatim. The upstream [DIS project](https://github.com/xuebinqin/DIS) separately describes its code/evaluation as Apache-2.0 and its dataset under separate terms. These are distinct materials: this record preserves the provider's model declaration and does not claim that it establishes a complete audit of model provenance or dataset rights. Consult the original providers before redistributing changed model assets.

User photographs and derived cutouts remain user material; these software notices do not license their content.
