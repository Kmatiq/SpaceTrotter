# Draco decoder (glTF build)

`draco_wasm_wrapper_gltf.js` and `draco_decoder_gltf.wasm` are Google's [Draco](https://github.com/google/draco)
decoder, glTF branch, as redistributed with three.js (r170, `examples/jsm/libs/draco/gltf/`).
Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) (© Google LLC).

SpaceTrotter loads them on demand, in a Web Worker, to decode 3D Tiles compressed with `KHR_draco_mesh_compression`
(the City of Helsinki 3D model). Unmodified.
